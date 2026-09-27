import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCapacitorCors, type ApiResponse } from './http.js';

function response() {
  const headers = new Map<string, string>();
  const calls: { status?: number; body?: unknown; ended?: boolean } = {};
  const res: ApiResponse = {
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
    status: (status) => { calls.status = status; return res; },
    json: (body) => { calls.body = body; },
    end: () => { calls.ended = true; },
  };
  return { res, headers, calls };
}

describe('Capacitor API CORS', () => {
  afterEach(() => { delete process.env.CAPACITOR_ALLOWED_ORIGINS; vi.restoreAllMocks(); });

  it('allows configured native origins and answers preflight without calling the handler', async () => {
    process.env.CAPACITOR_ALLOWED_ORIGINS = 'https://localhost, capacitor://localhost';
    const handler = vi.fn(async () => {});
    const wrapped = withCapacitorCors(handler);
    const { res, headers, calls } = response();
    await wrapped({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' }, query: {} }, res);
    expect(calls.status).toBe(204);
    expect(calls.ended).toBe(true);
    expect(headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    expect(headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects unconfigured preflight origins', async () => {
    process.env.CAPACITOR_ALLOWED_ORIGINS = 'https://localhost';
    const handler = vi.fn(async () => {});
    const { res, calls } = response();
    await withCapacitorCors(handler)({ method: 'OPTIONS', headers: { origin: 'https://evil.example' }, query: {} }, res);
    expect(calls.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
