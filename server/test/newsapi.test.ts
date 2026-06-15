import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from './msw';
import { searchNews } from '../src/newsapi';

const okPayload = {
  status: 'ok',
  articles: [
    { title: 'Headline A', source: { name: 'Reuters' }, publishedAt: '2026-06-14T10:00:00Z', url: 'https://r.com/a' },
    { title: 'Headline B', source: { name: null }, publishedAt: '2026-06-14T09:00:00Z', url: 'https://r.com/b' },
  ],
};

describe('searchNews', () => {
  beforeEach(() => vi.stubEnv('NEWSAPI_KEY', 'test-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('returns [] without calling the network when no key is set', async () => {
    vi.stubEnv('NEWSAPI_KEY', '');
    let hits = 0;
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => { hits++; return HttpResponse.json(okPayload); }));
    expect(await searchNews('nokey-query')).toEqual([]);
    expect(hits).toBe(0);
  });

  it('maps NewsAPI articles, defaulting a missing source name to "Unknown"', async () => {
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => HttpResponse.json(okPayload)));
    const articles = await searchNews('map-query');
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({ title: 'Headline A', source: 'Reuters', publishedAt: '2026-06-14T10:00:00Z', url: 'https://r.com/a' });
    expect(articles[1].source).toBe('Unknown');
  });

  it('caches by query|sortBy|pageSize (no second network call)', async () => {
    let hits = 0;
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => { hits++; return HttpResponse.json(okPayload); }));
    await searchNews('cache-query', 5, 'relevancy');
    await searchNews('cache-query', 5, 'relevancy');
    expect(hits).toBe(1);
  });

  it('re-fetches when the sortBy differs (different cache key)', async () => {
    let hits = 0;
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => { hits++; return HttpResponse.json(okPayload); }));
    await searchNews('sort-query', 5, 'relevancy');
    await searchNews('sort-query', 5, 'publishedAt');
    expect(hits).toBe(2);
  });

  it('passes the query, pageSize and sortBy through to NewsAPI', async () => {
    let seen: URLSearchParams | null = null;
    mswServer.use(http.get('https://newsapi.org/v2/everything', ({ request }) => {
      seen = new URL(request.url).searchParams;
      return HttpResponse.json(okPayload);
    }));
    await searchNews('params-query', 30, 'relevancy');
    expect(seen!.get('q')).toBe('params-query');
    expect(seen!.get('pageSize')).toBe('30');
    expect(seen!.get('sortBy')).toBe('relevancy');
    expect(seen!.get('language')).toBe('en');
  });

  it('returns [] on a non-ok payload', async () => {
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => HttpResponse.json({ status: 'error' })));
    expect(await searchNews('bad-status-query')).toEqual([]);
  });

  it('returns [] when the request fails', async () => {
    mswServer.use(http.get('https://newsapi.org/v2/everything', () => HttpResponse.error()));
    expect(await searchNews('error-query')).toEqual([]);
  });
});
