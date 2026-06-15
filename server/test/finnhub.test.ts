import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from './msw';
import { fetchFinnhubNews, fetchEconomicCalendar, fetchUpcomingEarnings } from '../src/finnhub';

describe('finnhub', () => {
  beforeEach(() => vi.stubEnv('FINNHUB_API_KEY', 'test-key'));
  afterEach(() => vi.unstubAllEnvs());

  describe('without an API key', () => {
    beforeEach(() => vi.stubEnv('FINNHUB_API_KEY', ''));
    it('all fetchers short-circuit to empty arrays', async () => {
      expect(await fetchFinnhubNews(['AAPL'])).toEqual([]);
      expect(await fetchEconomicCalendar()).toEqual([]);
      expect(await fetchUpcomingEarnings(['AAPL'])).toEqual([]);
    });
  });

  it('fetchFinnhubNews maps articles, caps 3 per ticker, truncates summary, sorts newest-first', async () => {
    mswServer.use(http.get('https://finnhub.io/api/v1/company-news', () => HttpResponse.json([
      { headline: 'Older', source: 'A', url: 'u1', datetime: 100, summary: 'x'.repeat(200) },
      { headline: 'Newer', source: 'B', url: 'u2', datetime: 200, summary: 'short' },
      { headline: 'Mid', source: 'C', url: 'u3', datetime: 150, summary: '' },
      { headline: 'Dropped', source: 'D', url: 'u4', datetime: 50, summary: '' }, // 4th — sliced off
    ])));
    const news = await fetchFinnhubNews(['AAPL']);
    expect(news).toHaveLength(3);
    expect(news.map((n) => n.headline)).toEqual(['Newer', 'Mid', 'Older']); // sorted desc by datetime
    expect(news[0].ticker).toBe('AAPL');
    expect(news.find((n) => n.headline === 'Older')!.summary).toHaveLength(150);
  });

  it('fetchEconomicCalendar keeps only US high/medium-impact events', async () => {
    mswServer.use(http.get('https://finnhub.io/api/v1/calendar/economic', () => HttpResponse.json({
      economicCalendar: [
        { event: 'CPI', time: '2026-06-15T12:30:00', impact: 'high', country: 'US' },
        { event: 'Retail', time: '2026-06-16T12:30:00', impact: 'medium', country: 'US' },
        { event: 'Minor', time: '2026-06-16T12:30:00', impact: 'low', country: 'US' },     // low → dropped
        { event: 'EU CPI', time: '2026-06-16T09:00:00', impact: 'high', country: 'EU' },   // non-US → dropped
      ],
    })));
    const events = await fetchEconomicCalendar();
    expect(events.map((e) => e.event)).toEqual(['CPI', 'Retail']);
    expect(events[0]).toMatchObject({ date: '2026-06-15', impact: 'high', country: 'US' });
  });

  it('fetchUpcomingEarnings keeps only requested tickers', async () => {
    mswServer.use(http.get('https://finnhub.io/api/v1/calendar/earnings', () => HttpResponse.json({
      earningsCalendar: [
        { symbol: 'AAPL', date: '2026-06-17', epsEstimate: 1.5, revenueEstimate: 1e9 },
        { symbol: 'ZZZZ', date: '2026-06-18', epsEstimate: null, revenueEstimate: null },
      ],
    })));
    const earnings = await fetchUpcomingEarnings(['AAPL']);
    expect(earnings).toHaveLength(1);
    expect(earnings[0]).toMatchObject({ ticker: 'AAPL', date: '2026-06-17', epsEstimate: 1.5 });
  });

  it('returns [] when the calendar request fails', async () => {
    mswServer.use(http.get('https://finnhub.io/api/v1/calendar/economic', () => HttpResponse.error()));
    expect(await fetchEconomicCalendar()).toEqual([]);
  });
});
