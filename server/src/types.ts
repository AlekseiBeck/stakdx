export interface TradeRecommendation {
  ticker: string;
  direction: 'LONG' | 'SHORT' | 'CALL' | 'PUT';
  confidence: number;
  entryZone: string;
  stopLoss: string;
  target: string;
  timeframe: string;
  rationale: string;
  pattern: string;
  positionSize: string;
  maxRisk: string;
  potentialGain: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  createdAt: string;
  symbols: string[];
}

export interface Position {
  id: string;
  ticker: string;
  entryPrice: number;
  entryTime: string;
  direction: 'long' | 'short';
  stopLoss?: number;
  target?: number;
  notifiedStop?: boolean;
  notifiedTarget?: boolean;
}

export interface PositionUpdate {
  verdict: 'HOLD' | 'SELL' | 'CAUTION';
  reasoning: string;
  currentPrice: string;
  priceChange: string;
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ─── Macro Regime ───────────────────────────────────────────────────────────

export type MarketRegime = 'RISK_ON' | 'RISK_OFF' | 'MIXED';
export type FedStance = 'HAWKISH' | 'NEUTRAL' | 'DOVISH';

export interface MacroRegime {
  regime: MarketRegime;
  fedStance: FedStance;
  topRisks: string[];
  sectorBias: Record<string, 'bullish' | 'bearish' | 'neutral'>;
  summary: string;
}

// ─── Pre-scored News ─────────────────────────────────────────────────────────

export type NewsImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type NewsDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type NewsCategory =
  | 'earnings'
  | 'macro'
  | 'regulatory'
  | 'product'
  | 'ma'
  | 'geopolitical'
  | 'other';

export interface ScoredNewsItem {
  headline: string;
  ticker?: string;
  source: string;
  impact: NewsImpact;
  direction: NewsDirection;
  category: NewsCategory;
}

// ─── Reddit Sentiment ────────────────────────────────────────────────────────

export interface RedditSentimentEntry {
  ticker: string;
  mentions: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  topPost: string;
}

// ─── Economic Calendar ───────────────────────────────────────────────────────

export interface EconomicEvent {
  event: string;
  date: string;
  impact: 'high' | 'medium';
  country: string;
}

// ─── Push Notifications ──────────────────────────────────────────────────────

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
