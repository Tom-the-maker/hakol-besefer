import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { appendSystemLog } from '../lib/system-log.js';
import { sendReadyEmail } from '../lib/email.js';

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

  const result = await sendReadyEmail({
    email,
    bookSlug,
    bookTitle,
  });

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: book } = await supabase
      .from('books')
      .select('session_id')
      .eq('slug', bookSlug)
      .maybeSingle();

    await appendSystemLog(supabase, {
      sessionId: book?.session_id || `email:${bookSlug}`,
      bookSlug,
      actionType: 'send_ready_email',
      stage: result.success ? 'email_request_recorded' : 'email_request_failed',
      status: result.success ? 'success' : 'error',
      metadata: {
        provider: result.provider,
        queued: result.queued,
        reason: result.reason,
        has_book_title: Boolean(bookTitle),
        has_email: Boolean(email),
      },
    });
  }

  return sendJson(res, result.success ? 200 : 503, result);
}
