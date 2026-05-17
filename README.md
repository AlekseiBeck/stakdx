# Stakdx — AI-Powered Swing Trading Assistant

A full-stack swing trading dashboard powered by Claude AI, Alpaca Markets, and Supabase — with real-time web search, persistent chat history, push alerts, and paper trading integration.

---

## Features

- **AI Market Scan** — Screens 240+ tickers, surfaces highest-conviction LONG / SHORT / CALL / PUT setups with entry zones, stops, targets, and confidence scores. Two parallel Claude calls stream results back in batches.
- **AI Trading Chat** — Streaming chat with real-time web search (Anthropic `web_search` tool). Knows your open positions, live prices, candle summaries, and latest news. Persistent session history stored in Supabase.
- **Chat History** — Previous conversations saved per user with a sidebar for quick access. Auto-titled from the first message.
- **Stop / Target Alerts** — Push notifications fire the moment a position hits its stop loss or profit target (iOS PWA + Android Chrome).
- **Position Tracker** — Log trades, get live AI HOLD / SELL / CAUTION verdicts, track paper P&L.
- **Paper Trading** — Execute trades directly against Alpaca's paper brokerage with one tap.
- **Live News** — Market news from Alpaca (24h), Finnhub (72h), and NewsAPI.org (7-day, broader sources).
- **Demo Mode** — Fully functional with mock data when API keys are not configured.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Claude Sonnet 4.6 (Anthropic) · web_search_20250305 built-in tool |
| Market Data | Alpaca Markets API |
| Sentiment | StockTwits · Reddit |
| News | Alpaca News · Finnhub · NewsAPI.org |
| Auth & Database | Supabase (JWT + PostgreSQL) |
| Paper Trading | Alpaca Paper Trading API |
| Push Notifications | Web Push (VAPID) — iOS 16.4+ PWA, Android Chrome |
| Deployment | Railway (backend) · Vercel (frontend) |

---

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment variables

**`server/.env`:**
```env
ANTHROPIC_API_KEY=
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_ENDPOINT=https://data.alpaca.markets
ALPACA_PAPER_ENDPOINT=https://paper-api.alpaca.markets
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FINNHUB_API_KEY=
NEWSAPI_KEY=
ENCRYPTION_KEY=         # 64-char hex: openssl rand -hex 32
VAPID_PUBLIC_KEY=       # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
CLIENT_URL=http://localhost:3000
PORT=3001
```

**`client/.env.local`:**
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> The app runs in Demo mode with mock data if API keys are absent.

### 3. Run Supabase migrations

Run these SQL statements in your Supabase SQL editor:

```sql
-- Positions
create table public.positions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null, entry_price numeric not null,
  entry_time timestamptz not null, direction text not null,
  stop_loss numeric, target numeric,
  notified_stop boolean default false, notified_target boolean default false
);
alter table public.positions enable row level security;
create policy "Users own positions" on public.positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Brokerage accounts
create table public.brokerage_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null, encrypted_api_key text not null,
  encrypted_secret_key text not null, account_type text not null default 'paper',
  primary key (user_id, broker)
);
alter table public.brokerage_accounts enable row level security;
create policy "Users own brokerage" on public.brokerage_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Push subscriptions
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null,
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "Users own push subs" on public.push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chat sessions
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.chat_sessions (user_id, updated_at desc);
alter table public.chat_sessions enable row level security;
create policy "Users own chat sessions" on public.chat_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chat messages
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages (session_id, created_at asc);
alter table public.chat_messages enable row level security;
create policy "Users own chat messages" on public.chat_messages for all
  using (session_id in (select id from public.chat_sessions where user_id = auth.uid()))
  with check (session_id in (select id from public.chat_sessions where user_id = auth.uid()));
```

### 4. Start development servers

```bash
# Terminal 1 — backend on :3001
npm run dev:server

# Terminal 2 — frontend on :3000
npm run dev:client
```

---

## Push Notifications

- Requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `server/.env`
- Generate keys: `npx web-push generate-vapid-keys`
- **iOS:** Must be installed as a PWA (Safari → Share → Add to Home Screen). Requires iOS 16.4+
- **Android:** Works in Chrome without installation
- Alerts check every 2 minutes during market hours (9:30 AM – 4:00 PM ET, Mon–Fri)

---

## Production Build

```bash
npm run build:server   # tsc → server/dist/
npm run build:client   # tsc + vite → client/dist/
```

---

## PWA Icons

Icons live in `client/public/icons/`. To regenerate:

```bash
cd client/public/icons
node generate-icons.js   # requires: npm install canvas
```
