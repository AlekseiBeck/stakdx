export interface TradeRecommendation {
  ticker: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  entryZone: string;
  stopLoss: string;
  target: string;
  timeframe: string;
  rationale: string;
  pattern: string;
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
