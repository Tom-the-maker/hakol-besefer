import assert from 'node:assert/strict';

import { startApiHarness } from './api_harness.mjs';
import {
  createTinyImageDataUrl,
  ensureLabEnvironment,
  getAnonSupabase,
  getServiceSupabase,
  removeBookArtifacts,
} from './lab_test_helpers.mjs';

ensureLabEnvironment();

const serviceSupabase = getServiceSupabase();
const anonSupabase = getAnonSupabase();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
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

async function run() {
  const unique = Date.now().toString(36);
  const primarySlug = `smoke-auth-${unique}`;
  const claimSlug = `smoke-claim-${unique}`;
  const email = `hakol-auth-${unique}@example.com`;
  const password = `Hakol!${unique}123`;

  let createdUserId = '';
  const cleanupSlugs = [primarySlug, claimSlug];
  const harness = await startApiHarness();

  try {
    const { data: createdUser, error: createUserError } = await serviceSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.equal(createUserError, null, createUserError?.message || 'Failed to create auth user');
    createdUserId = createdUser.user?.id || '';
    assert.ok(createdUserId, 'Expected created auth user id');

    const { data: signedIn, error: signInError } = await anonSupabase.auth.signInWithPassword({
      email,
      password,
    });
    assert.equal(signInError, null, signInError?.message || 'Failed to sign in temp auth user');
    const accessToken = signedIn.session?.access_token || '';
    assert.ok(accessToken, 'Expected access token from temp auth user');

    const createPrimary = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        book: {
          slug: primarySlug,
          access_token: `11111111-1111-4111-8111-${unique.slice(-12).padStart(12, '0')}`,
          session_id: `session-${primarySlug}`,
          title: 'בדיקת בעלות',
          hero_name: 'נועה',
          topic: 'בדיקת בעלות',
          art_style: 'pixar',
          email,
          segments: Array.from({ length: 10 }, (_, index) => `קטע ${index + 1}`),
          composite_image_url: createTinyImageDataUrl(),
          payment_status: 'pending',
          is_unlocked: false,
        },
      }),
    });
    assert.equal(createPrimary.response.status, 200, JSON.stringify(createPrimary.payload));
    const primaryBookToken = createPrimary.payload?.access_token;
    assert.ok(primaryBookToken, 'Expected primary access token');

    const listByToken = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list_owned',
        owned_books: [{ slug: primarySlug, access_token: primaryBookToken }],
      }),
    });
    assert.equal(listByToken.response.status, 200, JSON.stringify(listByToken.payload));
    assert.equal(Array.isArray(listByToken.payload?.books), true, 'Expected books array for token ownership');
    assert.equal(listByToken.payload.books.length, 1, 'Expected token-owned book before auth link');

    const linkByEmail = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action: 'link_by_email' }),
    });
    assert.equal(linkByEmail.response.status, 200, JSON.stringify(linkByEmail.payload));
    assert.equal(Number(linkByEmail.payload?.linked_count) >= 1, true, 'Expected at least one linked book');

    const listByAuth = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'list_owned',
        owned_books: [],
      }),
    });
    assert.equal(listByAuth.response.status, 200, JSON.stringify(listByAuth.payload));
    assert.equal(listByAuth.payload.books.some((book) => book.slug === primarySlug), true, 'Expected linked book in auth-only list');

    const createClaimTarget = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        book: {
          slug: claimSlug,
          access_token: `22222222-2222-4222-8222-${unique.slice(-12).padStart(12, '0')}`,
          session_id: `session-${claimSlug}`,
          title: 'בדיקת claim',
          hero_name: 'אורי',
          topic: 'בדיקת claim',
          art_style: 'pixar',
          segments: Array.from({ length: 10 }, (_, index) => `בדיקת claim ${index + 1}`),
          composite_image_url: createTinyImageDataUrl(),
          payment_status: 'pending',
          is_unlocked: false,
        },
      }),
    });
    assert.equal(createClaimTarget.response.status, 200, JSON.stringify(createClaimTarget.payload));
    const claimToken = createClaimTarget.payload?.access_token;
    assert.ok(claimToken, 'Expected claim target access token');

    const claimBook = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'claim',
        slug: claimSlug,
        email,
        access_token: claimToken,
      }),
    });
    assert.equal(claimBook.response.status, 200, JSON.stringify(claimBook.payload));
    assert.ok(claimBook.payload?.access_token, 'Expected claim response token');

    const linkedBooksAfterClaim = await requestJson(`${harness.baseUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: 'list_owned',
        owned_books: [],
      }),
    });
    assert.equal(linkedBooksAfterClaim.response.status, 200, JSON.stringify(linkedBooksAfterClaim.payload));
    const slugs = linkedBooksAfterClaim.payload.books.map((book) => book.slug);
    assert.equal(slugs.includes(primarySlug), true, 'Expected primary slug after email link');
    assert.equal(slugs.includes(claimSlug), true, 'Expected claimed slug in auth-owned books');

    const { data: primaryRecord } = await serviceSupabase
      .from('books')
      .select('user_id, email')
      .eq('slug', primarySlug)
      .maybeSingle();
    assert.equal(primaryRecord?.user_id, createdUserId, 'Expected primary book linked to auth user');
    assert.equal(primaryRecord?.email, email, 'Expected primary book email preserved');

    const { data: claimRecord } = await serviceSupabase
      .from('books')
      .select('user_id, email')
      .eq('slug', claimSlug)
      .maybeSingle();
    assert.equal(claimRecord?.user_id, createdUserId, 'Expected claimed book linked to auth user');
    assert.equal(claimRecord?.email, email, 'Expected claimed book email set from auth claim');

    console.log('smoke_auth_ownership: ok');
  } finally {
    await Promise.all(cleanupSlugs.map((slug) => removeBookArtifacts(serviceSupabase, slug).catch(() => {})));
    if (createdUserId) {
      const ownershipSessionId = `ownership:${createdUserId}`;
      let deleteResult = await serviceSupabase
        .from('system_logs')
        .delete({ count: 'exact' })
        .eq('session_id', ownershipSessionId);

      if (!deleteResult.error && Number(deleteResult.count || 0) === 0) {
        await sleep(250);
        deleteResult = await serviceSupabase
          .from('system_logs')
          .delete({ count: 'exact' })
          .eq('session_id', ownershipSessionId);
      }

      if (deleteResult.error) {
        throw deleteResult.error;
      }

      await serviceSupabase.auth.admin.deleteUser(createdUserId).catch(() => {});
    }
    await harness.close();
  }
}

await run();
