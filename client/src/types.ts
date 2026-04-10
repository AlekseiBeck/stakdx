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
  socialSentiment?: {
    sentiment: 'bullish' | 'bearish' | 'neutral';
    signal: string;
  };
  mode?: 'long' | 'short' | 'both';
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

export type ScanMode = 'long' | 'both' | 'short';

export interface BrokerageStatus {
  connected: boolean;
  accountType?: 'paper' | 'live';
}

export interface AlpacaAccount {
  cash: string;
  buying_power: string;
  equity: string;
  portfolio_value: string;
  account_number: string;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: string;
  type: string;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
}
