import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A chainable Supabase stub: every query-builder method returns the builder and
// records its args; awaiting the builder resolves to `dbState.result`.
const { dbState } = vi.hoisted(() => {
  const state: any = { result: { data: null, error: null }, calls: {} as Record<string, any[][]> };
  const record = (name: string, args: any[]) => { (state.calls[name] ??= []).push(args); };
  const builder: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(state.result).then(res, rej);
      return (...args: any[]) => { record(prop, args); return builder; };
    },
  });
  state.client = { from: (...a: any[]) => { record('from', a); return builder; } };
  return { dbState: state };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => dbState.client) }));

import { hasDatabase, getPositions, createPosition, updateChatSessionWorkstation } from '../src/db';

beforeEach(() => {
  dbState.result = { data: null, error: null };
  dbState.calls = {};
  vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('hasDatabase', () => {
  it('is true with both env vars and false without', () => {
    expect(hasDatabase()).toBe(true);
    vi.stubEnv('SUPABASE_URL', '');
    expect(hasDatabase()).toBe(false);
  });
});

describe('getPositions', () => {
  it('maps DB rows (snake_case) to Position objects (camelCase)', async () => {
    dbState.result = {
      data: [{ id: '1', ticker: 'AAPL', entry_price: 100, entry_time: 't', direction: 'long', stop_loss: 90, target: 120, notified_stop: false, notified_target: true }],
      error: null,
    };
    const positions = await getPositions('u1');
    expect(positions[0]).toEqual({
      id: '1', ticker: 'AAPL', entryPrice: 100, entryTime: 't', direction: 'long',
      stopLoss: 90, target: 120, notifiedStop: false, notifiedTarget: true,
    });
    expect(dbState.calls.from[0]).toEqual(['positions']);
    expect(dbState.calls.eq[0]).toEqual(['user_id', 'u1']);
  });

  it('returns [] on a DB error', async () => {
    dbState.result = { data: null, error: { message: 'boom' } };
    expect(await getPositions('u1')).toEqual([]);
  });
});

describe('createPosition', () => {
  it('inserts and returns the mapped row', async () => {
    dbState.result = { data: { id: '9', ticker: 'NVDA', entry_price: 50, entry_time: 't', direction: 'long', stop_loss: null, target: null }, error: null };
    const pos = await createPosition('u1', { ticker: 'NVDA', entryPrice: 50, entryTime: 't', direction: 'long' } as any);
    expect(pos).toMatchObject({ id: '9', ticker: 'NVDA', entryPrice: 50, notifiedStop: false });
    expect(dbState.calls.insert[0][0]).toMatchObject({ user_id: 'u1', ticker: 'NVDA', entry_price: 50 });
  });

  it('throws on a DB error', async () => {
    dbState.result = { data: null, error: { message: 'duplicate' } };
    await expect(createPosition('u1', { ticker: 'X', entryPrice: 1, entryTime: 't', direction: 'long' } as any))
      .rejects.toThrow(/duplicate/);
  });
});

describe('updateChatSessionWorkstation', () => {
  it('clears tickers/layout/articles when disabling workstation mode', async () => {
    dbState.result = { data: { id: 's1', is_workstation: false }, error: null };
    await updateChatSessionWorkstation('u1', 's1', { is_workstation: false });
    const patch = dbState.calls.update[0][0];
    expect(patch).toMatchObject({ is_workstation: false, tickers: [], layout: null, articles: [] });
    expect(typeof patch.updated_at).toBe('string');
  });

  it('persists tickers/layout/articles when enabling workstation mode', async () => {
    dbState.result = { data: { id: 's1', is_workstation: true }, error: null };
    const articles = [{ url: 'https://a.com', title: 'A', addedAt: 't' }];
    await updateChatSessionWorkstation('u1', 's1', { is_workstation: true, tickers: ['AMD'], layout: 'row', articles });
    const patch = dbState.calls.update[0][0];
    expect(patch).toMatchObject({ is_workstation: true, is_research: false, ticker: null, tickers: ['AMD'], layout: 'row', articles });
  });

  it('returns null on a DB error', async () => {
    dbState.result = { data: null, error: { message: 'nope' } };
    expect(await updateChatSessionWorkstation('u1', 's1', { tickers: ['AMD'] })).toBeNull();
  });
});

describe('no database configured', () => {
  it('getPositions resolves to [] when Supabase env is absent', async () => {
    vi.resetModules();
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const fresh = await import('../src/db');
    expect(await fresh.getPositions('u1')).toEqual([]);
  });
});
