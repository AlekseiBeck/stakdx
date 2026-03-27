import { supabase } from './supabase';
import { TradeRecommendation, NewsItem, Position, PositionUpdate } from './types';

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

export async function runScan(): Promise<{ recommendations: TradeRecommendation[]; mock: boolean }> {
  return get('/scan');
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
  direction: 'long' | 'short'
): Promise<Position> {
  const data = await post('/positions', { ticker, entryPrice, direction });
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
