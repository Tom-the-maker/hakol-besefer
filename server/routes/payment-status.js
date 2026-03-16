import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  const slug = getString(req.query?.slug);
  if (!slug) {
    return sendError(res, 400, 'Missing slug query param');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  const { data, error } = await supabase
    .from('books')
    .select('is_unlocked, payment_status')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) {
    return sendError(res, 404, 'Book not found');
  }

  return sendJson(res, 200, {
    is_unlocked: Boolean(data.is_unlocked),
    payment_status: data.payment_status || 'pending',
  });
}
