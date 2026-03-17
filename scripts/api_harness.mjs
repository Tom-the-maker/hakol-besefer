import http from 'node:http';
import { URL } from 'node:url';

import apiHandler from '../api/router.js';

function loadBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBody(rawBody, contentType) {
  if (!rawBody.length) {
    return undefined;
  }

  const text = rawBody.toString('utf8');
  if (String(contentType || '').includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  if (String(contentType || '').startsWith('text/')) {
    return text;
  }

  return rawBody;
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.headersSent && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = (payload) => {
    if (Buffer.isBuffer(payload)) {
      res.end(payload);
      return res;
    }

    if (typeof payload === 'object' && payload !== null) {
      return res.json(payload);
    }

    if (!res.headersSent && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    res.end(payload === undefined ? '' : String(payload));
    return res;
  };

  return res;
}

export async function startApiHarness({
  host = '127.0.0.1',
  port = 0,
} = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port || 80}`}`);
      req.originalUrl = req.url;
      req.query = Object.fromEntries(url.searchParams.entries());

      if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
        const rawBody = await loadBody(req);
        req.rawBody = rawBody;
        req.body = parseBody(rawBody, req.headers['content-type']);
      }

      await apiHandler(req, decorateResponse(res));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'API harness failure',
        details: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(port, host, (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${actualPort}`;

  return {
    server,
    baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    }),
  };
}
