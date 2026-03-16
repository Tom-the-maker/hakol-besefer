import { isLocalAnalyticsEnabled } from '../lib/env.js';
import { getAuthUser } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { isLocalRequest, parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
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

  const sessionId = getString(parsed.body.session_id);
  const eventName = getString(parsed.body.event_name);
  const page = getString(parsed.body.page);
  if (!sessionId || !eventName) {
    return sendError(res, 400, 'Missing analytics event fields');
  }

  if (page.startsWith('/dev')) {
    return sendJson(res, 200, { success: true, skipped: 'dev-page' });
  }

  if (isLocalRequest(req) && !isLocalAnalyticsEnabled()) {
    return sendJson(res, 200, { success: true, skipped: 'local-runtime' });
  }

  const authUser = await getAuthUser(req, supabase);
  const { error } = await supabase
    .from('analytics_events')
    .insert({
      session_id: sessionId,
      user_id: authUser?.id || null,
      book_slug: getString(parsed.body.book_slug) || null,
      event_name: eventName,
      page: page || null,
      device_type: getString(parsed.body.device_type) || null,
      event_data: normalizeObject(parsed.body.event_data),
    });

  if (error) {
    return sendError(res, 500, 'Failed to write analytics event', error.message);
  }

  return sendJson(res, 200, { success: true });
}
