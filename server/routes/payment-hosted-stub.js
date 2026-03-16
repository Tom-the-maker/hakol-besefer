import { getSupabaseAdmin } from '../lib/supabase.js';
import { setCors } from '../lib/http.js';
import {
  applyCheckoutStateResult,
  buildBookCheckoutRedirect,
  readSignedCheckoutState,
} from '../lib/payment.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function renderHostedPage(stateToken, checkoutState) {
  const amount = Number(checkoutState.amount || 0) / 100;
  const currency = escapeHtml(checkoutState.currency || 'ILS');
  const productType = escapeHtml(checkoutState.productType || 'digital');
  const bookSlug = escapeHtml(checkoutState.bookSlug || '');
  const approveUrl = `/api/payment-hosted-stub?state=${encodeURIComponent(stateToken)}&decision=approve`;
  const failUrl = `/api/payment-hosted-stub?state=${encodeURIComponent(stateToken)}&decision=fail`;
  const cancelUrl = `/api/payment-hosted-stub?state=${encodeURIComponent(stateToken)}&decision=cancel`;

  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>בדיקת תשלום מדומה</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f6f1; color: #1e1f1f; margin: 0; }
      .wrap { max-width: 520px; margin: 40px auto; padding: 24px; }
      .card { background: white; border-radius: 20px; padding: 24px; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.08); }
      h1 { font-size: 28px; margin: 0 0 12px; }
      p { margin: 0 0 10px; line-height: 1.6; }
      .meta { background: #f4f8f7; border-radius: 16px; padding: 16px; margin: 18px 0; }
      .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .label { color: #5b6a67; }
      .value { font-weight: 700; direction: ltr; text-align: left; }
      .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
      .btn { display: block; text-align: center; text-decoration: none; padding: 14px 18px; border-radius: 14px; font-weight: 700; }
      .approve { background: #206f58; color: white; }
      .fail { background: #f2d7cf; color: #8f4739; }
      .cancel { background: #ededeb; color: #38413f; }
      small { display: block; color: #707976; margin-top: 16px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>עמוד תשלום מדומה</h1>
        <p>זה מסלול בדיקה פנימי כדי לסגור את זרימת ה־redirect בלי לחכות לסולק אמיתי.</p>
        <div class="meta">
          <div class="row"><span class="label">ספר</span><span class="value">${bookSlug}</span></div>
          <div class="row"><span class="label">מוצר</span><span class="value">${productType}</span></div>
          <div class="row"><span class="label">סכום</span><span class="value">${amount.toFixed(2)} ${currency}</span></div>
        </div>
        <div class="actions">
          <a class="btn approve" href="${approveUrl}">אשר תשלום</a>
          <a class="btn fail" href="${failUrl}">דמה כשלון</a>
          <a class="btn cancel" href="${cancelUrl}">בטל וחזור לאתר</a>
        </div>
        <small>הספר ייפתח רק אחרי עדכון שרת, לא רק מחזרה מהדפדפן.</small>
      </div>
    </div>
  </body>
</html>`;
}

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const stateToken = getString(req.query?.state);
  if (!stateToken) {
    return sendHtml(res, 400, '<h1>Missing payment state</h1>');
  }

  let checkoutState;
  try {
    checkoutState = readSignedCheckoutState(stateToken);
  } catch (error) {
    return sendHtml(res, 400, `<h1>Invalid payment state</h1><p>${escapeHtml(error?.message || '')}</p>`);
  }

  const decision = getString(req.query?.decision).toLowerCase();
  if (!decision) {
    return sendHtml(res, 200, renderHostedPage(stateToken, checkoutState));
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendHtml(res, 503, '<h1>Supabase server configuration is missing</h1>');
  }

  const normalizedResult = decision === 'approve'
    ? 'success'
    : decision === 'cancel'
      ? 'cancelled'
      : 'failed';

  try {
    const result = await applyCheckoutStateResult(supabase, {
      checkoutState,
      result: normalizedResult,
      providerReference: `stub:${decision}`,
    });
    return redirect(res, buildBookCheckoutRedirect(result.bookSlug, normalizedResult));
  } catch (error) {
    return sendHtml(res, 500, `<h1>Payment simulation failed</h1><p>${escapeHtml(error?.message || '')}</p>`);
  }
}
