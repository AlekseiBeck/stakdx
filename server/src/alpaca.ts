import axios from 'axios';
import { Candle, NewsItem } from './types';

// S&P 500 large caps + high-volume growth stocks
export const SP500_TICKERS = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'GOOGL', 'TSLA', 'AVGO',
  // Financials
  'JPM', 'V', 'MA', 'GS', 'MS', 'BAC', 'WFC', 'BLK',
  // Healthcare
  'UNH', 'LLY', 'JNJ', 'MRK', 'ABBV', 'TMO', 'AMGN', 'GILD',
  // Consumer
  'HD', 'COST', 'WMT', 'KO', 'PEP', 'PG', 'MCD', 'NKE',
  // Semiconductors & Tech
  'AMD', 'QCOM', 'TXN', 'INTC', 'MU', 'AMAT', 'NOW', 'CRM',
  // Energy & Industrial
  'XOM', 'CVX', 'CAT', 'RTX', 'GE', 'LMT',
];

// Non-S&P 500: ETFs, high-beta growth, crypto-adjacent
export const NON_SP500_TICKERS = [
  'SPY', 'QQQ', 'IWM',           // Index ETFs
  'PLTR', 'COIN', 'MSTR',        // High-beta / crypto-adjacent
  'SHOP', 'SNOW', 'DDOG', 'NET', // Cloud growth
  'ARM', 'MRVL', 'SMCI',         // Semis outside S&P 500
  'RIVN', 'HOOD', 'RBLX', 'SNAP',// Speculative growth
];

const WATCHLIST = [...SP500_TICKERS, ...NON_SP500_TICKERS];

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

export async function fetchLatestPrices(): Promise<Record<string, number> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/trades/latest`, {
      headers: getAlpacaHeaders(),
      params: { symbols: WATCHLIST.join(','), feed: 'iex' },
    });

    const trades = response.data.trades as Record<string, { p: number }>;
    const prices: Record<string, number> = {};
    for (const [ticker, trade] of Object.entries(trades)) {
      prices[ticker] = trade.p;
    }
    return prices;
  } catch (err) {
    console.error('Alpaca latest prices error:', err);
    return null;
  }
}

export { WATCHLIST, hasAlpacaKeys };
