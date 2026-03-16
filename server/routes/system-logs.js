import { SYSTEM_LOG_WITH_PROMPT_SELECT } from '../lib/books.js';
import { serializeDashboardSystemLog } from '../lib/dashboard.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getStringQuery, sendError, sendJson, setCors } from '../lib/http.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  const sessionId = getStringQuery(req, 'sessionId');
  if (!sessionId) {
    return sendError(res, 400, 'Missing sessionId query param');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  const { data, error } = await supabase
    .from('system_logs')
    .select(SYSTEM_LOG_WITH_PROMPT_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    return sendError(res, 500, 'Failed to load system logs', error.message);
  }

  return sendJson(res, 200, {
    logs: Array.isArray(data) ? data.map((row) => serializeDashboardSystemLog(row)) : [],
  });
}
