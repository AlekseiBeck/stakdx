import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Position, StoredPushSubscription } from './types';

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
    stopLoss: row.stop_loss ?? undefined,
    target: row.target ?? undefined,
    notifiedStop: row.notified_stop ?? false,
    notifiedTarget: row.notified_target ?? false,
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
      stop_loss: position.stopLoss ?? null,
      target: position.target ?? null,
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
    stopLoss: data.stop_loss ?? undefined,
    target: data.target ?? undefined,
    notifiedStop: false,
    notifiedTarget: false,
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
    stopLoss: data.stop_loss ?? undefined,
    target: data.target ?? undefined,
    notifiedStop: data.notified_stop ?? false,
    notifiedTarget: data.notified_target ?? false,
  };
}

export async function getAllPositionsWithAlerts(): Promise<Array<Position & { userId: string }>> {
  const db = getClient();
  if (!db) return [];

  const { data, error } = await db
    .from('positions')
    .select('*')
    .not('stop_loss', 'is', null);

  if (error) { console.error('DB getAllPositionsWithAlerts error:', error); return []; }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    entryPrice: row.entry_price,
    entryTime: row.entry_time,
    direction: row.direction,
    stopLoss: row.stop_loss ?? undefined,
    target: row.target ?? undefined,
    notifiedStop: row.notified_stop ?? false,
    notifiedTarget: row.notified_target ?? false,
  }));
}

export async function markPositionNotified(
  positionId: string,
  field: 'notified_stop' | 'notified_target'
): Promise<void> {
  const db = getClient();
  if (!db) return;
  await db.from('positions').update({ [field]: true }).eq('id', positionId);
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

// ─── Push Subscriptions ──────────────────────────────────────────────────────

export async function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<void> {
  const db = getClient();
  if (!db) throw new Error('Database not configured');
  const { error } = await db
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, p256dh, auth },
      { onConflict: 'user_id,endpoint' }
    );
  if (error) throw error;
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const db = getClient();
  if (!db) return;
  await db
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);
}

export async function deleteExpiredPushSubscription(subId: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  await db.from('push_subscriptions').delete().eq('id', subId);
}

export async function getPushSubscriptionsForUser(
  userId: string
): Promise<StoredPushSubscription[]> {
  const db = getClient();
  if (!db) return [];
  const { data } = await db
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);
  return (data ?? []) as StoredPushSubscription[];
}

export async function getAllPushSubscriptions(): Promise<
  Array<StoredPushSubscription & { user_id: string }>
> {
  const db = getClient();
  if (!db) return [];
  const { data } = await db.from('push_subscriptions').select('*');
  return (data ?? []) as Array<StoredPushSubscription & { user_id: string }>;
}
