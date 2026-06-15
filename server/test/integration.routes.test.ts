import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

// Replace auth with a lightweight gate: 401 without a token, else userId=test-user.
// (Real token verification is covered in auth.test.ts.) Supabase stays unconfigured,
// so DB-backed routes use their in-memory fallbacks.
vi.mock('../src/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'unauthorized' });
    req.userId = 'test-user';
    next();
  },
}));

// Mock the outbound boundaries the tested routes touch (the app's own axios call in
// link-preview, and the NewsAPI client). Other axios users short-circuit on missing keys.
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), create: vi.fn() } }));
vi.mock('../src/newsapi', () => ({ searchNews: vi.fn() }));

import axios from 'axios';
import { searchNews } from '../src/newsapi';
import { app } from '../src/index';

const auth = (r: request.Test) => r.set('Authorization', 'Bearer test');
const mockGet = vi.mocked(axios.get);

beforeEach(() => {
  mockGet.mockReset();
  vi.mocked(searchNews).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('auth gating', () => {
  it('401s a protected route with no Authorization header', async () => {
    expect((await request(app).get('/api/watchlist')).status).toBe(401);
  });

  it('allows a protected route with a token', async () => {
    const res = await auth(request(app).get('/api/watchlist'));
    expect(res.status).toBe(200);
    expect(res.body.tickers).toContain('AAPL');
  });
});

describe('GET /api/link-preview', () => {
  it('400s without a valid http(s) url', async () => {
    expect((await auth(request(app).get('/api/link-preview'))).status).toBe(400);
    expect((await auth(request(app).get('/api/link-preview?url=ftp://x.com'))).status).toBe(400);
  });

  it('extracts og:title and uses the hostname as source', async () => {
    mockGet.mockResolvedValueOnce({ data: '<html><head><meta property="og:title" content="Big News &amp; More"></head></html>' });
    const res = await auth(request(app).get('/api/link-preview?url=https://www.example.com/article'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'Big News & More', source: 'example.com' });
  });

  it('falls back to the <title> tag when there is no og:title', async () => {
    mockGet.mockResolvedValueOnce({ data: '<html><head><title>Plain Title</title></head></html>' });
    const res = await auth(request(app).get('/api/link-preview?url=https://news.site/x'));
    expect(res.body.title).toBe('Plain Title');
  });

  it('falls back to the hostname when the page is unreachable', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await auth(request(app).get('/api/link-preview?url=https://down.example/y'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'down.example', source: 'down.example' });
  });
});

describe('GET /api/news/search', () => {
  it('400s without a query', async () => {
    expect((await auth(request(app).get('/api/news/search'))).status).toBe(400);
  });

  it('maps NewsAPI articles into the news shape with a focus field', async () => {
    vi.mocked(searchNews).mockResolvedValueOnce([
      { title: 'Chips rally', source: 'Reuters', publishedAt: '2026-06-14T10:00:00Z', url: 'https://r.com/1' },
    ]);
    const res = await auth(request(app).get('/api/news/search?q=memory'));
    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(false);
    expect(res.body.news[0]).toMatchObject({ headline: 'Chips rally', source: 'Reuters' });
    expect(res.body).toHaveProperty('focus');
  });
});

describe('GET /api/chart/:ticker', () => {
  it('400s on an unknown range', async () => {
    expect((await auth(request(app).get('/api/chart/AAPL?range=decade'))).status).toBe(400);
  });

  it('404s when no chart data is available (no Alpaca keys)', async () => {
    expect((await auth(request(app).get('/api/chart/AAPL?range=2y'))).status).toBe(404);
  });
});

describe('GET /api/prices', () => {
  it('400s without tickers', async () => {
    expect((await auth(request(app).get('/api/prices'))).status).toBe(400);
  });
});

describe('positions CRUD (in-memory fallback)', () => {
  it('rejects an incomplete position', async () => {
    expect((await auth(request(app).post('/api/positions')).send({ ticker: 'AAPL' })).status).toBe(400);
  });

  it('rejects a non-positive entry price', async () => {
    const res = await auth(request(app).post('/api/positions')).send({ ticker: 'AAPL', entryPrice: 0, direction: 'long' });
    expect(res.status).toBe(400);
  });

  it('creates, lists, and deletes a position', async () => {
    const created = await auth(request(app).post('/api/positions'))
      .send({ ticker: 'nvda', entryPrice: 120.5, direction: 'long', stopLoss: 110, target: 140 });
    expect(created.status).toBe(201);
    expect(created.body.position).toMatchObject({ ticker: 'NVDA', entryPrice: 120.5, direction: 'long' });
    const id = created.body.position.id;

    const list = await auth(request(app).get('/api/positions'));
    expect(list.body.positions.some((p: any) => p.id === id)).toBe(true);

    expect((await auth(request(app).delete(`/api/positions/${id}`))).status).toBe(200);
    expect((await auth(request(app).delete(`/api/positions/${id}`))).status).toBe(404);
  });
});
