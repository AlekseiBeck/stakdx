# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (root + server + client)
npm run install:all

# Development (run in separate terminals)
npm run dev:server    # Express backend on :3001 with ts-node-dev hot reload
npm run dev:client    # Vite frontend on :3000 with HMR

# Production build
npm run build:server  # tsc → server/dist/
npm run build:client  # tsc + vite build → client/dist/
```

No test or lint scripts are configured.

## Architecture

Full-stack swing trading dashboard: React frontend, Express backend, connected to Alpaca Markets, Claude AI, Supabase, Finnhub, NewsAPI, Reddit, and StockTwits.

### Backend (`server/src/`)

`index.ts` is the single Express entry point — all ~20 API routes live there. Key modules:

- **`alpaca.ts`** — Market data: 5-day OHLCV candles, news, live prices, StockTwits sentiment, intraday data, weekly candles, premarket candles, VWAP, and `fetchChartCandles(ticker, range)` for the research-mode chart (range → granularity mapping in `CHART_RANGE_CONFIG`). Watchlist is ~240 tickers defined inline.
- **`claude.ts`** — AI analysis and chat. `runScanPipeline()` scores all tickers locally, takes top 30, enriches with multi-source data, splits into 2 batches of 15. **Models:** `claude-opus-4-8` (`ANALYSIS_MODEL`) with `thinking: {type: 'adaptive'}` for scan batches, position verdicts, and chat; `claude-haiku-4-5` (`FAST_MODEL`) for the cheap pre-processing layers (macro regime, news scoring). **All JSON responses use structured outputs** (`output_config.format` with JSON schemas defined at the top of the file) — never parse markdown fences; the API guarantees schema-valid JSON in the text block (use `responseText()` to skip thinking blocks). `streamChat()` uses the server-side `web_search_20260209` tool — the API executes searches itself; the loop only handles `stop_reason: 'pause_turn'` by re-sending the assistant turn. It's non-streaming (waits for full response) then yields the complete text. The chat system prompt is two blocks: a frozen `CHAT_PERSONA` (cache-friendly, contains the Bloomberg-analyst tone rules: no markdown headers, no horizontal rules, no emojis) + a dynamic live-data block.
- **`brokerage.ts`** — Alpaca Paper Trading API: place orders, fetch live positions/orders/account.
- **`finnhub.ts`** — Company news (last 72h) + earnings calendar (7-day window) + economic calendar.
- **`reddit.ts`** — Reddit sentiment scraping for watchlist tickers.
- **`newsapi.ts`** — NewsAPI.org search: fixed macro queries + per-position ticker queries fetched at chat context load time.
- **`db.ts`** — Supabase CRUD for: positions, brokerage accounts, push subscriptions, **chat sessions**, **chat messages**.
- **`auth.ts`** — `requireAuth` middleware: validates Supabase JWT on all `/api/*` routes.
- **`encryption.ts`** — AES-256-GCM for storing user Alpaca API keys.
- **`notifications.ts`** — Web Push (VAPID): send alerts, manage subscriptions, price monitor loop.
- **`mockData.ts`** — Demo fallback. If `ANTHROPIC_API_KEY` or `ALPACA_API_KEY` are absent, the app serves mock data and shows a yellow "Demo" banner.

### Frontend (`client/src/`)

- **`App.tsx`** — Root component. Manages all scan/position/news state. Desktop layout: 2/3 chat + 1/3 sidebar (Scan/Positions/News tabs). Mobile layout: 4-tab bottom nav (Chat / Scan / Positions / News) — no drawer overlays.
- **`api.ts`** — All `/api/*` fetch calls centralized here. Components never call `fetch` directly. Includes chat session CRUD functions.
- **`AuthContext.tsx`** — `useAuth()` hook wrapping Supabase auth.
- **`types.ts`** — Shared TypeScript interfaces (`TradeRecommendation`, `Position`, etc.).
- **`components/ChatPanel.tsx`** — AI chat with persistent history sidebar. On desktop the sidebar is always visible (left column); on mobile it slides in via a hamburger toggle. Sessions are auto-created from the first message (title = truncated first message). Messages are saved to Supabase after each AI response.
- **`components/Header.tsx`** — Top nav. Desktop: single row. Mobile: two rows — row 1 has logo + LONG/BOTH/SHORT + market status + sign out; row 2 has Run Scan + buying power input + Paper button.
- **`components/ModeSwitcher.tsx`** — LONG / BOTH / SHORT pill toggle for scan direction.
- Other components: `RecommendationsTable`, `RecommendationCard`, `PositionsPanel`, `PaperTradingPanel`, `ConnectBrokerageModal`, `ExecuteTradeModal`, `NewsPanel`.

### Key Data Flows

**Scan flow:**
1. User clicks "Run Scan" → GET `/api/scan/stream` (SSE)
2. Backend fetches candles for ~240 tickers → scores locally → selects top 30
3. Enriches top 30: NewsAPI, Finnhub news, StockTwits sentiment, intraday/weekly/premarket candles, Reddit sentiment, earnings flags, macro regime classification
4. Two parallel Claude calls (15 tickers each) → streams batches back via SSE
5. Frontend renders cards with `fadeInUp` animation as each batch arrives

**Chat flow:**
1. Frontend loads chat context: `GET /api/chat/context` (candle summaries + Finnhub news + NewsAPI articles)
2. User sends message → `POST /api/chat/stream` (SSE)
3. Backend runs agentic loop: Claude may call `web_search` 1–3 times before producing final text
4. Full response yielded at once (no token streaming) → frontend displays it
5. After response: `POST /api/chat/sessions/:id/messages` saves both turns to Supabase

**Chat history:**
- `GET /api/chat/sessions` — list user's sessions (50 most recent)
- `POST /api/chat/sessions` — create session (title = first message, max 100 chars)
- `PATCH /api/chat/sessions/:id` — rename session and/or set `is_research` / `ticker`. Un-marking research clears the ticker and bumps `updated_at` to now (the chat re-dates to today by design).
- `DELETE /api/chat/sessions/:id` — delete session + cascade messages
- `GET /api/chat/sessions/:id/messages` — load messages for a session
- `POST /api/chat/sessions/:id/messages` — append messages

**Research mode (chat):**
- A chat toggles into "research" via the flask button in the chat top bar (works pre-send for new chats and on existing chats). Research chats carry a `ticker` tag — auto-detected client-side ($TSLA syntax, watchlist match against `GET /api/watchlist`, or the company-name map in `ChatPanel.tsx`), with a manual ticker input fallback in the top bar.
- Research chats with a ticker pin a `StockChart` (TradingView `lightweight-charts` v5, candlestick + volume) above the messages. Ranges: MAX / 2Y / 1Y / YTD / 1M / 1W / 1D / NOW — default 2Y; natural-language time references in user messages ("this week", "ytd", "today") auto-switch the range via `detectRange()` in `ChatPanel.tsx`.
- The history sidebar groups research chats into collapsible per-ticker folders under a "Research" section; regular chats list below under "Chats".
- `GET /api/chart/:ticker?range=2y` — OHLCV candles for the chart
- `GET /api/watchlist` — ticker universe for client-side detection
- New columns require the migration in `server/migrations/2026-06-12-research-mode.sql`.

**Paper Trading flow:**
User enters Alpaca key/secret → backend verifies, AES-256-GCM encrypts, stores in Supabase → on trade: backend decrypts, calls `paper-api.alpaca.markets`, returns order confirmation.

## Supabase Schema

Tables that must exist (run these migrations if setting up fresh):

```sql
-- Positions
create table public.positions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  entry_price numeric not null,
  entry_time timestamptz not null,
  direction text not null,
  stop_loss numeric,
  target numeric,
  notified_stop boolean default false,
  notified_target boolean default false
);
alter table public.positions enable row level security;
create policy "Users own positions" on public.positions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Brokerage accounts
create table public.brokerage_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  encrypted_api_key text not null,
  encrypted_secret_key text not null,
  account_type text not null default 'paper',
  primary key (user_id, broker)
);
alter table public.brokerage_accounts enable row level security;
create policy "Users own brokerage accounts" on public.brokerage_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Push subscriptions
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "Users own push subs" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chat sessions
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  is_research boolean not null default false,  -- research-mode flag (migration: server/migrations/2026-06-12-research-mode.sql)
  ticker text,                                 -- stock tag for research chats, e.g. 'NVDA'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.chat_sessions (user_id, updated_at desc);
create index chat_sessions_research_idx on public.chat_sessions (user_id, ticker) where ticker is not null;
alter table public.chat_sessions enable row level security;
create policy "Users own chat sessions" on public.chat_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

## Environment Variables

**`server/.env`:**
```
ANTHROPIC_API_KEY=
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_ENDPOINT=https://data.alpaca.markets
ALPACA_PAPER_ENDPOINT=https://paper-api.alpaca.markets
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FINNHUB_API_KEY=
NEWSAPI_KEY=
ENCRYPTION_KEY=          # 64-char hex string (openssl rand -hex 32)
VAPID_PUBLIC_KEY=        # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=           # mailto:you@example.com
CLIENT_URL=              # e.g. http://localhost:3000
PORT=3001
```

**`client/.env.local`:**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Patterns to Follow

- **Centralized API calls:** All fetch logic belongs in `client/src/api.ts`. Components never call `fetch` directly.
- **SSE streaming:** The scan endpoint uses Server-Sent Events for real-time progress. The chat stream endpoint also uses SSE but delivers the full text in one event (agentic loop completes before yielding).
- **Parallel enrichment:** Use `Promise.all()` for independent data fetches.
- **Auth enforcement:** All new protected routes must use the `requireAuth` middleware from `auth.ts`.
- **Demo mode:** If adding new external API calls, check for missing keys and fall back to mock data so the demo mode stays functional.
- **TypeScript strict:** Both `server/tsconfig.json` and `client/tsconfig.json` use strict mode — no `any` unless unavoidable.
- **Mobile layout:** The app uses a 4-tab bottom nav on mobile (`lg:hidden`). Don't add drawer/popup overlays — use tabs instead. Safe-area insets (`env(safe-area-inset-*)`) must be applied to any element that anchors to the bottom on mobile.
- **Overflow discipline:** `html`, `body`, and `#root` are all `overflow: hidden; height: 100%`. The App root is `h-full`. Internal scroll happens only inside designated `overflow-y-auto` containers.
- **Border consistency:** Sub-panel headers (History sidebar, chat top bar, right sidebar tabs) all use `h-12` and `border-[#222225]` so their bottom borders align.
- **Chat AI tone:** The `streamChat` system prompt enforces: no `##`/`###` headers, no `---` dividers, no emojis. Write like a Bloomberg analyst — dense, factual, structured with plain dashes.
- **Design system:** Fonts — `Clash Display` (`.font-display`, headings/logo) + `Satoshi` (body) via Fontshare, `IBM Plex Mono` (`.mono`, all numbers/tickers/prices) via Google Fonts. Icons — `@phosphor-icons/react` (typically `weight="duotone"` for accents, `"bold"` for controls); do NOT add inline heroicon-style SVGs. Textures — `.noise-overlay` (fixed film grain, landing/auth) and `.dot-grid` utilities in `index.css`. Accent color stays amber.
- **AI calls:** Use `ANALYSIS_MODEL` / `FAST_MODEL` constants in `claude.ts` — don't hardcode model IDs elsewhere. New JSON-returning calls must use structured outputs (`output_config.format`) with a schema, not prompt-and-parse.

## PWA / Icons

- Icons live in `client/public/icons/` — sizes 72, 96, 128, 144, 152, 180, 192, 512px
- Regenerate with: `node client/public/icons/generate-icons.js` (requires `canvas` npm package)
- `apple-touch-icon` links in `index.html` point to `icon-180.png` and `icon-152.png`
- In-app logo uses `stakd-logo.png` (the original bar-chart logo) — do NOT replace with generated icons
- Service worker at `client/public/sw.js` — cache name `stakdx-v1`
