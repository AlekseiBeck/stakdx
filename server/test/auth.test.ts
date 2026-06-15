import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Supabase so requireAuth's token verification is driven by `getUser`.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser } })),
}));

import { requireAuth, type AuthRequest } from '../src/auth';
import type { Response } from 'express';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

beforeEach(() => {
  getUser.mockReset();
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('requireAuth', () => {
  it('falls back to a dev user when Supabase is not configured', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const req = { headers: {} } as AuthRequest;
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(req.userId).toBe('dev-user');
    expect(next).toHaveBeenCalledOnce();
  });

  it('401s when the Authorization header is missing or not Bearer', async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireAuth({ headers: {} } as AuthRequest, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Missing authorization token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token is invalid/expired', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = mockRes();
    const next = vi.fn();
    await requireAuth({ headers: { authorization: 'Bearer bad' } } as AuthRequest, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.userId and calls next on a valid token', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    const req = { headers: { authorization: 'Bearer good' } } as AuthRequest;
    const next = vi.fn();
    await requireAuth(req, mockRes(), next);
    expect(getUser).toHaveBeenCalledWith('good');
    expect(req.userId).toBe('user-123');
    expect(next).toHaveBeenCalledOnce();
  });
});
