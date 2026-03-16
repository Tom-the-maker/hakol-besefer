import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendError, sendJson, setCors } from '../lib/http.js';

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

  const { data, error } = await supabase.rpc('get_system_log_stats');

  if (error) {
    return sendError(res, 500, 'Failed to load system log stats', error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return sendJson(res, 200, {
    totalSessions: Number(row?.total_sessions) || 0,
    totalCost: Number(row?.total_cost) || 0,
    totalCalls: Number(row?.total_calls) || 0,
  });
}
