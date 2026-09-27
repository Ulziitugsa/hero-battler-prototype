// Minimal structural types for a Vercel Node serverless function's request/response - deliberately NOT
// importing `@vercel/node` for these (its type-only package pulls in a chain of vulnerable transitive
// dependencies at install time - see npm audit). Vercel's actual runtime request/response objects satisfy
// this shape for everything these handlers touch (method, headers, parsed JSON body, query, status/json).

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
  end?(): void;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function bearerToken(req: ApiRequest): string {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token');
  return value.slice('Bearer '.length);
}

/** Wraps a handler so any thrown HttpError (or unexpected error) becomes a clean JSON error response. */
export function withErrorHandling(handler: (req: ApiRequest, res: ApiResponse) => Promise<void>) {
  return async (req: ApiRequest, res: ApiResponse) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

/** CORS for the packaged Capacitor origins. Browser same-origin requests need no CORS configuration. */
export function withCapacitorCors(handler: (req: ApiRequest, res: ApiResponse) => Promise<void>) {
  return async (req: ApiRequest, res: ApiResponse) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const allowed = (process.env.CAPACITOR_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) {
      res.setHeader?.('Access-Control-Allow-Origin', origin);
      res.setHeader?.('Vary', 'Origin');
      res.setHeader?.('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader?.('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader?.('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      if (!origin || !allowed.includes(origin)) {
        res.status(403).json({ error: 'Origin is not allowed' });
        return;
      }
      res.status(204).end?.();
      return;
    }
    await handler(req, res);
  };
}
