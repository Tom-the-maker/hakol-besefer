import { createHmac, randomUUID } from 'node:crypto';

import { safeCompare } from './crypto.js';
import { getAppEnv, getDashboardApiKey, getEnv, getSupabaseServiceKey } from './env.js';

export const PRODUCTS = {
  digital: {
    name: 'ספר דיגיטלי - מהדורה מלאה',
    price: 3900,
  },
  print: {
    name: 'ספר מודפס - כריכה קשה',
    price: 14900,
  },
};

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildRequestOrigin(req) {
  const explicitOrigin = getEnv('APP_BASE_URL');
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/+$/g, '');
  }

  const forwardedProto = getString(req.headers?.['x-forwarded-proto']) || 'http';
  const forwardedHost = getString(req.headers?.['x-forwarded-host']);
  const host = forwardedHost || getString(req.headers?.host) || 'localhost:3000';
  return `${forwardedProto}://${host}`.replace(/\/+$/g, '');
}

function getPaymentStateSecret() {
  return (
    getEnv('PAYMENT_STATE_SECRET') ||
    getDashboardApiKey() ||
    getSupabaseServiceKey()
  );
}

function createStateSignature(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('hex');
}

export function getPaymentProvider() {
  return getEnv('PAYMENT_PROVIDER', 'demo').trim().toLowerCase() || 'demo';
}

export function createSignedCheckoutState(payload) {
  const secret = getPaymentStateSecret();
  if (!secret) {
    throw new Error('Payment state secret is not configured');
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createStateSignature(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function readSignedCheckoutState(token) {
  const normalized = getString(token);
  const separatorIndex = normalized.lastIndexOf('.');
  if (separatorIndex <= 0) {
    throw new Error('Invalid checkout state');
  }

  const encodedPayload = normalized.slice(0, separatorIndex);
  const providedSignature = normalized.slice(separatorIndex + 1);
  const secret = getPaymentStateSecret();
  if (!secret) {
    throw new Error('Payment state secret is not configured');
  }

  const expectedSignature = createStateSignature(encodedPayload, secret);
  if (!safeCompare(providedSignature, expectedSignature)) {
    throw new Error('Invalid checkout state signature');
  }

  const rawPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  return JSON.parse(rawPayload);
}

export function buildCheckoutSession({
  req,
  provider,
  book,
  productType,
  pricedProduct,
  coupon,
}) {
  const checkoutId = randomUUID();
  const origin = buildRequestOrigin(req);
  const state = createSignedCheckoutState({
    checkoutId,
    appEnv: getAppEnv(),
    provider,
    bookId: book.id,
    bookSlug: book.slug,
    productType,
    amount: pricedProduct.price,
    currency: 'ILS',
    couponCode: coupon?.code || null,
    createdAt: new Date().toISOString(),
  });

  return {
    checkoutId,
    state,
    origin,
    amount: pricedProduct.price,
    currency: 'ILS',
    returnUrl: `${origin}/api/payment-return?state=${encodeURIComponent(state)}`,
    webhookUrl: `${origin}/api/payment-webhook`,
    hostedStubUrl: `${origin}/api/payment-hosted-stub?state=${encodeURIComponent(state)}`,
  };
}

export function buildBookCheckoutRedirect(bookSlug, status = 'returned') {
  const slug = encodeURIComponent(getString(bookSlug));
  const checkout = encodeURIComponent(getString(status) || 'returned');
  return `/book/${slug}?checkout=${checkout}`;
}

export async function logPaymentEvent(supabase, {
  sessionId,
  bookSlug,
  status,
  stage,
  actionType,
  amount,
  provider,
  productType,
  couponCode,
  checkoutId,
  providerReference,
  error,
}) {
  if (!supabase) {
    return;
  }

  try {
    await supabase.from('system_logs').insert({
      session_id: sessionId || `payment:${checkoutId || bookSlug || 'unknown'}`,
      book_slug: bookSlug || null,
      action_type: actionType || 'payment',
      stage: stage || null,
      status,
      metadata: {
        provider: provider || null,
        product_type: productType || null,
        coupon_code: couponCode || null,
        checkout_id: checkoutId || null,
        provider_reference: providerReference || null,
        amount_ils_agorot: Number.isFinite(amount) ? amount : null,
        error: error || null,
      },
    });
  } catch {
    // Payment logging is best-effort and must not block checkout.
  }
}

async function incrementCouponUsage(supabase, couponCode) {
  const code = getString(couponCode).toUpperCase();
  if (!code) {
    return;
  }

  const { data: currentCoupon } = await supabase
    .from('coupons')
    .select('current_uses')
    .eq('code', code)
    .maybeSingle();

  const currentUses = Number(currentCoupon?.current_uses) || 0;
  try {
    await supabase
      .from('coupons')
      .update({ current_uses: currentUses + 1 })
      .eq('code', code);
  } catch {
    // Coupon usage increment is best-effort.
  }
}

export async function applyCheckoutStateResult(supabase, {
  checkoutState,
  result,
  providerReference,
}) {
  const { data: book, error } = await supabase
    .from('books')
    .select('id, slug, session_id, payment_status, is_unlocked')
    .eq('id', checkoutState.bookId)
    .eq('slug', checkoutState.bookSlug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load book for payment result: ${error.message}`);
  }

  if (!book) {
    throw new Error('Book not found for payment result');
  }

  const alreadyPaid = book.is_unlocked || book.payment_status === 'paid';
  if (result === 'success') {
    if (!alreadyPaid) {
      const { error: updateError } = await supabase
        .from('books')
        .update({
          is_unlocked: true,
          payment_status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', book.id);

      if (updateError) {
        throw new Error(`Failed to mark book as paid: ${updateError.message}`);
      }

      await incrementCouponUsage(supabase, checkoutState.couponCode);
    }

    await logPaymentEvent(supabase, {
      sessionId: book.session_id,
      bookSlug: book.slug,
      status: 'success',
      stage: 'payment_completed',
      actionType: 'payment_complete',
      amount: checkoutState.amount,
      provider: checkoutState.provider,
      productType: checkoutState.productType,
      couponCode: checkoutState.couponCode,
      checkoutId: checkoutState.checkoutId,
      providerReference,
    });

    return {
      bookSlug: book.slug,
      status: 'paid',
      isUnlocked: true,
      alreadyPaid,
    };
  }

  if (!alreadyPaid) {
    const nextStatus = result === 'cancelled' ? 'pending' : 'failed';
    const { error: updateError } = await supabase
      .from('books')
      .update({
        payment_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', book.id);

    if (updateError) {
      throw new Error(`Failed to update failed payment status: ${updateError.message}`);
    }
  }

  await logPaymentEvent(supabase, {
    sessionId: book.session_id,
    bookSlug: book.slug,
    status: result === 'cancelled' ? 'pending' : 'error',
    stage: result === 'cancelled' ? 'payment_cancelled' : 'payment_failed',
    actionType: result === 'cancelled' ? 'payment_cancelled' : 'payment_failed',
    amount: checkoutState.amount,
    provider: checkoutState.provider,
    productType: checkoutState.productType,
    couponCode: checkoutState.couponCode,
    checkoutId: checkoutState.checkoutId,
    providerReference,
  });

  return {
    bookSlug: book.slug,
    status: result === 'cancelled' ? 'pending' : 'failed',
    isUnlocked: alreadyPaid,
    alreadyPaid,
  };
}
