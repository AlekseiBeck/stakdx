import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from './msw';
import { fetchRedditSentiment } from '../src/reddit';

const redditJson = (posts: Array<{ title: string; selftext?: string; score?: number; num_comments?: number }>) =>
  HttpResponse.json({ data: { children: posts.map((p) => ({ data: { selftext: '', score: 0, num_comments: 0, ...p } })) } });

function mockReddit(wsb: any[], stocks: any[] = []) {
  mswServer.use(
    http.get('https://www.reddit.com/r/wallstreetbets/hot.json', () => redditJson(wsb)),
    http.get('https://www.reddit.com/r/stocks/hot.json', () => redditJson(stocks)),
  );
}

describe('fetchRedditSentiment', () => {
  it('aggregates mentions and classifies bullish vs bearish per ticker', async () => {
    mockReddit([
      { title: 'NVDA calls to the moon', score: 10, num_comments: 1 },
      { title: 'Loading up NVDA, strong buy', score: 5, num_comments: 0 },
      { title: 'NVDA hold, still bullish', score: 1, num_comments: 0 },
      { title: 'TSLA puts, it will crash', score: 3, num_comments: 0 },
      { title: 'Selling TSLA, overvalued dump', score: 2, num_comments: 0 },
    ]);
    const out = await fetchRedditSentiment(['NVDA', 'TSLA']);
    expect(out.NVDA).toMatchObject({ ticker: 'NVDA', mentions: 3, sentiment: 'bullish' });
    expect(out.TSLA).toMatchObject({ ticker: 'TSLA', mentions: 2, sentiment: 'bearish' });
  });

  it('tracks the highest-engagement post as topPost (score + comments×5)', async () => {
    mockReddit([
      { title: 'NVDA quiet mention', score: 100, num_comments: 0 },
      { title: 'NVDA huge thread', score: 1, num_comments: 50 }, // 1 + 250 > 100
    ]);
    const out = await fetchRedditSentiment(['NVDA']);
    expect(out.NVDA.topPost).toBe('NVDA huge thread');
  });

  it('filters out noise tokens even when passed as a ticker', async () => {
    mockReddit([{ title: 'ALL calls now', score: 10 }]);
    const out = await fetchRedditSentiment(['ALL']);
    expect(out.ALL).toBeUndefined();
  });

  it('returns {} when both subreddits are unreachable', async () => {
    mswServer.use(
      http.get('https://www.reddit.com/r/wallstreetbets/hot.json', () => HttpResponse.error()),
      http.get('https://www.reddit.com/r/stocks/hot.json', () => HttpResponse.error()),
    );
    expect(await fetchRedditSentiment(['NVDA'])).toEqual({});
  });
});
