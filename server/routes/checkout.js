import { getAuthUser } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { hashAccessToken } from '../lib/crypto.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';
import {
  PRODUCTS,
  applyCheckoutStateResult,
  buildCheckoutSession,
  getPaymentProvider,
  logPaymentEvent,
} from '../lib/payment.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizeCouponCode(value) {
  return getString(value).toUpperCase();
}

function isBookOwner(book, authUser, accessToken) {
  const providedTokenHash = getString(accessToken) ? hashAccessToken(accessToken) : '';
  const normalizedBookEmail = normalizeEmail(book?.email);
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  return Boolean(
    (providedTokenHash && book?.access_token_hash === providedTokenHash) ||
      (authUser &&
        ((book?.user_id && book.user_id === authUser.id) ||
          (normalizedBookEmail && normalizedAuthEmail && normalizedBookEmail === normalizedAuthEmail))),
  );
}

async function resolveCoupon(supabase, couponCode, product) {
  const code = normalizeCouponCode(couponCode);
  if (!code) {
    return { product, coupon: null };
  }

  const { data, error } = await supabase
    .from('coupons')
    .select('code, discount_percent, is_active, expires_at, max_uses, current_uses')
    .eq('code', code)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return { product, coupon: null };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { product, coupon: null };
  }

  if (data.max_uses !== null && data.current_uses >= data.max_uses) {
    return { product, coupon: null };
  }

  const discountPercent = Math.max(0, Math.min(100, Number(data.discount_percent) || 0));
  const discountedPrice = Math.max(0, Math.round((product.price * (100 - discountPercent)) / 100));

  return {
    product: {
      ...product,
      price: discountedPrice,
    },
    coupon: {
      code,
      discountPercent,
    },
  };
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const productType = getString(parsed.body.productType);
  const bookSlug = getString(parsed.body.bookSlug);
  const accessToken = getString(parsed.body.access_token);
  const product = PRODUCTS[productType];

  if (!product || !bookSlug) {
    return sendError(res, 400, 'Missing productType or bookSlug');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  const authUser = await getAuthUser(req, supabase);
  const { data: book, error } = await supabase
    .from('books')
    .select('id, slug, session_id, email, user_id, access_token_hash, payment_status, is_unlocked')
    .eq('slug', bookSlug)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, 'Failed to validate book', error.message);
  }

  if (!book) {
    return sendError(res, 404, 'Book not found');
  }

  if (!isBookOwner(book, authUser, accessToken)) {
    return sendError(res, 403, 'Not authorized for this book');
  }

  if (book.is_unlocked || book.payment_status === 'paid') {
    return sendError(res, 409, 'Book already paid');
  }

  const { product: pricedProduct, coupon } = await resolveCoupon(supabase, parsed.body.couponCode, product);
  const provider = getPaymentProvider();

  if (provider === 'demo' || !provider) {
    const session = buildCheckoutSession({
      req,
      provider: 'demo',
      book,
      productType,
      pricedProduct,
      coupon,
    });
    await applyCheckoutStateResult(supabase, {
      checkoutState: {
        checkoutId: session.checkoutId,
        provider: 'demo',
        bookId: book.id,
        bookSlug: book.slug,
        amount: pricedProduct.price,
        productType,
        couponCode: coupon?.code || null,
      },
      result: 'success',
      providerReference: 'demo-auto-unlock',
    });

    return sendJson(res, 200, {
      provider: 'demo',
      productType,
      amount: pricedProduct.price,
      currency: 'ILS',
    });
  }

  if (provider === 'stub_redirect') {
    const session = buildCheckoutSession({
      req,
      provider,
      book,
      productType,
      pricedProduct,
      coupon,
    });

    await logPaymentEvent(supabase, {
      sessionId: book.session_id,
      bookSlug: book.slug,
      status: 'pending',
      stage: 'payment_checkout_started',
      actionType: 'payment_start',
      amount: pricedProduct.price,
      provider,
      productType,
      couponCode: coupon?.code || null,
      checkoutId: session.checkoutId,
    });

    return sendJson(res, 200, {
      provider,
      productType,
      amount: session.amount,
      currency: session.currency,
      paymentUrl: session.hostedStubUrl,
      returnUrl: session.returnUrl,
      webhookUrl: session.webhookUrl,
      checkoutId: session.checkoutId,
    });
  }

  return sendError(
    res,
    503,
    'Payment provider is not configured yet',
    `PAYMENT_PROVIDER=${provider}`,
  );
}
