import { hasDashboardAccess } from '../lib/auth.js';
import { DASHBOARD_BOOK_SELECT, serializeDashboardBookSummary } from '../lib/books.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getNumberQuery, getStringQuery, sendError, sendJson, setCors } from '../lib/http.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  if (!hasDashboardAccess(req)) {
    return sendError(res, 403, 'Dashboard access denied');
  }

  const limit = getNumberQuery(req, 'limit', 50, 100);
  const updatedBefore = getStringQuery(req, 'updatedBefore');

  let query = supabase
    .from('books')
    .select(DASHBOARD_BOOK_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (updatedBefore) {
    query = query.lt('updated_at', updatedBefore);
  }

  const { data, error } = await query;
  if (error) {
    return sendError(res, 500, 'Failed to load dashboard books', error.message);
  }

  const books = Array.isArray(data) ? data.map((book) => serializeDashboardBookSummary(supabase, book)) : [];
  const nextCursor = books.length === limit ? books.at(-1)?.updatedAt || null : null;

  return sendJson(res, 200, {
    books,
    pagination: {
      limit,
      nextCursor,
    },
  });
}

