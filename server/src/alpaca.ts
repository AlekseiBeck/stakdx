import axios from 'axios';
import { Candle, NewsItem } from './types';

// S&P 500 large caps + high-volume growth stocks
export const SP500_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'GOOGL', 'TSLA', 'AVGO',
  'JPM', 'V', 'MA', 'GS', 'MS', 'BAC', 'WFC', 'BLK',
  'UNH', 'LLY', 'JNJ', 'MRK', 'ABBV', 'TMO', 'AMGN', 'GILD',
  'HD', 'COST', 'WMT', 'KO', 'PEP', 'PG', 'MCD', 'NKE',
  'AMD', 'QCOM', 'TXN', 'INTC', 'MU', 'AMAT', 'NOW', 'CRM',
  'XOM', 'CVX', 'CAT', 'RTX', 'GE', 'LMT',
];

export const NON_SP500_TICKERS = [
  'SPY', 'QQQ', 'IWM',
  'PLTR', 'COIN', 'MSTR',
  'SHOP', 'SNOW', 'DDOG', 'NET',
  'ARM', 'MRVL', 'SMCI',
  'RIVN', 'HOOD', 'RBLX', 'SNAP',
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

// Score a ticker's candles to pre-filter before sending to Claude.
// Returns a number 0-100 based on volume spike, momentum, and candle strength.
export function scoreTicker(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Average volume of all candles except latest
  const avgVol = candles.slice(0, -1).reduce((s, c) => s + c.v, 0) / (candles.length - 1);
  const volRatio = avgVol > 0 ? latest.v / avgVol : 1;

  // Price momentum — absolute % change from previous close
  const momentum = Math.abs((latest.c - prev.c) / prev.c) * 100;

  // Candle body strength — body as % of total range
  const body = Math.abs(latest.c - latest.o);
  const range = latest.h - latest.l;
  const bodyStrength = range > 0 ? body / range : 0;

  // Multi-day trend: compare first and last close
  const trend = candles.length >= 3
    ? Math.abs((latest.c - candles[0].c) / candles[0].c) * 100
    : 0;

  // Weighted score
  return (volRatio * 30) + (momentum * 4) + (bodyStrength * 20) + (trend * 2);
}

// Compress candles into a compact string Claude can read efficiently
export function summarizeCandles(ticker: string, candles: Candle[]): string {
  if (candles.length === 0) return `${ticker}: no data`;

  const avgVol = candles.slice(0, -1).reduce((s, c) => s + c.v, 0) / Math.max(candles.length - 1, 1);
  const latest = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : latest;

  const dayChange = ((latest.c - prev.c) / prev.c * 100).toFixed(1);
  const volRatio = avgVol > 0 ? (latest.v / avgVol).toFixed(1) : '1.0';
  const bodyPct = latest.h !== latest.l
    ? (Math.abs(latest.c - latest.o) / (latest.h - latest.l) * 100).toFixed(0)
    : '0';
  const direction = latest.c >= latest.o ? 'bull' : 'bear';

  const candleStr = candles.map(c =>
    `${c.t.split('T')[0]} O${c.o.toFixed(2)} H${c.h.toFixed(2)} L${c.l.toFixed(2)} C${c.c.toFixed(2)} V${(c.v / 1e6).toFixed(1)}M`
  ).join(' | ');

  return `${ticker}: ${candleStr} | Latest: ${dayChange}% ${direction} candle, body=${bodyPct}% of range, vol=${volRatio}x avg`;
}

export async function fetchCandles(): Promise<Record<string, Candle[]> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 10);

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: WATCHLIST.join(','),
        timeframe: '1Day',
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        limit: 100,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
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
  start.setDate(start.getDate() - 10);

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

// Ticker-specific news
export async function fetchNews(): Promise<NewsItem[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v1beta1/news`, {
      headers: getAlpacaHeaders(),
      params: { symbols: WATCHLIST.join(','), limit: 30, sort: 'desc' },
    });

    return mapNews(response.data.news);
  } catch (err) {
    console.error('Alpaca news fetch error:', err);
    return null;
  }
}

// Broad market news — no ticker filter, captures Fed/political/macro headlines
export async function fetchMarketNews(): Promise<NewsItem[]> {
  if (!hasAlpacaKeys()) return [];

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v1beta1/news`, {
      headers: getAlpacaHeaders(),
      params: { limit: 20, sort: 'desc' },
    });

    return mapNews(response.data.news);
  } catch (err) {
    console.error('Alpaca market news fetch error:', err);
    return [];
  }
}

export async function fetchNewsForTicker(ticker: string): Promise<NewsItem[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  try {
    const response = await axios.get(`${endpoint}/v1beta1/news`, {
      headers: getAlpacaHeaders(),
      params: { symbols: ticker, limit: 5, sort: 'desc' },
    });

    return mapNews(response.data.news);
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

function mapNews(raw: Array<{
  id: number; headline: string; summary: string;
  source: string; url: string; created_at: string; symbols: string[];
}>): NewsItem[] {
  return raw.map((a) => ({
    id: String(a.id),
    headline: a.headline,
    summary: a.summary,
    source: a.source,
    url: a.url,
    createdAt: a.created_at,
    symbols: a.symbols,
  }));
}

export { WATCHLIST, hasAlpacaKeys };
