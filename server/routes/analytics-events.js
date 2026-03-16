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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const sessionIds = Array.isArray(parsed.body.session_ids)
    ? parsed.body.session_ids.map((value) => getString(value)).filter(Boolean).slice(0, 500)
    : [];

  if (sessionIds.length === 0) {
    return sendJson(res, 200, { events: [] });
  }

  const { data, error } = await supabase
    .from('analytics_events')
    .select('session_id, event_name, event_data, page, device_type, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true })
    .limit(20000);

  if (error) {
    return sendError(res, 500, 'Failed to load analytics events', error.message);
  }

  return sendJson(res, 200, {
    events: data || [],
  });
}
