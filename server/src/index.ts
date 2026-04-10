import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  fetchCandles,
  fetchCandlesForTicker,
  fetchNews,
  fetchNewsForTicker,
  fetchLatestPrices,
  fetchMarketNews,
  scoreTicker,
  scoreTickerForMode,
  fetchStockTwitsSentiment,
  fetchIntradayCandles,
} from './alpaca';
import { analyzeCandlesWithClaude, analyzeBatchWithClaude, analyzePositionWithClaude } from './claude';
import { fetchFinnhubNews, fetchUpcomingEarnings } from './finnhub';
import { MOCK_RECOMMENDATIONS, MOCK_NEWS, MOCK_POSITION_UPDATE } from './mockData';
import { requireAuth, AuthRequest } from './auth';
import { hasDatabase, getPositions, createPosition, deletePosition, findPositionByTicker } from './db';
import { Position } from './types';
import { WATCHLIST } from './alpaca';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:3000']
  : ['http://localhost:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Fallback in-memory store (used when Supabase is not configured)
const memPositions = new Map<string, Position & { userId: string }>();

// GET /api/scan
app.get('/api/scan', requireAuth, async (req, res) => {
  const buyingPower = req.query.buyingPower ? parseFloat(req.query.buyingPower as string) : null;
  const focusDirections = req.query.directions
    ? (req.query.directions as string).split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
    : [];
  const mode = (req.query.mode as string | undefined) ?? 'both';
  const scanMode = (mode === 'long' || mode === 'short') ? mode : 'both';

  try {
    const [candles, news, marketNews, prices, finnhubNewsData, earningsData] = await Promise.all([
      fetchCandles(),
      fetchNews(),
      fetchMarketNews(),
      fetchLatestPrices(),
      fetchFinnhubNews(WATCHLIST.filter(t => !['SPY','QQQ','IWM','DIA','XLK','XLF','XLE','XLV','XLC','XLRE','XLI','XLU','XLB','XLP','XLY','TQQQ','SQQQ','SOXS','SOXL','TNA','TZA'].includes(t)).slice(0, 10)),
      fetchUpcomingEarnings(WATCHLIST),
    ]);

    if (!candles) {
      return res.json({ recommendations: MOCK_RECOMMENDATIONS, prices: {}, mock: true });
    }

    // Pre-filter: score all tickers using mode-aware scoring, keep top 30
    const scored = Object.entries(candles)
      .map(([ticker, c]) => ({ ticker, score: scoreTickerForMode(c, scanMode) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const topCandles: Record<string, typeof candles[string]> = {};
    for (const { ticker } of scored) {
      topCandles[ticker] = candles[ticker];
    }

    console.log(`[scan] mode=${scanMode} Pre-filtered ${Object.keys(candles).length} tickers → top ${scored.length}: ${scored.map(s => s.ticker).join(', ')}`);

    const topTickers = scored.map(s => s.ticker);

    // Fetch StockTwits sentiment and intraday candles for top tickers
    const [stockTwitsSentiment, intradayCandles] = await Promise.all([
      fetchStockTwitsSentiment(topTickers.slice(0, 15)),
      fetchIntradayCandles(topTickers.slice(0, 20)),
    ]);

    const newsItems = news ?? MOCK_NEWS;
    const recommendations = await analyzeCandlesWithClaude(
      topCandles,
      newsItems,
      marketNews,
      buyingPower,
      focusDirections,
      stockTwitsSentiment,
      finnhubNewsData,
      earningsData,
      intradayCandles ?? {}
    );

    if (!recommendations) {
      return res.json({ recommendations: MOCK_RECOMMENDATIONS, prices: prices ?? {}, mock: true });
    }

    return res.json({ recommendations, prices: prices ?? {}, mock: false });
  } catch (err) {
    console.error('[scan] Error:', err);
    return res.status(500).json({ recommendations: MOCK_RECOMMENDATIONS, mock: true });
  }
});

// GET /api/scan/stream — SSE streaming endpoint
app.get('/api/scan/stream', requireAuth, async (req: AuthRequest, res) => {
  const buyingPower = req.query.buyingPower ? parseFloat(req.query.buyingPower as string) : null;
  const focusDirections = req.query.directions
    ? (req.query.directions as string).split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
    : [];
  const mode = (req.query.mode as string | undefined) ?? 'both';
  const scanMode = (mode === 'long' || mode === 'short') ? mode : 'both';

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const [candles, news, marketNews, prices, finnhubNewsData, earningsData] = await Promise.all([
      fetchCandles(),
      fetchNews(),
      fetchMarketNews(),
      fetchLatestPrices(),
      fetchFinnhubNews(WATCHLIST.filter(t => !['SPY','QQQ','IWM','DIA','XLK','XLF','XLE','XLV','XLC','XLRE','XLI','XLU','XLB','XLP','XLY','TQQQ','SQQQ','SOXS','SOXL','TNA','TZA'].includes(t)).slice(0, 10)),
      fetchUpcomingEarnings(WATCHLIST),
    ]);

    if (!candles) {
      sendEvent({ recommendations: MOCK_RECOMMENDATIONS, done: true, prices: {}, mock: true });
      res.end();
      return;
    }

    // Pre-filter with mode-aware scoring
    const scored = Object.entries(candles)
      .map(([ticker, c]) => ({ ticker, score: scoreTickerForMode(c, scanMode) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const topTickers = scored.map(s => s.ticker);

    console.log(`[scan/stream] mode=${scanMode} Pre-filtered ${Object.keys(candles).length} tickers → top ${scored.length}`);

    // Fetch StockTwits sentiment and intraday candles for top tickers
    const [stockTwitsSentiment, intradayCandles] = await Promise.all([
      fetchStockTwitsSentiment(topTickers.slice(0, 15)),
      fetchIntradayCandles(topTickers.slice(0, 20)),
    ]);

    const newsItems = news ?? MOCK_NEWS;
    const intradayMap = intradayCandles ?? {};

    // Split top stocks into two batches
    const midpoint = Math.ceil(topTickers.length / 2);
    const batch1Tickers = topTickers.slice(0, midpoint);
    const batch2Tickers = topTickers.slice(midpoint);

    const batch1Entries: [string, typeof candles[string]][] = batch1Tickers.map(t => [t, candles[t]]);
    const batch2Entries: [string, typeof candles[string]][] = batch2Tickers.map(t => [t, candles[t]]);

    // Build per-batch intraday slices so each batch only gets its own tickers
    const batch1Intraday: Record<string, typeof intradayMap[string]> = {};
    for (const t of batch1Tickers) {
      if (intradayMap[t]) batch1Intraday[t] = intradayMap[t];
    }
    const batch2Intraday: Record<string, typeof intradayMap[string]> = {};
    for (const t of batch2Tickers) {
      if (intradayMap[t]) batch2Intraday[t] = intradayMap[t];
    }

    // Fire batch 1
    const batch1Results = await analyzeBatchWithClaude(
      batch1Entries,
      newsItems,
      marketNews,
      buyingPower,
      focusDirections,
      stockTwitsSentiment,
      finnhubNewsData,
      earningsData,
      batch1Intraday
    );
    sendEvent({ recommendations: batch1Results, done: false });

    // Fire batch 2
    const batch2Results = await analyzeBatchWithClaude(
      batch2Entries,
      newsItems,
      marketNews,
      buyingPower,
      focusDirections,
      stockTwitsSentiment,
      finnhubNewsData,
      earningsData,
      batch2Intraday
    );
    sendEvent({ recommendations: batch2Results, done: true, prices: prices ?? {} });

    res.end();
  } catch (err) {
    console.error('[scan/stream] Error:', err);
    sendEvent({ recommendations: MOCK_RECOMMENDATIONS, done: true, prices: {}, mock: true });
    res.end();
  }
});

// GET /api/news
app.get('/api/news', requireAuth, async (_req, res) => {
  try {
    const news = await fetchNews();
    if (!news) return res.json({ news: MOCK_NEWS, mock: true });
    return res.json({ news, mock: false });
  } catch (err) {
    console.error('[news] Error:', err);
    return res.status(500).json({ news: MOCK_NEWS, mock: true });
  }
});

// GET /api/positions
app.get('/api/positions', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  if (hasDatabase()) {
    const positions = await getPositions(userId);
    return res.json({ positions });
  }

  const positions = Array.from(memPositions.values())
    .filter((p) => p.userId === userId)
    .map(({ userId: _uid, ...p }) => p);
  return res.json({ positions });
});

// POST /api/positions
app.post('/api/positions', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { ticker, entryPrice, direction } = req.body as {
    ticker?: string;
    entryPrice?: number;
    direction?: 'long' | 'short';
  };

  if (!ticker || entryPrice == null || !direction) {
    return res.status(400).json({ error: 'ticker, entryPrice, and direction are required' });
  }

  const positionData = {
    ticker: ticker.toUpperCase(),
    entryPrice,
    entryTime: new Date().toISOString(),
    direction,
  };

  if (hasDatabase()) {
    try {
      const position = await createPosition(userId, positionData);
      return res.status(201).json({ position });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save position' });
    }
  }

  const id = String(Date.now());
  const position = { id, ...positionData };
  memPositions.set(id, { ...position, userId });
  return res.status(201).json({ position });
});

// DELETE /api/positions/:id
app.delete('/api/positions/:id', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;

  if (hasDatabase()) {
    const ok = await deletePosition(userId, id);
    if (!ok) return res.status(404).json({ error: 'Position not found' });
    return res.json({ success: true });
  }

  const pos = memPositions.get(id);
  if (!pos || pos.userId !== userId) return res.status(404).json({ error: 'Position not found' });
  memPositions.delete(id);
  return res.json({ success: true });
});

// GET /api/positions/:ticker/update
app.get('/api/positions/:ticker/update', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const ticker = req.params.ticker.toUpperCase();

  let position;
  if (hasDatabase()) {
    position = await findPositionByTicker(userId, ticker);
  } else {
    const mem = Array.from(memPositions.values()).find(
      (p) => p.ticker === ticker && p.userId === userId
    );
    position = mem ? (({ userId: _uid, ...p }) => p)(mem) : null;
  }

  if (!position) {
    return res.status(404).json({ error: `No open position found for ${ticker}` });
  }

  try {
    const [candles, news] = await Promise.all([
      fetchCandlesForTicker(ticker),
      fetchNewsForTicker(ticker),
    ]);

    if (!candles) return res.json({ update: MOCK_POSITION_UPDATE, mock: true });

    const update = await analyzePositionWithClaude(position, candles, news ?? []);
    if (!update) return res.json({ update: MOCK_POSITION_UPDATE, mock: true });

    return res.json({ update, mock: false });
  } catch (err) {
    console.error('[position update] Error:', err);
    return res.status(500).json({ update: MOCK_POSITION_UPDATE, mock: true });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Alpaca keys: ${process.env.ALPACA_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Finnhub key: ${process.env.FINNHUB_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Supabase: ${hasDatabase() ? 'SET' : 'NOT SET (using in-memory fallback)'}`);
});
