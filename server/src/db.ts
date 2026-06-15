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

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export interface WorkstationArticle {
  url: string;
  title: string;
  source?: string;
  addedAt?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  is_research?: boolean;
  ticker?: string | null;
  is_workstation?: boolean;
  tickers?: string[];
  layout?: string | null;
  articles?: WorkstationArticle[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function listChatSessions(userId: string): Promise<ChatSession[]> {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) { console.error('DB listChatSessions error:', error); return []; }
  return (data ?? []) as ChatSession[];
}

export async function createChatSession(userId: string, title: string): Promise<ChatSession> {
  const db = getClient()!;
  const { data, error } = await db
    .from('chat_sessions')
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw new Error(`DB createChatSession error: ${error.message}`);
  return data as ChatSession;
}

export async function updateChatSessionTitle(userId: string, sessionId: string, title: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  await db
    .from('chat_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
}

// Update research flag / ticker tag. Un-marking research bumps updated_at to now
// (per product spec: the chat re-dates to the current time). Marking research or
// changing the ticker preserves updated_at so the chat keeps its place in history.
export async function updateChatSessionResearch(
  userId: string,
  sessionId: string,
  fields: { is_research?: boolean; ticker?: string | null }
): Promise<ChatSession | null> {
  const db = getClient();
  if (!db) return null;

  const patch: Record<string, unknown> = {};
  if (fields.is_research !== undefined) {
    patch.is_research = fields.is_research;
    if (fields.is_research) {
      // Research and workstation are mutually exclusive — clear workstation state.
      patch.is_workstation = false;
      patch.tickers = [];
    } else {
      patch.ticker = null;
      patch.updated_at = new Date().toISOString();
    }
  }
  if (fields.ticker !== undefined && fields.is_research !== false) {
    patch.ticker = fields.ticker;
  }

  const { data, error } = await db
    .from('chat_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    console.error('DB updateChatSessionResearch error:', error.message);
    return null;
  }
  return data as ChatSession;
}

// Update workstation flag / loaded tickers / split layout. Marking a session as a
// workstation clears research state (the two modes are mutually exclusive). Un-marking
// clears the tickers + layout and re-dates the chat to now (mirrors research un-mark).
export async function updateChatSessionWorkstation(
  userId: string,
  sessionId: string,
  fields: { is_workstation?: boolean; tickers?: string[]; layout?: string | null; articles?: WorkstationArticle[] }
): Promise<ChatSession | null> {
  const db = getClient();
  if (!db) return null;

  const patch: Record<string, unknown> = {};
  if (fields.is_workstation !== undefined) {
    patch.is_workstation = fields.is_workstation;
    if (fields.is_workstation) {
      patch.is_research = false;
      patch.ticker = null;
    } else {
      patch.tickers = [];
      patch.layout = null;
      patch.articles = [];
      patch.updated_at = new Date().toISOString();
    }
  }
  if (fields.tickers !== undefined && fields.is_workstation !== false) {
    patch.tickers = fields.tickers;
  }
  if (fields.layout !== undefined && fields.is_workstation !== false) {
    patch.layout = fields.layout;
  }
  if (fields.articles !== undefined && fields.is_workstation !== false) {
    patch.articles = fields.articles;
  }

  const { data, error } = await db
    .from('chat_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    console.error('DB updateChatSessionWorkstation error:', error.message);
    return null;
  }
  return data as ChatSession;
}

export async function deleteChatSession(userId: string, sessionId: string): Promise<void> {
  const db = getClient();
  if (!db) return;
  // Messages are deleted via ON DELETE CASCADE
  await db
    .from('chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);
}

export async function getChatMessages(userId: string, sessionId: string): Promise<ChatMessage[]> {
  const db = getClient();
  if (!db) return [];
  // Verify ownership first
  const { data: session } = await db
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();
  if (!session) return [];

  const { data, error } = await db
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) { console.error('DB getChatMessages error:', error); return []; }
  return (data ?? []) as ChatMessage[];
}

export async function appendChatMessages(
  userId: string,
  sessionId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<void> {
  const db = getClient();
  if (!db) return;
  const rows = messages.map(m => ({ session_id: sessionId, role: m.role, content: m.content }));
  const { error } = await db.from('chat_messages').insert(rows);
  if (error) { console.error('DB appendChatMessages error:', error); return; }
  // Bump session updated_at
  await db
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
}
