import { URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type ApiRequest = IncomingMessage & {
    body?: unknown;
    rawBody?: Buffer;
    query?: Record<string, string>;
    originalUrl?: string;
};

type ApiResponse = ServerResponse<IncomingMessage> & {
    status?: (code: number) => ApiResponse;
    json?: (payload: unknown) => ApiResponse;
    send?: (payload: unknown) => ApiResponse;
};

function loadBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function parseBody(rawBody: Buffer, contentType: string): unknown {
    if (!rawBody.length) return undefined;

    const text = rawBody.toString('utf8');
    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    if (contentType.startsWith('text/')) {
        return text;
    }

    return rawBody;
}

function decorateResponse(res: ApiResponse): ApiResponse {
    if (!res.status) {
        res.status = (code: number) => {
            res.statusCode = code;
            return res;
        };
    }

    if (!res.json) {
        res.json = (payload: unknown) => {
            if (!res.headersSent && !res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify(payload));
            return res;
        };
    }

    if (!res.send) {
        res.send = (payload: unknown) => {
            if (Buffer.isBuffer(payload)) {
                res.end(payload);
                return res;
            }

            if (typeof payload === 'object' && payload !== null) {
                return res.json!(payload);
            }

            if (!res.headersSent && !res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            }
            res.end(payload === undefined ? '' : String(payload));
            return res;
        };
    }

    return res;
}

export function devApiPlugin(): Plugin {
    let handlerPromise: Promise<(req: ApiRequest, res: ApiResponse) => unknown> | null = null;

    return {
        name: 'local-api-dev-plugin',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/')) {
                    next();
                    return;
                }

                try {
                    if (!handlerPromise) {
                        handlerPromise = import('../api/router.js').then((mod) => mod.default);
                    }

                    const url = new URL(req.url, 'http://localhost');
                    const apiReq = req as ApiRequest;
                    apiReq.originalUrl = req.url;
                    apiReq.query = Object.fromEntries(url.searchParams.entries());

                    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
                        const rawBody = await loadBody(req);
                        apiReq.rawBody = rawBody;
                        apiReq.body = parseBody(rawBody, String(req.headers['content-type'] || ''));
                    }

                    const apiRes = decorateResponse(res as ApiResponse);
                    const handler = await handlerPromise;
                    await handler(apiReq, apiRes);
                } catch (error) {
                    next(error as Error);
                }
            });
        },
    };
}
