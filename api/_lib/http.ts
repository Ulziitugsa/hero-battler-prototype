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
