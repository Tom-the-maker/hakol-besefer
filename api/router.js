import healthHandler from '../server/routes/health.js';
import booksHandler from '../server/routes/books.js';
import dashboardBooksHandler from '../server/routes/dashboard-books.js';
import dashboardSessionHandler from '../server/routes/dashboard-session.js';

const HANDLERS = {
  health: healthHandler,
  books: booksHandler,
  'dashboard-books': dashboardBooksHandler,
  'dashboard-session': dashboardSessionHandler,
};

function extractEndpoint(req) {
  if (typeof req.query?.endpoint === 'string' && req.query.endpoint.trim()) {
    return req.query.endpoint.trim();
  }

  const url = typeof req.url === 'string' ? req.url : '';
  const match = url.match(/^\/api\/([^/?#]+)/);
  if (match?.[1]) {
    return match[1];
  }

  return '';
}

export default async function handler(req, res) {
  const endpoint = extractEndpoint(req);
  const target = HANDLERS[endpoint];

  if (!target) {
    return res.status(404).json({ error: 'Unknown API endpoint', endpoint });
  }

  return target(req, res);
}

