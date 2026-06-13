import axios from 'axios';
import { Candle, NewsItem } from './types';

// S&P 500 large caps — grouped by sector
export const SP500_TICKERS = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'ORCL',
  // Financials
  'JPM', 'V', 'MA', 'GS', 'MS', 'BAC', 'WFC', 'BLK', 'SCHW', 'AXP', 'COF', 'USB', 'PNC', 'TFC', 'MTB',
  // Healthcare
  'UNH', 'LLY', 'JNJ', 'MRK', 'ABBV', 'TMO', 'AMGN', 'GILD', 'ISRG', 'DXCM', 'GEHC', 'CI', 'ELV', 'HCA', 'CVS', 'MCK', 'ABC', 'CAH', 'VRTX', 'REGN', 'BIIB', 'BSX', 'MDT', 'SYK', 'EW', 'ZBH', 'RMD', 'BAX',
  // Consumer
  'HD', 'COST', 'WMT', 'KO', 'PEP', 'PG', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG', 'MAR', 'HLT', 'YUM', 'CMG', 'DPZ', 'DASH', 'ABNB',
  // Semis & hardware
  'AMD', 'QCOM', 'TXN', 'INTC', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ADI', 'MCHP', 'ON', 'SWKS', 'MPWR', 'ENPH', 'FSLR',
  // Software / SaaS
  'NOW', 'CRM', 'ADBE', 'INTU', 'PANW', 'CRWD', 'ZS', 'FTNT', 'SNPS', 'CDNS', 'ANSS', 'PTC', 'TEAM', 'WDAY', 'VEEV', 'HUBS', 'DDOG', 'SNOW', 'MDB', 'NET', 'ZM', 'OKTA', 'DOCN', 'ESTC',
  // Industrials
  'CAT', 'RTX', 'GE', 'LMT', 'HON', 'UNP', 'UPS', 'FDX', 'DE', 'EMR', 'ETN', 'PH', 'ROK', 'IR', 'CARR', 'OTIS', 'TDG', 'HWM', 'GWW', 'AXON', 'MOD',
  // Energy
  'XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'BKR', 'MPC', 'PSX', 'VLO', 'COP', 'EOG', 'DVN', 'FANG', 'OKE', 'WMB', 'KMI',
  // Communication
  'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'CHTR', 'WBD', 'PARA', 'FOX', 'FOXA', 'EA', 'TTWO', 'RBLX', 'SNAP', 'PINS', 'RDDT',
  // Real estate / utilities
  'AMT', 'PLD', 'EQIX', 'CCI', 'SPG', 'O', 'NEE', 'SO', 'DUK', 'AEP', 'XEL', 'SRE',
  // Materials
  'LIN', 'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'STLD', 'ALB', 'MP',
  // Growth / SMID additions
  'FICO', 'DECK', 'CELH', 'DUOL', 'TTD', 'TOST', 'APP', 'APLS', 'CAVA', 'BROS', 'WING', 'SMCI', 'ARM', 'MRVL',
];

export const NON_SP500_TICKERS = [
  // Market regime anchors (ETFs)
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLE', 'XLV', 'XLC', 'XLRE', 'XLI', 'XLU', 'XLB', 'XLP', 'XLY',
  'SOXS', 'SOXL', 'TQQQ', 'SQQQ', 'TNA', 'TZA',
  // High-vol momentum / crypto-adjacent
  'PLTR', 'COIN', 'MSTR', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'LC',
  // Crypto miners
  'RIOT', 'MARA', 'CLSK', 'CIFR', 'HUT',
  // Biotech speculative
  'MRNA', 'BNTX', 'SGEN', 'NVAX', 'ARKG',
  // EV / clean energy
  'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'CHPT', 'BLNK', 'PLUG', 'BE',
  // Space / defense emerging
  'ASTS', 'LUNR', 'ACHR', 'JOBY', 'RKLB', 'SPCE',
  // Quantum / AI emerging
  'IONQ', 'RGTI', 'QBTS', 'QUBT',
  // AI audio / voice
  'SOUN',
  // Cloud / SaaS non-S&P
  'SHOP', 'GTLB', 'BILL', 'ZI', 'BRZE', 'CWAN', 'PCTY',
  // International ADRs
  'TSM', 'ASML', 'BABA', 'SE', 'NU', 'MELI', 'GRAB', 'PDD', 'JD', 'BIDU', 'SAP',
  // Fintech
  'SQ', 'PYPL', 'MQ', 'FOUR', 'GPN', 'FIS',
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

// Score a ticker with directional bias for LONG/SHORT mode scanning.
export function scoreTickerForMode(candles: Candle[], mode: 'long' | 'short' | 'both'): number {
  if (mode === 'both') return scoreTicker(candles);
  if (candles.length < 2) return 0;

  const base = scoreTicker(candles);
  const latest = candles[candles.length - 1];
  const range = latest.h - latest.l;
  const closeInRange = range > 0 ? (latest.c - latest.l) / range : 0.5; // 0=bottom, 1=top

  const avgVol = candles.slice(0, -1).reduce((s, c) => s + c.v, 0) / (candles.length - 1);
  const isAboveAvgVol = avgVol > 0 && latest.v > avgVol;

  const isGreen = latest.c >= latest.o;
  const isRed = latest.c < latest.o;

  let score = base;

  if (mode === 'long') {
    if (isGreen) score += 15;
    else score -= 10;
    if (closeInRange >= 0.7) score += 10; // close in top 30% of range
    if (isAboveAvgVol && isGreen) score += 10;
  } else if (mode === 'short') {
    if (isRed) score += 15;
    else score -= 10;
    if (closeInRange <= 0.3) score += 10; // close in bottom 30% of range
    if (isAboveAvgVol && isRed) score += 10;
  }

  return score;
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

// Summarize intraday 1h candles into a compact string for Claude
export function summarizeIntradayCandles(ticker: string, candles: Candle[]): string {
  if (candles.length === 0) return '';

  const latest = candles[candles.length - 1];
  const oldest = candles[0];
  const overallChange = ((latest.c - oldest.o) / oldest.o * 100).toFixed(1);
  const highOfPeriod = Math.max(...candles.map(c => c.h)).toFixed(2);
  const lowOfPeriod = Math.min(...candles.map(c => c.l)).toFixed(2);
  const avgVol = candles.reduce((s, c) => s + c.v, 0) / candles.length;
  const lastVol = latest.v;
  const volRatio = avgVol > 0 ? (lastVol / avgVol).toFixed(1) : '1.0';

  // Last 4 hourly candles as recent context
  const recentHours = candles.slice(-4).map(c => {
    const dir = c.c >= c.o ? '▲' : '▼';
    return `${c.t.split('T')[1]?.slice(0, 5)} ${dir}${c.c.toFixed(2)}`;
  }).join(' ');

  return `${ticker} intraday(2d): ${overallChange}% overall | H:${highOfPeriod} L:${lowOfPeriod} | Last 4h: ${recentHours} | LastVol:${volRatio}x avg`;
}

// ETF/leveraged product list — excluded from StockTwits sentiment
const SENTIMENT_EXCLUDED = new Set([
  'SPY', 'QQQ', 'IWM', 'TQQQ', 'SQQQ', 'SOXS', 'SOXL', 'TNA', 'TZA',
  'DIA', 'XLK', 'XLF', 'XLE', 'XLV', 'XLC', 'XLRE', 'XLI', 'XLU', 'XLB', 'XLP', 'XLY',
]);

export async function fetchStockTwitsSentiment(
  tickers: string[]
): Promise<Record<string, { sentiment: 'bullish' | 'bearish' | 'neutral'; bullCount: number; bearCount: number; total: number }>> {
  const results: Record<string, { sentiment: 'bullish' | 'bearish' | 'neutral'; bullCount: number; bearCount: number; total: number }> = {};

  // Only process real stocks, skip ETFs and leveraged products
  const stockTickers = tickers.filter(t => !SENTIMENT_EXCLUDED.has(t));

  await Promise.all(
    stockTickers.slice(0, 15).map(async (ticker) => {
      try {
        const response = await axios.get(
          `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
          { timeout: 4000 }
        );
        const messages: Array<{ entities?: { sentiment?: { basic?: string } } }> =
          response.data?.messages ?? [];

        let bullCount = 0;
        let bearCount = 0;
        for (const msg of messages) {
          const s = msg.entities?.sentiment?.basic;
          if (s === 'Bullish') bullCount++;
          else if (s === 'Bearish') bearCount++;
        }
        const total = bullCount + bearCount;
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if (total >= 3) {
          const bullPct = bullCount / total;
          if (bullPct >= 0.65) sentiment = 'bullish';
          else if (bullPct <= 0.35) sentiment = 'bearish';
        }
        results[ticker] = { sentiment, bullCount, bearCount, total };
      } catch {
        // Silently skip — StockTwits rate limits or 404 for unknown tickers
      }
    })
  );

  return results;
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

export async function fetchIntradayCandles(tickers: string[]): Promise<Record<string, Candle[]> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 2); // Last 2 trading days of hourly data

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: tickers.join(','),
        timeframe: '1Hour',
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        limit: 200,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
    const trimmed: Record<string, Candle[]> = {};
    for (const [ticker, candles] of Object.entries(bars)) {
      trimmed[ticker] = candles.slice(-16); // Last 16 hours (~2 trading days)
    }
    return trimmed;
  } catch (err) {
    console.error('Alpaca intraday fetch error:', err);
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

export async function fetchPricesForTickers(tickers: string[]): Promise<Record<string, number>> {
  if (!hasAlpacaKeys() || tickers.length === 0) return {};
  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  try {
    const response = await axios.get(`${endpoint}/v2/stocks/trades/latest`, {
      headers: getAlpacaHeaders(),
      params: { symbols: tickers.join(','), feed: 'iex' },
    });
    const trades = response.data.trades as Record<string, { p: number }>;
    const prices: Record<string, number> = {};
    for (const [ticker, trade] of Object.entries(trades)) prices[ticker] = trade.p;
    return prices;
  } catch (err) {
    console.error('[alpaca] fetchPricesForTickers error:', err);
    return {};
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

// ─── Weekly Candles ──────────────────────────────────────────────────────────
// Fetches last 3 weekly candles for broader trend context

export async function fetchWeeklyCandles(
  tickers: string[]
): Promise<Record<string, Candle[]> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28); // 4 weeks back gives us 3+ weekly bars

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: tickers.join(','),
        timeframe: '1Week',
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        limit: 200,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
    const trimmed: Record<string, Candle[]> = {};
    for (const [ticker, candles] of Object.entries(bars)) {
      trimmed[ticker] = candles.slice(-3); // Last 3 weeks
    }
    return trimmed;
  } catch (err) {
    console.error('Alpaca weekly candles error:', err);
    return null;
  }
}

// ─── Pre-market Candles ──────────────────────────────────────────────────────
// 15-minute bars covering today's pre-market session (4am–9:30am ET)
// Note: availability depends on Alpaca subscription tier; fails gracefully.

export async function fetchPremarketCandles(
  tickers: string[]
): Promise<Record<string, Candle[]> | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';

  // Today from 4am ET (8am UTC) to now
  const today = new Date().toISOString().split('T')[0];

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: tickers.slice(0, 20).join(','),
        timeframe: '15Min',
        start: `${today}T08:00:00Z`,  // 4am ET = 8am UTC
        end: `${today}T13:30:00Z`,    // 9:30am ET = 13:30 UTC
        limit: 200,
        feed: 'iex',
      },
    });

    const bars = response.data.bars as Record<string, Candle[]>;
    const result: Record<string, Candle[]> = {};
    for (const [ticker, candles] of Object.entries(bars)) {
      if (candles.length > 0) result[ticker] = candles;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    // Free-tier IEX feed may not support extended hours — silently skip
    return null;
  }
}

// ─── VWAP Computation ────────────────────────────────────────────────────────
// Computes today's VWAP from intraday 1h candles.
// VWAP = Σ(typicalPrice × volume) / Σ(volume) where typicalPrice = (H+L+C)/3

function computeVWAP(candles: Candle[]): number | null {
  if (candles.length === 0) return null;

  // Use only today's candles
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCandles = candles.filter(c => c.t.startsWith(todayStr));
  if (todayCandles.length === 0) return null;

  let numerator = 0;
  let denominator = 0;
  for (const c of todayCandles) {
    const typicalPrice = (c.h + c.l + c.c) / 3;
    numerator += typicalPrice * c.v;
    denominator += c.v;
  }
  return denominator > 0 ? numerator / denominator : null;
}

// Compute VWAP for all tickers in an intraday candle map
export function computeVWAPMap(
  intradayData: Record<string, Candle[]>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [ticker, candles] of Object.entries(intradayData)) {
    const vwap = computeVWAP(candles);
    if (vwap != null) result[ticker] = vwap;
  }
  return result;
}

// Summarize pre-market candles for a ticker into a compact string
export function summarizePremarket(ticker: string, candles: Candle[]): string {
  if (candles.length === 0) return '';

  const first = candles[0];
  const last = candles[candles.length - 1];
  const pmChange = ((last.c - first.o) / first.o * 100).toFixed(2);
  const direction = parseFloat(pmChange) >= 0 ? '+' : '';
  const high = Math.max(...candles.map(c => c.h)).toFixed(2);
  const low = Math.min(...candles.map(c => c.l)).toFixed(2);

  return `${ticker} pre-mkt: ${direction}${pmChange}% | H:$${high} L:$${low} | Last:$${last.c.toFixed(2)}`;
}

// Summarize weekly candles for a ticker into a compact string
export function summarizeWeeklyCandles(ticker: string, candles: Candle[]): string {
  if (candles.length === 0) return '';

  const lines = candles.map(c => {
    const dir = c.c >= c.o ? 'bull' : 'bear';
    const chg = ((c.c - c.o) / c.o * 100).toFixed(1);
    return `wk:${c.t.split('T')[0]} O${c.o.toFixed(0)} C${c.c.toFixed(0)} ${chg}% ${dir}`;
  });
  return `${ticker} weekly(3wk): ${lines.join(' | ')}`;
}

// ─── Chart data for the research-mode stock chart ────────────────────────────

export type ChartRange = 'max' | '2y' | '1y' | 'ytd' | '1m' | '1w' | '1d' | 'now';

export const CHART_RANGES: ChartRange[] = ['max', '2y', '1y', 'ytd', '1m', '1w', '1d', 'now'];

// timeframe granularity per range; lastSessionOnly trims to the most recent trading day
const CHART_RANGE_CONFIG: Record<ChartRange, { timeframe: string; daysBack: number | 'ytd' | 'max'; lastSessionOnly?: boolean }> = {
  max: { timeframe: '1Week', daysBack: 'max' },
  '2y': { timeframe: '1Day', daysBack: 731 },
  '1y': { timeframe: '1Day', daysBack: 366 },
  ytd: { timeframe: '1Day', daysBack: 'ytd' },
  '1m': { timeframe: '1Hour', daysBack: 32 },
  '1w': { timeframe: '30Min', daysBack: 8 },
  '1d': { timeframe: '5Min', daysBack: 5, lastSessionOnly: true },
  now: { timeframe: '1Min', daysBack: 5, lastSessionOnly: true },
};

export async function fetchChartCandles(ticker: string, range: ChartRange): Promise<Candle[] | null> {
  if (!hasAlpacaKeys()) return null;

  const endpoint = process.env.ALPACA_ENDPOINT || 'https://data.alpaca.markets';
  const cfg = CHART_RANGE_CONFIG[range];

  const start = new Date();
  if (cfg.daysBack === 'max') {
    start.setFullYear(2000, 0, 1);
  } else if (cfg.daysBack === 'ytd') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - cfg.daysBack);
  }

  try {
    const response = await axios.get(`${endpoint}/v2/stocks/bars`, {
      headers: getAlpacaHeaders(),
      params: {
        symbols: ticker,
        timeframe: cfg.timeframe,
        start: start.toISOString(),
        limit: 10000,
        feed: 'iex',
        adjustment: 'split',
      },
    });

    const bars = (response.data.bars as Record<string, Candle[]>)[ticker];
    if (!bars || bars.length === 0) return null;

    if (cfg.lastSessionOnly) {
      const lastDate = bars[bars.length - 1].t.split('T')[0];
      return bars.filter(c => c.t.startsWith(lastDate));
    }
    return bars;
  } catch (err) {
    console.error(`Alpaca chart fetch error for ${ticker} (${range}):`, err);
    return null;
  }
}

export { WATCHLIST, hasAlpacaKeys };
