import { supabase } from './supabase';
import { TradeRecommendation, NewsItem, Position, PositionUpdate, ScanMode, BrokerageStatus, AlpacaAccount, AlpacaPosition, AlpacaOrder } from './types';

const BASE = ((import.meta as Record<string, any>).env.VITE_API_URL ?? '') + '/api';

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get(path: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path: string, body: unknown) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function del(path: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
}

export async function runScan(
  buyingPower?: number,
  focusDirections?: string[],
  mode?: ScanMode
): Promise<{ recommendations: TradeRecommendation[]; prices: Record<string, number>; mock: boolean }> {
  const params = new URLSearchParams();
  if (buyingPower) params.set('buyingPower', String(buyingPower));
  if (focusDirections && focusDirections.length > 0) params.set('directions', focusDirections.join(','));
  if (mode) params.set('mode', mode);
  const query = params.toString() ? `?${params.toString()}` : '';
  return get(`/scan${query}`);
}

export async function scanStream(
  buyingPower: number | undefined,
  mode: ScanMode,
  directions: string[],
  onBatch: (recommendations: TradeRecommendation[]) => void,
  onComplete: (prices: Record<string, number>) => void
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const params = new URLSearchParams();
  if (buyingPower) params.set('buyingPower', String(buyingPower));
  if (directions.length > 0) params.set('directions', directions.join(','));
  params.set('mode', mode);
  const query = params.toString() ? `?${params.toString()}` : '';

  // EventSource doesn't support custom headers — pass token as query param for SSE
  // The backend requireAuth middleware must handle this. We fall back to cookie/header approach
  // by using fetch with ReadableStream for full header support.
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${BASE}/scan/stream${query}`, { headers });
  if (!response.ok || !response.body) {
    throw new Error(`SSE stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.done === false) {
            onBatch(payload.recommendations ?? []);
          } else if (payload.done === true) {
            onBatch(payload.recommendations ?? []);
            onComplete(payload.prices ?? {});
          }
        } catch {
          // Malformed JSON line — skip
        }
      }
    }
  }
}

export async function fetchNews(): Promise<{ news: NewsItem[]; mock: boolean }> {
  return get('/news');
}

export async function fetchPositions(): Promise<Position[]> {
  const data = await get('/positions');
  return data.positions;
}

export async function addPosition(
  ticker: string,
  entryPrice: number,
  direction: 'long' | 'short',
  stopLoss?: number,
  target?: number
): Promise<Position> {
  const data = await post('/positions', { ticker, entryPrice, direction, stopLoss, target });
  return data.position;
}

export async function deletePosition(id: string): Promise<void> {
  await del(`/positions/${id}`);
}

export async function getPositionUpdate(
  ticker: string
): Promise<{ update: PositionUpdate; mock: boolean }> {
  return get(`/positions/${ticker}/update`);
}

// Brokerage API

export async function getBrokerageStatus(): Promise<BrokerageStatus> {
  return get('/brokerage/status');
}

export async function connectBrokerage(
  apiKey: string,
  secretKey: string,
  accountType: string
): Promise<{ success: boolean; accountType: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/brokerage/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ apiKey, secretKey, accountType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to connect brokerage');
  return data;
}

export async function disconnectBrokerage(): Promise<void> {
  await del('/brokerage/disconnect');
}

export async function getBrokerageAccount(): Promise<{ account: AlpacaAccount }> {
  return get('/brokerage/account');
}

export async function getBrokeragePositions(): Promise<{ positions: AlpacaPosition[]; orders: AlpacaOrder[] }> {
  return get('/brokerage/positions');
}

export async function placeOrder(order: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: string;
  limit_price?: number;
}): Promise<{ order: AlpacaOrder }> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/brokerage/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(order),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Order failed');
  return data;
}

export async function cancelBrokerageOrder(orderId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/brokerage/order/${orderId}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Failed to cancel order');
}

// ─── Push Notifications ───────────────────────────────────────────────────────

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const data = await get('/notifications/vapid-key');
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

export async function subscribeToNotifications(
  subscription: PushSubscriptionJSON
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }),
  });
  if (!res.ok) throw new Error('Failed to subscribe to notifications');
}

export async function unsubscribeFromNotifications(endpoint: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/notifications/unsubscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error('Failed to unsubscribe');
}

export async function fetchLivePrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) return {};
  const params = new URLSearchParams({ tickers: tickers.join(',') });
  const data = await get(`/prices?${params.toString()}`);
  return data.prices ?? {};
}

export type NewsAPIArticle = { title: string; source: string; publishedAt: string };
export type NewsAPIResult = { query: string; articles: NewsAPIArticle[] };

export async function fetchChatContext(positionTickers: string[]): Promise<{
  candleSummaries: Record<string, string>;
  tickerNews: Record<string, string[]>;
  newsAPIArticles: NewsAPIResult[];
}> {
  const params = new URLSearchParams({ tickers: positionTickers.join(',') });
  const data = await get(`/chat/context?${params.toString()}`);
  return {
    candleSummaries: data.candleSummaries ?? {},
    tickerNews: data.tickerNews ?? {},
    newsAPIArticles: data.newsAPIArticles ?? [],
  };
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function chatStream(
  messages: { role: 'user' | 'assistant'; content: string }[],
  context: {
    positions: Position[];
    scanResults: TradeRecommendation[];
    news: NewsItem[];
    prices: Record<string, number>;
    candleSummaries: Record<string, string>;
    tickerNews: Record<string, string[]>;
    newsAPIArticles: NewsAPIResult[];
  },
  onChunk: (text: string) => void
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages, context }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.text) onChunk(payload.text);
          if (payload.done) return;
          if (payload.error) throw new Error(payload.error);
        } catch {
          // Skip malformed lines
        }
      }
    }
  }
}
