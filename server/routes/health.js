import { getServerConfiguration } from '../lib/env.js';
import { sendJson, setCors } from '../lib/http.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return sendJson(res, 200, {
    ok: true,
    ...getServerConfiguration(),
  });
}

