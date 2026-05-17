import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  fetchCandles,
  fetchCandlesForTicker,
  fetchNews,
  fetchNewsForTicker,
  fetchLatestPrices,
  fetchPricesForTickers,
  summarizeCandles,
  fetchMarketNews,
  scoreTicker,
  scoreTickerForMode,
  fetchStockTwitsSentiment,
  fetchIntradayCandles,
  fetchWeeklyCandles,
  fetchPremarketCandles,
  computeVWAPMap,
} from './alpaca';
import {
  analyzeCandlesWithClaude,
  analyzeBatchWithClaude,
  analyzePositionWithClaude,
  classifyMacroRegime,
  scoreNewsImpact,
  streamChat,
} from './claude';
import { fetchFinnhubNews, fetchUpcomingEarnings, fetchEconomicCalendar } from './finnhub';
import { searchNews } from './newsapi';
import type { NewsAPIResult } from './newsapi';
import { fetchRedditSentiment } from './reddit';
import { MOCK_RECOMMENDATIONS, MOCK_NEWS, MOCK_POSITION_UPDATE } from './mockData';
import { requireAuth, AuthRequest } from './auth';
import {
  hasDatabase,
  getPositions,
  createPosition,
  deletePosition,
  findPositionByTicker,
  getBrokerageAccount,
  saveBrokerageAccount,
  deleteBrokerageAccount,
  getAllPositionsWithAlerts,
  markPositionNotified,
  savePushSubscription,
  deletePushSubscription,
  deleteExpiredPushSubscription,
  getPushSubscriptionsForUser,
  listChatSessions,
  createChatSession,
  updateChatSessionTitle,
  deleteChatSession,
  getChatMessages,
  appendChatMessages,
} from './db';
import { Position, MacroRegime, ScoredNewsItem, NewsItem, Candle } from './types';
import type { EarningsEvent, EconomicEvent } from './finnhub';
import { encrypt, decrypt } from './encryption';
import {
  fetchAccount,
  fetchPositions as fetchAlpacaPositions,
  fetchOrders,
  placeOrder,
  cancelOrder,
} from './brokerage';
import { WATCHLIST } from './alpaca';
import { initWebPush, hasVapidKeys, sendToUser } from './notifications';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:3000']
  : ['http://localhost:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Initialize web push on startup
initWebPush();

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Keyed by userId (set by requireAuth) so a VPN change doesn't reset the counter.
// Two-layer chat limit: burst stops scripts, hourly stops sustained abuse.

function rateLimitKey(req: express.Request): string {
  return (req as AuthRequest).userId ?? 'anon';
}

// Chat burst: 5 messages/minute — a real conversation averages ~1/min; 5/min is generous headroom
const chatBurstLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages — slow down a bit.' },
});

// Chat sustained: 40 messages/hour — more than enough for heavy real use
const chatHourLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 40,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hourly message limit reached. Try again later.' },
});

// Scan: 4 scans/5 minutes — each scan takes ~30s, so 4 manual scans in 5 min is already fast
const scanLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 4,
  keyGenerator: rateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scan requests. Wait a moment before scanning again.' },
});

// ─── Input validation helpers ─────────────────────────────────────────────────

// Validates a ticker symbol: uppercase letters, digits, dots only (covers BRK.A etc.), max 10 chars
function sanitizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  return /^[A-Z0-9.]{1,10}$/.test(t) ? t : null;
}

// Validates the messages array sent to the AI chat endpoint
function isValidMessageArray(val: unknown): val is Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(val) || val.length === 0 || val.length > 100) return false;
  return val.every(m => {
    if (m === null || typeof m !== 'object') return false;
    const { role, content } = m as Record<string, unknown>;
    return (role === 'user' || role === 'assistant') &&
      typeof content === 'string' &&
      content.length > 0 &&
      content.length <= 20000;
  });
}

// In-memory fallback positions store (no DB)
const memPositions = new Map<string, Position & { userId: string }>();

// ─── ETFs to exclude from Finnhub news (not companies) ───────────────────────
const ETF_TICKERS = new Set([
  'SPY','QQQ','IWM','DIA','XLK','XLF','XLE','XLV','XLC','XLRE','XLI','XLU','XLB','XLP','XLY',
  'TQQQ','SQQQ','SOXS','SOXL','TNA','TZA','ARKG',
]);

// ─── Shared scan pipeline ─────────────────────────────────────────────────────
// Used by both /api/scan and /api/scan/stream to avoid code duplication.

async function runScanPipeline(
  scanMode: 'long' | 'short' | 'both'
): Promise<{
  candles: Record<string, Candle[]> | null;
  topTickers: string[];
  topCandles: Record<string, Candle[]>;
  weeklyData: Record<string, Candle[]>;
  intradayData: Record<string, Candle[]>;
  premarketData: Record<string, Candle[]>;
  vwapMap: Record<string, number>;
  macroRegime: MacroRegime | null;
  scoredNews: ScoredNewsItem[];
  stockTwitsSentiment: Record<string, any>;
  redditSentiment: Record<string, any>;
  earningsData: EarningsEvent[];
  economicEvents: EconomicEvent[];
  prices: Record<string, number>;
  newsItems: NewsItem[];
  marketNews: NewsItem[];
}> {
  const stockTickers = WATCHLIST.filter(t => !ETF_TICKERS.has(t));

  // ── Phase 1: fetch all raw data in parallel ──────────────────────────────
  const [candles, news, marketNews, prices, finnhubNewsData, earningsData, economicEvents] =
    await Promise.all([
      fetchCandles(),
      fetchNews(),
      fetchMarketNews(),
      fetchLatestPrices(),
      fetchFinnhubNews(stockTickers.slice(0, 10)),
      fetchUpcomingEarnings(WATCHLIST),
      fetchEconomicCalendar(),
    ]);

  const newsItems = news ?? MOCK_NEWS;

  if (!candles) {
    return {
      candles: null, topTickers: [], topCandles: {}, weeklyData: {}, intradayData: {},
      premarketData: {}, vwapMap: {}, macroRegime: null, scoredNews: [],
      stockTwitsSentiment: {}, redditSentiment: {}, earningsData, economicEvents,
      prices: prices ?? {}, newsItems, marketNews,
    };
  }

  // ── Phase 2: pre-filter top 30 tickers ──────────────────────────────────
  const scored = Object.entries(candles)
    .map(([ticker, c]) => ({ ticker, score: scoreTickerForMode(c, scanMode) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const topTickers = scored.map(s => s.ticker);
  const topCandles: Record<string, typeof candles[string]> = {};
  for (const { ticker } of scored) topCandles[ticker] = candles[ticker];

  console.log(`[scan] mode=${scanMode} → top ${topTickers.length}: ${topTickers.join(', ')}`);

  // Combine all news for scoring
  const allNewsForScoring = [
    ...newsItems.map(n => ({ headline: n.headline, ticker: n.symbols[0], source: n.source })),
    ...finnhubNewsData.map(n => ({ headline: n.headline, ticker: n.ticker, source: n.source })),
  ];

  // ── Phase 3: enrich data + run Haiku analysis layers in parallel ─────────
  const spyCandles = candles['SPY'] ?? [];
  const qqqCandles = candles['QQQ'] ?? [];

  const [
    macroRegime,
    scoredNews,
    stockTwitsSentiment,
    intradayCandles,
    premarketCandles,
    weeklyCandles,
    redditSentiment,
  ] = await Promise.all([
    classifyMacroRegime(spyCandles, qqqCandles, marketNews, economicEvents),
    scoreNewsImpact(allNewsForScoring),
    fetchStockTwitsSentiment(topTickers.slice(0, 15)),
    fetchIntradayCandles(topTickers.slice(0, 20)),
    fetchPremarketCandles(topTickers.slice(0, 20)),
    fetchWeeklyCandles(topTickers),
    fetchRedditSentiment(topTickers),
  ]);

  const intradayData = intradayCandles ?? {};
  const premarketData = premarketCandles ?? {};
  const weeklyData = weeklyCandles ?? {};
  const vwapMap = computeVWAPMap(intradayData);

  return {
    candles, topTickers, topCandles, weeklyData, intradayData, premarketData, vwapMap,
    macroRegime, scoredNews, stockTwitsSentiment, redditSentiment,
    earningsData, economicEvents, prices: prices ?? {}, newsItems, marketNews,
  };
}

// ─── GET /api/scan ────────────────────────────────────────────────────────────
app.get('/api/scan', requireAuth, async (req, res) => {
  const buyingPower = req.query.buyingPower ? parseFloat(req.query.buyingPower as string) : null;
  const focusDirections = req.query.directions
    ? (req.query.directions as string).split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
    : [];
  const mode = (req.query.mode as string | undefined) ?? 'both';
  const scanMode = (mode === 'long' || mode === 'short') ? mode : 'both';

  try {
    const pipeline = await runScanPipeline(scanMode);

    if (!pipeline.candles) {
      return res.json({ recommendations: MOCK_RECOMMENDATIONS, prices: {}, mock: true });
    }

    const recommendations = await analyzeCandlesWithClaude(
      pipeline.topCandles,
      pipeline.weeklyData,
      pipeline.intradayData,
      pipeline.premarketData,
      pipeline.vwapMap,
      pipeline.macroRegime,
      pipeline.scoredNews,
      pipeline.economicEvents,
      pipeline.earningsData,
      pipeline.stockTwitsSentiment,
      pipeline.redditSentiment,
      buyingPower,
      focusDirections
    );

    if (!recommendations) {
      return res.json({ recommendations: MOCK_RECOMMENDATIONS, prices: pipeline.prices, mock: true });
    }

    return res.json({ recommendations, prices: pipeline.prices, mock: false });
  } catch (err) {
    console.error('[scan] Error:', err);
    return res.status(500).json({ recommendations: MOCK_RECOMMENDATIONS, mock: true });
  }
});

// ─── GET /api/scan/stream — SSE streaming ────────────────────────────────────
app.get('/api/scan/stream', requireAuth, scanLimiter, async (req: AuthRequest, res) => {
  const buyingPower = req.query.buyingPower ? parseFloat(req.query.buyingPower as string) : null;
  const focusDirections = req.query.directions
    ? (req.query.directions as string).split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
    : [];
  const mode = (req.query.mode as string | undefined) ?? 'both';
  const scanMode = (mode === 'long' || mode === 'short') ? mode : 'both';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const pipeline = await runScanPipeline(scanMode);

    if (!pipeline.candles) {
      sendEvent({ recommendations: MOCK_RECOMMENDATIONS, done: true, prices: {}, mock: true });
      res.end();
      return;
    }

    const { topTickers, topCandles, weeklyData, intradayData, premarketData, vwapMap,
      macroRegime, scoredNews, economicEvents, earningsData,
      stockTwitsSentiment, redditSentiment, prices } = pipeline;

    const mid = Math.ceil(topTickers.length / 2);
    const batch1Tickers = topTickers.slice(0, mid);
    const batch2Tickers = topTickers.slice(mid);

    const sliceForBatch = <T>(map: Record<string, T>, tickers: string[]) => {
      const out: Record<string, T> = {};
      for (const t of tickers) if (map[t]) out[t] = map[t];
      return out;
    };

    const batch1Entries: [string, typeof topCandles[string]][] = batch1Tickers.map(t => [t, topCandles[t]]);
    const batch2Entries: [string, typeof topCandles[string]][] = batch2Tickers.map(t => [t, topCandles[t]]);

    // Fire batch 1
    const batch1 = await analyzeBatchWithClaude(
      batch1Entries,
      sliceForBatch(weeklyData, batch1Tickers),
      sliceForBatch(intradayData, batch1Tickers),
      sliceForBatch(premarketData, batch1Tickers),
      sliceForBatch(vwapMap, batch1Tickers),
      macroRegime, scoredNews, economicEvents, earningsData,
      sliceForBatch(stockTwitsSentiment, batch1Tickers),
      sliceForBatch(redditSentiment, batch1Tickers),
      buyingPower, focusDirections
    );
    sendEvent({ recommendations: batch1, done: false });

    // Fire batch 2
    const batch2 = await analyzeBatchWithClaude(
      batch2Entries,
      sliceForBatch(weeklyData, batch2Tickers),
      sliceForBatch(intradayData, batch2Tickers),
      sliceForBatch(premarketData, batch2Tickers),
      sliceForBatch(vwapMap, batch2Tickers),
      macroRegime, scoredNews, economicEvents, earningsData,
      sliceForBatch(stockTwitsSentiment, batch2Tickers),
      sliceForBatch(redditSentiment, batch2Tickers),
      buyingPower, focusDirections
    );
    sendEvent({ recommendations: batch2, done: true, prices });

    res.end();
  } catch (err) {
    console.error('[scan/stream] Error:', err);
    sendEvent({ recommendations: MOCK_RECOMMENDATIONS, done: true, prices: {}, mock: true });
    res.end();
  }
});

// ─── GET /api/news ────────────────────────────────────────────────────────────
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

// ─── GET /api/prices — live prices for specific tickers ──────────────────────
app.get('/api/prices', requireAuth, async (req: AuthRequest, res) => {
  const tickersParam = req.query.tickers as string | undefined;
  if (!tickersParam) return res.status(400).json({ error: 'tickers query param required' });
  const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const prices = await fetchPricesForTickers(tickers);
  return res.json({ prices });
});

// ─── GET /api/positions ───────────────────────────────────────────────────────
app.get('/api/positions', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  if (hasDatabase()) {
    const positions = await getPositions(userId);
    return res.json({ positions });
  }
  const positions = Array.from(memPositions.values())
    .filter(p => p.userId === userId)
    .map(({ userId: _uid, ...p }) => p);
  return res.json({ positions });
});

// ─── POST /api/positions ──────────────────────────────────────────────────────
app.post('/api/positions', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { ticker, entryPrice, direction, stopLoss, target } = req.body as {
    ticker?: string;
    entryPrice?: number;
    direction?: 'long' | 'short';
    stopLoss?: number;
    target?: number;
  };

  if (!ticker || entryPrice == null || !direction) {
    return res.status(400).json({ error: 'ticker, entryPrice, and direction are required' });
  }

  const cleanTicker = sanitizeTicker(String(ticker));
  if (!cleanTicker) return res.status(400).json({ error: 'Invalid ticker symbol' });

  if (typeof entryPrice !== 'number' || entryPrice <= 0) {
    return res.status(400).json({ error: 'entryPrice must be a positive number' });
  }
  if (!['long', 'short'].includes(String(direction))) {
    return res.status(400).json({ error: 'direction must be long or short' });
  }

  const positionData: Omit<Position, 'id'> = {
    ticker: cleanTicker,
    entryPrice,
    entryTime: new Date().toISOString(),
    direction,
    stopLoss: stopLoss ?? undefined,
    target: target ?? undefined,
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

// ─── DELETE /api/positions/:id ────────────────────────────────────────────────
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

// ─── GET /api/positions/:ticker/update ───────────────────────────────────────
app.get('/api/positions/:ticker/update', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const ticker = sanitizeTicker(req.params.ticker);
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker symbol' });

  let position;
  if (hasDatabase()) {
    position = await findPositionByTicker(userId, ticker);
  } else {
    const mem = Array.from(memPositions.values()).find(p => p.ticker === ticker && p.userId === userId);
    position = mem ? (({ userId: _uid, ...p }) => p)(mem) : null;
  }

  if (!position) {
    return res.status(404).json({ error: `No open position found for ${ticker}` });
  }

  try {
    const [candles, news] = await Promise.all([fetchCandlesForTicker(ticker), fetchNewsForTicker(ticker)]);
    if (!candles) return res.json({ update: MOCK_POSITION_UPDATE, mock: true });
    const update = await analyzePositionWithClaude(position, candles, news ?? []);
    if (!update) return res.json({ update: MOCK_POSITION_UPDATE, mock: true });
    return res.json({ update, mock: false });
  } catch (err) {
    console.error('[position update] Error:', err);
    return res.status(500).json({ update: MOCK_POSITION_UPDATE, mock: true });
  }
});

// ─── Notification routes ──────────────────────────────────────────────────────

// GET /api/notifications/vapid-key — serve public VAPID key to frontend
app.get('/api/notifications/vapid-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  return res.json({ publicKey: key });
});

// POST /api/notifications/subscribe — store a push subscription
app.post('/api/notifications/subscribe', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required' });
  }

  if (!hasDatabase()) {
    return res.status(503).json({ error: 'Push notifications require a database connection' });
  }

  try {
    await savePushSubscription(userId, endpoint, keys.p256dh, keys.auth);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[notifications/subscribe] error:', err?.message);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// DELETE /api/notifications/unsubscribe — remove a push subscription
app.delete('/api/notifications/unsubscribe', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  try {
    await deletePushSubscription(userId, endpoint);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

// ─── Brokerage routes ─────────────────────────────────────────────────────────

async function getUserBrokerageKeys(userId: string): Promise<{ apiKey: string; secretKey: string } | null> {
  const account = await getBrokerageAccount(userId);
  if (!account) return null;
  try {
    return { apiKey: decrypt(account.encrypted_api_key), secretKey: decrypt(account.encrypted_secret_key) };
  } catch { return null; }
}

app.post('/api/brokerage/connect', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { apiKey, secretKey, accountType = 'paper' } = req.body as { apiKey?: string; secretKey?: string; accountType?: string };
  if (!apiKey || !secretKey) return res.status(400).json({ error: 'apiKey and secretKey required' });
  if (!hasDatabase()) return res.status(503).json({ error: 'Brokerage linking requires a database connection' });
  try { await fetchAccount(apiKey, secretKey); } catch {
    return res.status(400).json({ error: 'Invalid Alpaca credentials — could not connect to account' });
  }
  try {
    await saveBrokerageAccount(userId, encrypt(apiKey), encrypt(secretKey), accountType);
    return res.json({ success: true, accountType });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save brokerage account', detail: err?.message });
  }
});

app.get('/api/brokerage/status', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.json({ connected: false });
  const account = await getBrokerageAccount(req.userId!);
  if (!account) return res.json({ connected: false });
  return res.json({ connected: true, accountType: account.account_type });
});

app.delete('/api/brokerage/disconnect', requireAuth, async (req: AuthRequest, res) => {
  await deleteBrokerageAccount(req.userId!);
  return res.json({ success: true });
});

app.get('/api/brokerage/account', requireAuth, async (req: AuthRequest, res) => {
  const keys = await getUserBrokerageKeys(req.userId!);
  if (!keys) return res.status(404).json({ error: 'No brokerage account connected' });
  try {
    const account = await fetchAccount(keys.apiKey, keys.secretKey);
    return res.json({ account });
  } catch { return res.status(502).json({ error: 'Failed to reach Alpaca' }); }
});

app.get('/api/brokerage/positions', requireAuth, async (req: AuthRequest, res) => {
  const keys = await getUserBrokerageKeys(req.userId!);
  if (!keys) return res.status(404).json({ error: 'No brokerage account connected' });
  try {
    const [positions, orders] = await Promise.all([
      fetchAlpacaPositions(keys.apiKey, keys.secretKey),
      fetchOrders(keys.apiKey, keys.secretKey),
    ]);
    return res.json({ positions, orders });
  } catch { return res.status(502).json({ error: 'Failed to reach Alpaca' }); }
});

app.post('/api/brokerage/order', requireAuth, async (req: AuthRequest, res) => {
  const keys = await getUserBrokerageKeys(req.userId!);
  if (!keys) return res.status(404).json({ error: 'No brokerage account connected' });
  const { symbol, qty, side, type = 'market', time_in_force = 'day', limit_price } = req.body as {
    symbol?: string; qty?: number; side?: 'buy' | 'sell';
    type?: 'market' | 'limit'; time_in_force?: 'day' | 'gtc'; limit_price?: number;
  };
  if (!symbol || !qty || !side) return res.status(400).json({ error: 'symbol, qty, and side are required' });
  try {
    const order = await placeOrder(keys.apiKey, keys.secretKey, { symbol, qty, side, type, time_in_force, limit_price });
    return res.status(201).json({ order });
  } catch (err: any) {
    return res.status(400).json({ error: err?.response?.data?.message ?? 'Order failed' });
  }
});

app.delete('/api/brokerage/order/:orderId', requireAuth, async (req: AuthRequest, res) => {
  const keys = await getUserBrokerageKeys(req.userId!);
  if (!keys) return res.status(404).json({ error: 'No brokerage account connected' });
  try {
    await cancelOrder(keys.apiKey, keys.secretKey, req.params.orderId);
    return res.json({ success: true });
  } catch { return res.status(400).json({ error: 'Failed to cancel order' }); }
});

// ─── GET /api/chat/context — candle summaries for chat context ───────────────
// Always includes SPY, QQQ, SOXX, SMH, VGT for macro/sector awareness.
// Caller passes additional tickers (position tickers) to enrich.
const MARKET_CONTEXT_TICKERS = ['SPY', 'QQQ', 'SOXX', 'SMH', 'VGT'];

app.get('/api/chat/context', requireAuth, async (req: AuthRequest, res) => {
  const tickersParam = req.query.tickers as string | undefined;
  const positionTickers = tickersParam
    ? tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : [];

  const allCancleTickers = [...new Set([...MARKET_CONTEXT_TICKERS, ...positionTickers])];

  // Fixed NewsAPI macro queries + per-position ticker queries (up to 3)
  const NEWSAPI_FIXED = [
    'US China trade tariff deal',
    'semiconductor chip stock market',
    'Federal Reserve interest rates',
    'stock market rally earnings',
  ];
  const tickerQueries = positionTickers.slice(0, 3);
  const newsAPIQueries = [...NEWSAPI_FIXED, ...tickerQueries];

  // Fetch candles + Finnhub news + NewsAPI in parallel
  const [candleResults, finnhubResults, newsAPIResults] = await Promise.all([
    Promise.all(
      allCancleTickers.map(ticker =>
        fetchCandlesForTicker(ticker)
          .then(candles => ({ ticker, candles }))
          .catch(() => ({ ticker, candles: null }))
      )
    ),
    positionTickers.length > 0
      ? fetchFinnhubNews(positionTickers).catch(() => [])
      : Promise.resolve([]),
    Promise.all(
      newsAPIQueries.map(query =>
        searchNews(query, 5)
          .then(articles => ({ query, articles }))
          .catch(() => ({ query, articles: [] }))
      )
    ),
  ]);

  const candleSummaries: Record<string, string> = {};
  for (const { ticker, candles } of candleResults) {
    if (candles && candles.length > 0) {
      candleSummaries[ticker] = summarizeCandles(ticker, candles);
    }
  }

  // Group Finnhub news headlines by ticker
  const tickerNews: Record<string, string[]> = {};
  for (const item of finnhubResults) {
    if (!tickerNews[item.ticker]) tickerNews[item.ticker] = [];
    if (tickerNews[item.ticker].length < 5) tickerNews[item.ticker].push(item.headline);
  }

  const newsAPIArticles: NewsAPIResult[] = newsAPIResults.filter(r => r.articles.length > 0);

  return res.json({ candleSummaries, tickerNews, newsAPIArticles });
});

// ─── Chat: streaming AI assistant ────────────────────────────────────────────

app.post('/api/chat/stream', requireAuth, chatBurstLimiter, chatHourLimiter, async (req: AuthRequest, res) => {
  const { messages, context } = req.body as {
    messages?: unknown;
    context?: {
      positions?: unknown[];
      scanResults?: unknown[];
      news?: unknown[];
      prices?: Record<string, number>;
      candleSummaries?: Record<string, string>;
      tickerNews?: Record<string, string[]>;
      newsAPIArticles?: NewsAPIResult[];
    };
  };

  if (!isValidMessageArray(messages)) {
    return res.status(400).json({ error: 'messages must be a non-empty array of up to 100 messages, each under 20,000 characters' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const ctx = {
      positions: (context?.positions ?? []) as import('./types').Position[],
      scanResults: (context?.scanResults ?? []) as import('./types').TradeRecommendation[],
      news: (context?.news ?? []) as import('./types').NewsItem[],
      prices: (context?.prices ?? {}) as Record<string, number>,
      candleSummaries: (context?.candleSummaries ?? {}) as Record<string, string>,
      tickerNews: (context?.tickerNews ?? {}) as Record<string, string[]>,
      newsAPIArticles: (context?.newsAPIArticles ?? []) as NewsAPIResult[],
    };

    for await (const chunk of streamChat(messages, ctx)) {
      sendEvent({ text: chunk });
    }
    sendEvent({ done: true });
  } catch (err) {
    console.error('[chat/stream] Error:', err);
    sendEvent({ error: 'Chat failed' });
  }

  res.end();
});

// ─── Chat Session routes ──────────────────────────────────────────────────────

// GET /api/chat/sessions — list sessions for the user
app.get('/api/chat/sessions', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.json({ sessions: [] });
  const sessions = await listChatSessions(req.userId!);
  return res.json({ sessions });
});

// POST /api/chat/sessions — create a new session
app.post('/api/chat/sessions', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured' });
  const { title = 'New Chat' } = req.body as { title?: string };
  try {
    const session = await createChatSession(req.userId!, title.slice(0, 100));
    return res.status(201).json({ session });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// PATCH /api/chat/sessions/:id — rename session
app.patch('/api/chat/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured' });
  const { title } = req.body as { title?: unknown };
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title must be a non-empty string' });
  await updateChatSessionTitle(req.userId!, req.params.id, title.slice(0, 100));
  return res.json({ success: true });
});

// DELETE /api/chat/sessions/:id — delete session + messages
app.delete('/api/chat/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured' });
  await deleteChatSession(req.userId!, req.params.id);
  return res.json({ success: true });
});

// GET /api/chat/sessions/:id/messages — load messages for a session
app.get('/api/chat/sessions/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.json({ messages: [] });
  const messages = await getChatMessages(req.userId!, req.params.id);
  return res.json({ messages });
});

// POST /api/chat/sessions/:id/messages — append messages to a session
app.post('/api/chat/sessions/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured' });
  const { messages } = req.body as { messages?: unknown };
  if (!isValidMessageArray(messages)) return res.status(400).json({ error: 'messages must be a valid array' });
  await appendChatMessages(req.userId!, req.params.id, messages);
  return res.json({ success: true });
});

// ─── Price Monitor: stop/target push alerts ───────────────────────────────────
// Runs every 2 minutes during US market hours (9:30am–4:00pm ET Mon–Fri).
// Checks all tracked positions with stop_loss or target set.
// Fires a push notification the first time a threshold is crossed.

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  // US Eastern: UTC-5 (EST) or UTC-4 (EDT)
  // Approximate: market open 13:30 UTC, close 20:00 UTC
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 810 && totalMinutes < 1200; // 13:30–20:00 UTC
}

async function runPriceAlertCheck(): Promise<void> {
  if (!hasDatabase() || !hasVapidKeys()) return;
  if (!isMarketHours()) return;

  try {
    const positions = await getAllPositionsWithAlerts();
    if (positions.length === 0) return;

    // Fetch current prices for all relevant tickers
    const tickers = [...new Set(positions.map(p => p.ticker))];
    const prices = await fetchLatestPrices();
    if (!prices) return;

    for (const pos of positions) {
      const price = prices[pos.ticker];
      if (price == null) continue;

      const subs = await getPushSubscriptionsForUser((pos as any).userId);
      if (subs.length === 0) continue;

      // Stop loss alert
      if (pos.stopLoss != null && !pos.notifiedStop) {
        const hitStop = pos.direction === 'long'
          ? price <= pos.stopLoss
          : price >= pos.stopLoss;

        if (hitStop) {
          console.log(`[alerts] ${pos.ticker} hit stop loss $${pos.stopLoss} (current: $${price})`);
          await sendToUser(subs, {
            title: `Stakdx: ${pos.ticker} hit stop loss`,
            body: `${pos.ticker} is at $${price.toFixed(2)} — stop loss of $${pos.stopLoss.toFixed(2)} triggered. Consider closing your ${pos.direction} position.`,
            tag: `stop-${pos.id}`,
          }, deleteExpiredPushSubscription);
          await markPositionNotified(pos.id, 'notified_stop');
        }
      }

      // Target alert
      if (pos.target != null && !pos.notifiedTarget) {
        const hitTarget = pos.direction === 'long'
          ? price >= pos.target
          : price <= pos.target;

        if (hitTarget) {
          console.log(`[alerts] ${pos.ticker} hit target $${pos.target} (current: $${price})`);
          await sendToUser(subs, {
            title: `Stakdx: ${pos.ticker} hit target`,
            body: `${pos.ticker} reached $${price.toFixed(2)} — target of $${pos.target.toFixed(2)} achieved! Consider taking profit on your ${pos.direction} position.`,
            tag: `target-${pos.id}`,
          }, deleteExpiredPushSubscription);
          await markPositionNotified(pos.id, 'notified_target');
        }
      }
    }
  } catch (err) {
    console.error('[alerts] Price monitor error:', err);
  }
}

// Start price alert monitor (every 2 minutes)
const ALERT_INTERVAL_MS = 2 * 60 * 1000;
setInterval(runPriceAlertCheck, ALERT_INTERVAL_MS);

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Alpaca keys: ${process.env.ALPACA_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Finnhub key: ${process.env.FINNHUB_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`Supabase: ${hasDatabase() ? 'SET' : 'NOT SET (using in-memory fallback)'}`);
  console.log(`Encryption key: ${process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`VAPID keys: ${hasVapidKeys() ? 'SET (push notifications active)' : 'NOT SET (push disabled)'}`);
  console.log(`NewsAPI key: ${process.env.NEWSAPI_KEY ? 'SET' : 'NOT SET'}`);
});
