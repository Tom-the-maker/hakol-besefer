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

  return sendJson(res, 200, {
    success: true,
    queued: false,
    reason: 'email_provider_not_configured',
    meta: {
      bookSlug,
      hasBookTitle: Boolean(bookTitle),
      hasEmail: Boolean(email),
    },
  });
}
