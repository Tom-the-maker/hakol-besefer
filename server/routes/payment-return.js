import { setCors } from '../lib/http.js';
import { buildBookCheckoutRedirect, readSignedCheckoutState } from '../lib/payment.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
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
    res.statusCode = 400;
    res.end('Missing payment state');
    return;
  }

  let checkoutState;
  try {
    checkoutState = readSignedCheckoutState(stateToken);
  } catch {
    res.statusCode = 400;
    res.end('Invalid payment state');
    return;
  }

  const rawStatus = getString(req.query?.status).toLowerCase();
  const checkoutStatus =
    rawStatus === 'success' ? 'success'
      : rawStatus === 'failed' ? 'failed'
        : rawStatus === 'cancelled' ? 'cancelled'
          : 'returned';

  return redirect(res, buildBookCheckoutRedirect(checkoutState.bookSlug, checkoutStatus));
}
