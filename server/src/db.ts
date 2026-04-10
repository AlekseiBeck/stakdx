import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Position } from './types';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}

export function hasDatabase(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getPositions(userId: string): Promise<Position[]> {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .order('entry_time', { ascending: false });

  if (error) { console.error('DB getPositions error:', error); return []; }

  return (data ?? []).map((row) => ({
    id: row.id,
    ticker: row.ticker,
    entryPrice: row.entry_price,
    entryTime: row.entry_time,
    direction: row.direction,
  }));
}

export async function createPosition(userId: string, position: Omit<Position, 'id'>): Promise<Position> {
  const db = getClient()!;
  const id = String(Date.now());

  const { data, error } = await db
    .from('positions')
    .insert({
      id,
      user_id: userId,
      ticker: position.ticker,
      entry_price: position.entryPrice,
      entry_time: position.entryTime,
      direction: position.direction,
    })
    .select()
    .single();

  if (error) throw new Error(`DB createPosition error: ${error.message}`);

  return {
    id: data.id,
    ticker: data.ticker,
    entryPrice: data.entry_price,
    entryTime: data.entry_time,
    direction: data.direction,
  };
}

export async function deletePosition(userId: string, positionId: string): Promise<boolean> {
  const db = getClient();
  if (!db) return false;

  const { error } = await db
    .from('positions')
    .delete()
    .eq('id', positionId)
    .eq('user_id', userId);

  if (error) { console.error('DB deletePosition error:', error); return false; }
  return true;
}

export async function findPositionByTicker(userId: string, ticker: string): Promise<Position | null> {
  const db = getClient();
  if (!db) return null;

  const { data, error } = await db
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('ticker', ticker.toUpperCase())
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    ticker: data.ticker,
    entryPrice: data.entry_price,
    entryTime: data.entry_time,
    direction: data.direction,
  };
}

// Brokerage account storage

export async function getBrokerageAccount(userId: string): Promise<{ encrypted_api_key: string; encrypted_secret_key: string; account_type: string } | null> {
  const db = getClient();
  if (!db) return null;
  const { data } = await db
    .from('brokerage_accounts')
    .select('encrypted_api_key, encrypted_secret_key, account_type')
    .eq('user_id', userId)
    .single();
  return data ?? null;
}

export async function saveBrokerageAccount(userId: string, encryptedApiKey: string, encryptedSecretKey: string, accountType: string): Promise<void> {
  const db = getClient();
  if (!db) throw new Error('Database not configured');
  const { error } = await db
    .from('brokerage_accounts')
    .upsert(
      { user_id: userId, broker: 'alpaca', encrypted_api_key: encryptedApiKey, encrypted_secret_key: encryptedSecretKey, account_type: accountType },
      { onConflict: 'user_id,broker' }
    );
  if (error) throw error;
}

export async function deleteBrokerageAccount(userId: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  await db.from('brokerage_accounts').delete().eq('user_id', userId);
}
