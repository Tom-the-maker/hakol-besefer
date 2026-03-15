export function setCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Dashboard-Key');
}

export function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

export function sendError(res, statusCode, error, details) {
  return sendJson(res, statusCode, {
    error,
    ...(details ? { details } : {}),
  });
}

export function getStringQuery(req, name) {
  const value = req.query?.[name];
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export function getNumberQuery(req, name, defaultValue, maxValue) {
  const rawValue = getStringQuery(req, name);
  const normalized = Number.parseInt(rawValue || String(defaultValue), 10);
  if (!Number.isFinite(normalized) || normalized < 1) {
    return defaultValue;
  }

  if (typeof maxValue === 'number') {
    return Math.min(normalized, maxValue);
  }

  return normalized;
}

export function parseJsonBody(req) {
  if (req.body == null) {
    return { ok: true, body: {} };
  }

  if (typeof req.body === 'string') {
    try {
      return { ok: true, body: JSON.parse(req.body) };
    } catch {
      return { ok: false, body: {} };
    }
  }

  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return { ok: true, body: req.body };
  }

  return { ok: false, body: {} };
}

