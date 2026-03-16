import { getAuthUser } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { hashAccessToken } from '../lib/crypto.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';
import { getEnv } from '../lib/env.js';

const PRODUCTS = {
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
    .select('id, slug, email, user_id, access_token_hash, payment_status, is_unlocked')
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
  const provider = getEnv('PAYMENT_PROVIDER', 'demo');

  if (provider === 'demo' || !provider) {
    const updatePayload = {
      is_unlocked: true,
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('books')
      .update(updatePayload)
      .eq('id', book.id);

    if (updateError) {
      return sendError(res, 500, 'Failed to update payment status', updateError.message);
    }

    if (coupon?.code) {
      const { data: currentCoupon } = await supabase
        .from('coupons')
        .select('current_uses')
        .eq('code', coupon.code)
        .maybeSingle();

      const currentUses = Number(currentCoupon?.current_uses) || 0;
      try {
        await supabase
          .from('coupons')
          .update({ current_uses: currentUses + 1 })
          .eq('code', coupon.code);
      } catch {
        // Coupon usage increments are best-effort in demo mode.
      }
    }

    return sendJson(res, 200, {
      provider: 'demo',
      productType,
      amount: pricedProduct.price,
      currency: 'ILS',
    });
  }

  return sendError(res, 501, 'Real payment providers are not configured yet');
}
