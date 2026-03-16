import { getSupabaseAdmin } from '../lib/supabase.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    return sendJson(res, 400, { valid: false, message: 'בקשה לא תקינה' });
  }

  const code = getString(parsed.body.code).toUpperCase();
  if (code.length < 2) {
    return sendJson(res, 400, { valid: false, message: 'קוד קופון לא תקין' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendJson(res, 500, { valid: false, message: 'שגיאת שרת' });
  }

  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('discount_percent, is_active, expires_at, max_uses, current_uses')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !coupon) {
    return sendJson(res, 200, { valid: false, message: 'קוד קופון לא נמצא' });
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return sendJson(res, 200, { valid: false, message: 'הקופון פג תוקף' });
  }

  if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
    return sendJson(res, 200, { valid: false, message: 'הקופון מוצה' });
  }

  return sendJson(res, 200, {
    valid: true,
    discount_percent: coupon.discount_percent,
    message: `הנחה של ${coupon.discount_percent}% הופעלה!`,
  });
}
