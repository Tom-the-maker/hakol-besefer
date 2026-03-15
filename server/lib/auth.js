import { getDashboardApiKey } from './env.js';
import { safeCompare } from './crypto.js';

export function getBearerToken(req) {
  const authorization = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';

  if (!authorization.startsWith('Bearer ')) {
    return '';
  }

  return authorization.slice(7).trim();
}

export async function getAuthUser(req, supabase) {
  const jwt = getBearerToken(req);
  if (!jwt) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error) {
    return null;
  }

  return data?.user || null;
}

export function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase();
}

export function hasDashboardAccess(req) {
  const expectedKey = getDashboardApiKey();
  if (!expectedKey) {
    return false;
  }

  const candidateKey = typeof req.headers['x-dashboard-key'] === 'string'
    ? req.headers['x-dashboard-key'].trim()
    : '';

  return Boolean(candidateKey) && safeCompare(candidateKey, expectedKey);
}

