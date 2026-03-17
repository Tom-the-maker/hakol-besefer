import assert from 'node:assert/strict';

import { startApiHarness } from './api_harness.mjs';
import {
  createTinyImageDataUrl,
  ensureLabEnvironment,
  getServiceSupabase,
  removeBookArtifacts,
} from './lab_test_helpers.mjs';

ensureLabEnvironment();

const serviceSupabase = getServiceSupabase();

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

async function createBook(baseUrl, slug, token, email = '') {
  const result = await request(`${baseUrl}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      book: {
        slug,
        access_token: token,
        session_id: `session-${slug}`,
        title: `בדיקת תשלום ${slug}`,
        hero_name: 'נועה',
        topic: 'בדיקת תשלום',
        art_style: 'pixar',
        email: email || undefined,
        segments: Array.from({ length: 10 }, (_, index) => `תשלום ${index + 1}`),
        composite_image_url: createTinyImageDataUrl(),
        payment_status: 'pending',
        is_unlocked: false,
      },
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return result.payload?.access_token;
}

async function startCheckout(baseUrl, slug, token) {
  const result = await request(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productType: 'digital',
      bookSlug: slug,
      access_token: token,
    }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload?.provider, 'stub_redirect');
  assert.ok(result.payload?.paymentUrl, 'Expected hosted payment URL');
  return result.payload;
}

async function readPaymentStatus(baseUrl, slug) {
  const result = await request(`${baseUrl}/api/payment-status?slug=${encodeURIComponent(slug)}`);
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return result.payload;
}

async function assertRedirect(url, expectedCheckoutState) {
  const response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 302, `Expected redirect for ${url}`);
  const location = response.headers.get('location') || '';
  assert.equal(location.includes(`checkout=${expectedCheckoutState}`), true, `Expected redirect to checkout=${expectedCheckoutState}, got ${location}`);
  return location;
}

async function verifyLogs(slug, expectedActions) {
  const { data, error } = await serviceSupabase
    .from('system_logs')
    .select('action_type, stage, status, metadata')
    .eq('book_slug', slug)
    .order('id', { ascending: true });

  assert.equal(error, null, error?.message || 'Failed to read payment system logs');
  const actualActions = (data || []).map((entry) => entry.action_type);
  assert.deepEqual(actualActions, expectedActions);
}

async function run() {
  process.env.PAYMENT_PROVIDER = 'stub_redirect';

  const unique = Date.now().toString(36);
  const successSlug = `smoke-pay-ok-${unique}`;
  const failSlug = `smoke-pay-fail-${unique}`;
  const cancelSlug = `smoke-pay-cancel-${unique}`;
  const slugs = [successSlug, failSlug, cancelSlug];
  const harness = await startApiHarness();

  try {
    const successToken = await createBook(harness.baseUrl, successSlug, `33333333-3333-4333-8333-${unique.slice(-12).padStart(12, '0')}`);
    const failToken = await createBook(harness.baseUrl, failSlug, `44444444-4444-4444-8444-${unique.slice(-12).padStart(12, '0')}`);
    const cancelToken = await createBook(harness.baseUrl, cancelSlug, `55555555-5555-4555-8555-${unique.slice(-12).padStart(12, '0')}`);

    const successCheckout = await startCheckout(harness.baseUrl, successSlug, successToken);
    const failCheckout = await startCheckout(harness.baseUrl, failSlug, failToken);
    const cancelCheckout = await startCheckout(harness.baseUrl, cancelSlug, cancelToken);

    const successStatusBefore = await readPaymentStatus(harness.baseUrl, successSlug);
    assert.equal(successStatusBefore.payment_status, 'pending');
    assert.equal(successStatusBefore.is_unlocked, false);

    await assertRedirect(`${successCheckout.paymentUrl}&decision=approve`, 'success');
    await assertRedirect(`${failCheckout.paymentUrl}&decision=fail`, 'failed');
    await assertRedirect(`${cancelCheckout.paymentUrl}&decision=cancel`, 'cancelled');

    const successStatusAfter = await readPaymentStatus(harness.baseUrl, successSlug);
    assert.equal(successStatusAfter.payment_status, 'paid');
    assert.equal(successStatusAfter.is_unlocked, true);

    const failStatusAfter = await readPaymentStatus(harness.baseUrl, failSlug);
    assert.equal(failStatusAfter.payment_status, 'failed');
    assert.equal(failStatusAfter.is_unlocked, false);

    const cancelStatusAfter = await readPaymentStatus(harness.baseUrl, cancelSlug);
    assert.equal(cancelStatusAfter.payment_status, 'pending');
    assert.equal(cancelStatusAfter.is_unlocked, false);

    const loadedSuccessBook = await request(`${harness.baseUrl}/api/book?slug=${encodeURIComponent(successSlug)}&token=${encodeURIComponent(successToken)}`);
    assert.equal(loadedSuccessBook.response.status, 200, JSON.stringify(loadedSuccessBook.payload));
    assert.equal(loadedSuccessBook.payload?.is_unlocked, true);
    assert.equal(Array.isArray(loadedSuccessBook.payload?.segments), true);
    assert.equal(loadedSuccessBook.payload.segments.length, 10);

    await verifyLogs(successSlug, ['payment_start', 'payment_complete']);
    await verifyLogs(failSlug, ['payment_start', 'payment_failed']);
    await verifyLogs(cancelSlug, ['payment_start', 'payment_cancelled']);

    console.log('smoke_stub_payment_flow: ok');
  } finally {
    await Promise.all(slugs.map((slug) => removeBookArtifacts(serviceSupabase, slug).catch(() => {})));
    await harness.close();
  }
}

await run();
