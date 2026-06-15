import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Supabase client so authHeaders() has a session token to read.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { auth: { getSession } } }));

import { searchNewsArticles, addPosition, deletePosition, fetchLinkPreview, fetchWatchlist } from '../api';

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  vi.stubGlobal('fetch', vi.fn());
});

const fetchMock = () => vi.mocked(globalThis.fetch as any);

describe('GET wrappers', () => {
  it('searchNewsArticles encodes the query and attaches the bearer token', async () => {
    fetchMock().mockResolvedValueOnce(okJson({ news: [], focus: 'X', mock: false }));
    const res = await searchNewsArticles('rate cuts');
    expect(res.focus).toBe('X');
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/news/search?q=rate%20cuts');
    expect((init.headers as any).Authorization).toBe('Bearer tok-123');
  });

  it('throws when the server responds non-OK', async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(searchNewsArticles('x')).rejects.toThrow(/failed: 500/);
  });

  it('omits the Authorization header when there is no session', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    fetchMock().mockResolvedValueOnce(okJson({ tickers: ['AAPL'] }));
    await fetchWatchlist();
    const [, init] = fetchMock().mock.calls[0];
    expect((init.headers as any).Authorization).toBeUndefined();
  });
});

describe('POST/DELETE wrappers', () => {
  it('addPosition posts the JSON body and returns the created position', async () => {
    fetchMock().mockResolvedValueOnce(okJson({ position: { id: '1', ticker: 'NVDA' } }));
    const pos = await addPosition('NVDA', 120, 'long', 110, 140);
    expect(pos).toEqual({ id: '1', ticker: 'NVDA' });
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/positions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ticker: 'NVDA', entryPrice: 120, direction: 'long', stopLoss: 110, target: 140 });
    expect((init.headers as any)['Content-Type']).toBe('application/json');
  });

  it('deletePosition issues a DELETE to the id path', async () => {
    fetchMock().mockResolvedValueOnce(okJson({ success: true }));
    await deletePosition('abc');
    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toBe('/api/positions/abc');
    expect(init.method).toBe('DELETE');
  });
});

describe('resilient wrappers', () => {
  it('fetchWatchlist returns [] when the request fails', async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await fetchWatchlist()).toEqual([]);
  });

  it('fetchLinkPreview returns the server payload on success', async () => {
    fetchMock().mockResolvedValueOnce(okJson({ title: 'Headline', source: 'reuters.com' }));
    expect(await fetchLinkPreview('https://reuters.com/x')).toEqual({ title: 'Headline', source: 'reuters.com' });
  });

  it('fetchLinkPreview falls back to the hostname when the server fails', async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await fetchLinkPreview('https://www.bloomberg.com/news/x')).toEqual({ title: 'bloomberg.com', source: 'bloomberg.com' });
  });
});
