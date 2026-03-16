import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendError, sendJson, setCors } from '../lib/http.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');

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

  const { data, error } = await supabase
    .from('system_logs')
    .select('session_id, estimated_cost_usd');

  if (error) {
    return sendError(res, 500, 'Failed to load system log stats', error.message);
  }

  const rows = data || [];
  const totalSessions = new Set(rows.map((row) => row.session_id).filter(Boolean)).size;
  const totalCost = rows.reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);

  return sendJson(res, 200, {
    totalSessions,
    totalCost,
    totalCalls: rows.length,
  });
}
