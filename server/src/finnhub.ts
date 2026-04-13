import axios from 'axios';

function hasFinnhubKey(): boolean {
  return !!(process.env.FINNHUB_API_KEY && process.env.FINNHUB_API_KEY !== 'your_finnhub_api_key_here');
}

function getHeaders() {
  return { 'X-Finnhub-Token': process.env.FINNHUB_API_KEY || '' };
}

export interface FinnhubNewsItem {
  ticker: string;
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix timestamp
  summary: string;
}

export interface EarningsEvent {
  ticker: string;
  date: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
}

export async function fetchFinnhubNews(tickers: string[]): Promise<FinnhubNewsItem[]> {
  if (!hasFinnhubKey()) return [];

  const today = new Date();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);
  const fromDate = threeDaysAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  const results: FinnhubNewsItem[] = [];

  // Fetch news for top tickers in parallel (max 10 to stay within free tier)
  await Promise.all(
    tickers.slice(0, 10).map(async (ticker) => {
      try {
        const res = await axios.get('https://finnhub.io/api/v1/company-news', {
          headers: getHeaders(),
          params: { symbol: ticker, from: fromDate, to: toDate },
          timeout: 5000,
        });
        const articles = (res.data as Array<{ headline: string; source: string; url: string; datetime: number; summary: string }>).slice(0, 3);
        for (const a of articles) {
          results.push({
            ticker,
            headline: a.headline,
            source: a.source,
            url: a.url,
            datetime: a.datetime,
            summary: a.summary?.slice(0, 150) ?? '',
          });
        }
      } catch {
        // Skip on error — free tier rate limits
      }
    })
  );

  return results.sort((a, b) => b.datetime - a.datetime);
}

export interface EconomicEvent {
  event: string;
  date: string;
  impact: 'high' | 'medium';
  country: string;
}

// Fetch US high/medium impact economic events for the next 7 days.
// Covers CPI, FOMC, NFP, PPI, retail sales, GDP etc.
export async function fetchEconomicCalendar(): Promise<EconomicEvent[]> {
  if (!hasFinnhubKey()) return [];

  const today = new Date();
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(today.getDate() + 7);

  try {
    const res = await axios.get('https://finnhub.io/api/v1/calendar/economic', {
      headers: getHeaders(),
      params: {
        from: today.toISOString().split('T')[0],
        to: sevenDaysOut.toISOString().split('T')[0],
      },
      timeout: 5000,
    });

    const events = (res.data?.economicCalendar ?? []) as Array<{
      event: string;
      time: string;
      impact: string;
      country: string;
    }>;

    return events
      .filter(e => e.country === 'US' && (e.impact === 'high' || e.impact === 'medium'))
      .slice(0, 12)
      .map(e => ({
        event: e.event,
        date: e.time?.split('T')[0] ?? today.toISOString().split('T')[0],
        impact: e.impact === 'high' ? 'high' : 'medium',
        country: e.country,
      }));
  } catch {
    return [];
  }
}

export async function fetchUpcomingEarnings(tickers: string[]): Promise<EarningsEvent[]> {
  if (!hasFinnhubKey()) return [];

  const today = new Date();
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(today.getDate() + 7);

  try {
    const res = await axios.get('https://finnhub.io/api/v1/calendar/earnings', {
      headers: getHeaders(),
      params: {
        from: today.toISOString().split('T')[0],
        to: sevenDaysOut.toISOString().split('T')[0],
      },
      timeout: 5000,
    });

    const events = (res.data?.earningsCalendar ?? []) as Array<{
      symbol: string; date: string; epsEstimate: number | null; revenueEstimate: number | null;
    }>;

    return events
      .filter(e => tickers.includes(e.symbol))
      .map(e => ({
        ticker: e.symbol,
        date: e.date,
        epsEstimate: e.epsEstimate,
        revenueEstimate: e.revenueEstimate,
      }));
  } catch {
    return [];
  }
}
