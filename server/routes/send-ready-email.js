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
    return sendError(res, 400, 'Invalid JSON body');
  }

  const email = getString(parsed.body.email).toLowerCase();
  const bookSlug = getString(parsed.body.bookSlug);
  const bookTitle = getString(parsed.body.bookTitle);
  if (!email || !bookSlug) {
    return sendError(res, 400, 'Missing email or bookSlug');
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase
        .from('analytics_events')
        .insert({
          session_id: 'system',
          book_slug: bookSlug,
          event_name: 'ready_email_requested',
          page: '/api/send-ready-email',
          device_type: 'server',
          event_data: {
            email,
            bookTitle: bookTitle || null,
          },
        });
    } catch {
      // Ignore telemetry failures for this noop endpoint.
    }
  }

  return sendJson(res, 200, { success: true });
}
