import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

// Mock only the Supabase boundary: real auth + real db run against this stub.
// `from()` is a chainable query builder resolving to dbState.result; `auth.getUser`
// drives requireAuth's token verification.
const { dbState, getUser } = vi.hoisted(() => {
  const state: any = { result: { data: null, error: null } };
  const builder: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(state.result).then(res, rej);
      return () => builder;
    },
  });
  state.client = { from: () => builder, auth: { getUser: vi.fn() } };
  return { dbState: state, getUser: state.client.auth.getUser };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => dbState.client) }));

import { app } from '../src/index';

const authed = (r: request.Test) => r.set('Authorization', 'Bearer good');

beforeEach(() => {
  dbState.result = { data: null, error: null };
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('PATCH /api/chat/sessions/:id — validation', () => {
  it('401s without a token', async () => {
    const res = await request(app).patch('/api/chat/sessions/s1').send({ is_workstation: true });
    expect(res.status).toBe(401);
  });

  it('400s when there is nothing to update', async () => {
    const res = await authed(request(app).patch('/api/chat/sessions/s1')).send({});
    expect(res.status).toBe(400);
  });

  it('400s on an unknown layout token', async () => {
    const res = await authed(request(app).patch('/api/chat/sessions/s1')).send({ layout: 'diagonal' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/layout must be one of/);
  });

  it('400s on an invalid ticker', async () => {
    const res = await authed(request(app).patch('/api/chat/sessions/s1')).send({ tickers: ['AAPL', '###'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid ticker/);
  });

  it('400s on malformed articles', async () => {
    const res = await authed(request(app).patch('/api/chat/sessions/s1')).send({ articles: [{ url: 'not-a-url' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/articles must be an array/);
  });

  it('400s when is_workstation is not a boolean', async () => {
    const res = await authed(request(app).patch('/api/chat/sessions/s1')).send({ is_workstation: 'yes' });
    expect(res.status).toBe(400);
  });

  it('persists a valid workstation patch and returns the session', async () => {
    dbState.result = { data: { id: 's1', is_workstation: true, tickers: ['AMD'], layout: 'row' }, error: null };
    const res = await authed(request(app).patch('/api/chat/sessions/s1'))
      .send({ is_workstation: true, tickers: ['amd'], layout: 'row', articles: [{ url: 'https://a.com', title: 'A' }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, session: { id: 's1', is_workstation: true } });
  });
});

describe('chat sessions list/create', () => {
  it('GET returns the user\'s sessions', async () => {
    dbState.result = { data: [{ id: 's1', title: 'Hello', user_id: 'u1' }], error: null };
    const res = await authed(request(app).get('/api/chat/sessions'));
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
  });

  it('POST creates a session', async () => {
    dbState.result = { data: { id: 's2', title: 'New Chat', user_id: 'u1' }, error: null };
    const res = await authed(request(app).post('/api/chat/sessions')).send({ title: 'New Chat' });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ id: 's2', title: 'New Chat' });
  });
});
