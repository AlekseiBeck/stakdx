import axios from 'axios';
import { Candle, NewsItem } from './types';

const WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'SPY', 'QQQ', 'META', 'AMZN', 'GOOGL'];

function getAlpacaHeaders() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
  };
}

function hasAlpacaKeys(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY &&
    process.env.ALPACA_API_KEY !== 'your_alpaca_api_key_here');
}

export async function fetchCandles(): Promise<Record<string, Candle[]> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7); // fetch 7 days to get 5 trading days

  try {
    const symbols = WATCHLIST.join(',');
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols,
        timeframe: '1Day',
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        limit: 50,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
    // Trim to last 5 candles per ticker
    const trimmed: Record<string, Candle[]> = {};
    for (const [ticker, candles] of Object.entries(bars)) {
      trimmed[ticker] = candles.slice(-5);
    }
    return trimmed;
  } catch (err) {
    console.error('Alpaca candle fetch error:', err);
    return null;
  }
}

export async function fetchCandlesForTicker(ticker: string): Promise<Candle[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: ticker,
        timeframe: '1Day',
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        limit: 10,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
    return bars[ticker]?.slice(-5) || null;
  } catch (err) {
    console.error(`Alpaca candle fetch error for ${ticker}:`, err);
    return null;
  }
}

export async function fetchNews(): Promise<NewsItem[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v1beta1/news`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: WATCHLIST.join(','),
        limit: 20,
        sort: 'desc',
      },
    });

    const articles = response.data.news as Array<{
      id: number;
      headline: string;
      summary: string;
      source: string;
      url: string;
      created_at: string;
      symbols: string[];
    }>;

    return articles.map((a) => ({
      id: String(a.id),
      headline: a.headline,
      summary: a.summary,
      source: a.source,
      url: a.url,
      createdAt: a.created_at,
      symbols: a.symbols,
    }));
  } catch (err) {
    console.error('Alpaca news fetch error:', err);
    return null;
  }
}

export async function fetchNewsForTicker(ticker: string): Promise<NewsItem[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v1beta1/news`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: ticker,
        limit: 5,
        sort: 'desc',
      },
    });

    const articles = response.data.news as Array<{
      id: number;
      headline: string;
      summary: string;
      source: string;
      url: string;
      created_at: string;
      symbols: string[];
    }>;

    return articles.map((a) => ({
      id: String(a.id),
      headline: a.headline,
      summary: a.summary,
      source: a.source,
      url: a.url,
      createdAt: a.created_at,
      symbols: a.symbols,
    }));
  } catch (err) {
    console.error(`Alpaca news fetch error for ${ticker}:`, err);
    return null;
  }
}

export { WATCHLIST, hasAlpacaKeys };
