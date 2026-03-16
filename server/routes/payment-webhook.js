import { getEnv } from '../lib/env.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { applyCheckoutStateResult, readSignedCheckoutState } from '../lib/payment.js';
import { safeCompare } from '../lib/crypto.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isWebhookAuthorized(req) {
  const configuredSecret = getEnv('PAYMENT_WEBHOOK_SECRET');
  if (!configuredSecret) {
    return true;
  }

  const providedSecret = getString(req.headers?.['x-payment-webhook-secret']);
  return safeCompare(providedSecret, configuredSecret);
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  if (!isWebhookAuthorized(req)) {
    return sendError(res, 403, 'Invalid payment webhook secret');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const stateToken = getString(parsed.body.state);
  const rawStatus = getString(parsed.body.status).toLowerCase();
  const providerReference = getString(parsed.body.providerReference || parsed.body.reference);

  if (!stateToken) {
    return sendError(res, 400, 'Missing state');
  }

  let checkoutState;
  try {
    checkoutState = readSignedCheckoutState(stateToken);
  } catch (error) {
    return sendError(res, 400, 'Invalid state', error?.message);
  }

  const normalizedResult =
    rawStatus === 'success' || rawStatus === 'paid' || rawStatus === 'approved'
      ? 'success'
      : rawStatus === 'cancelled' || rawStatus === 'canceled'
        ? 'cancelled'
        : 'failed';

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  try {
    const result = await applyCheckoutStateResult(supabase, {
      checkoutState,
      result: normalizedResult,
      providerReference,
    });

    return sendJson(res, 200, {
      ok: true,
      payment_status: result.status,
      is_unlocked: result.isUnlocked,
      already_paid: result.alreadyPaid,
      book_slug: result.bookSlug,
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to apply payment webhook', error?.message);
  }
}
