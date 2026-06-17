# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What StakdX Is

StakdX is an AI co-pilot for retail **swing / short-term traders** — a single dashboard that finds setups, researches them, and tracks the resulting positions through to exit. It pairs Claude's reasoning with live market data (Alpaca), fundamental/calendar data (Finnhub), news (NewsAPI), and crowd sentiment (Reddit, StockTwits) so a trader can go from "what's worth trading today?" to a sized, risk-defined plan without leaving the app. It is a research and decision-support tool, not an autonomous trading bot — every order is user-initiated, and live execution is paper-only.

What a user can do with it:

- **Run an AI market scan.** One click scores a ~240-ticker universe locally, takes the top 30, enriches them with multi-source data, and has Claude return ranked trade ideas — each a complete plan: direction (LONG/SHORT/CALL/PUT), confidence, entry zone, stop-loss, target, timeframe, chart pattern, position size, max risk, potential gain, and social sentiment. A LONG / BOTH / SHORT toggle biases the scan direction.
- **Research any stock in AI chat.** A Bloomberg-analyst-style chat (web-search-enabled) answers free-form questions. A three-way **Chat / Research / Workstation** toggle in the chat top bar sets the mode per session. Flagging a chat as "research" tags it to a ticker and pins an interactive TradingView candlestick+volume chart (MAX→NOW ranges, with a resizable / repositionable chart-vs-chat layout); chat history persists per-user and groups research chats into per-ticker folders.
- **Compare tickers in a Research Workstation.** Workstation mode loads several ticker charts in a responsive grid beside the conversation (same resizable / repositionable split as research). The chat is fed the loaded tickers, so "which of these has the best margins?" resolves to exactly the charts on screen. A collapsible "Articles" tray lets the trader paste news links that are saved (title/source auto-resolved) to the session. Loaded tickers + saved articles + grid layout persist per workstation session.
- **Track open positions.** Log a position (entry, direction, stop, target); the app shows live price and net P/L and gives an AI **HOLD / SELL / CAUTION** verdict per position. Web-push notifications fire when price crosses the stop or target.
- **Paper trade.** Connect an Alpaca paper account (API keys AES-256-GCM encrypted at rest) to place and cancel real paper orders and view live account balances, buying power, and broker positions.
- **Stay on top of news.** Aggregated market-wide and per-ticker headlines from Finnhub, NewsAPI, and Alpaca, plus an earnings/economic calendar feed. A free-form news search expands a short query (e.g. "memory") into the affected market ecosystem (Claude maps it to the public companies, tickers, suppliers, products, and sub-themes whose stocks it moves), searches NewsAPI by relevancy, and shows a "Covering:" line summarizing what the search captured.

It's an installable PWA (offline shell, push, mobile 4-tab nav) with per-user data isolated behind Supabase auth + row-level security. With no `ANTHROPIC_API_KEY` / `ALPACA_API_KEY` present it runs in a self-contained **demo mode** on mock data.

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

# Tests (Vitest)
npm test              # server suite, then client suite (each runs in its own package)
npm run test:server   # server unit + integration (cd server && vitest run)
npm run test:client   # client unit + component (cd client && vitest run)
npm run test:coverage # both suites with v8 coverage

# E2E (Playwright — repo root)
npm run test:e2e      # boots the client dev server (demo mode) + runs e2e/*.spec.ts
                      # signed-in specs are env-gated: E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
```

No lint script is configured.

## Testing

Vitest powers both packages; tests run per-package (never a bare `vitest` at the repo root — with no root config it picks up everything without the per-package setup and fails). CI runs both suites on push/PR via `.github/workflows/test.yml`.

- **Server** (`server/test/**/*.test.ts`, `environment: node`): tests live outside `src/` so the production `tsc` build never sees them. `test/setup.ts` pins a deterministic env (NODE_ENV=test so `index.ts` doesn't open a port/timer, a fixed `ENCRYPTION_KEY`, blanked external-API keys) and starts a shared **MSW** server (`test/msw.ts`) for outbound HTTP. `test/helpers.ts` builds `Candle` fixtures.
  - Layers: pure-function units (encryption, alpaca scoring/profiling/summaries, `sanitizeArticles`/`decodeEntities`, `responseText`, newsapi cache); mocked-boundary module units (db via a chainable Supabase stub; auth; the Claude AI fns via a mocked `@anthropic-ai/sdk` — parse + fallback only, not output quality; brokerage/finnhub/reddit via MSW; notifications via mocked `web-push`); and **supertest** integration tests against the exported `app` (`integration.routes.test.ts` mocks `../src/auth` + uses in-memory position fallback; `integration.chat.test.ts` mocks the `@supabase/supabase-js` boundary so real auth + real db run against a stub).
- **Client** (`client/src/**/*.test.{ts,tsx}`, jsdom + React Testing Library): `client/test/setup.ts` wires jest-dom + RTL cleanup and stubs `matchMedia`/`ResizeObserver`. Test globs are excluded from the build `tsconfig`. Covers `api.ts` wrappers (mocked `supabase` + `fetch`), the `detectRange`/`detectTicker` chat helpers, `NewsPanel` / `WorkstationPanel` (chart + `../api` mocked), and the **theme system** (`__tests__/theme.test.tsx`: `ThemeProvider`/`useTheme` — `prefers-color-scheme` resolution, `localStorage` round-trip, toggle DOM/persist, and the no-provider safe default).
- **E2E** (`e2e/**/*.spec.ts`, `@playwright/test`, config at repo root `playwright.config.ts`): `webServer` boots the **client dev server in demo mode** (no API keys) on :3000; `colorScheme: 'light'` is pinned for determinism. `theme.spec.ts` asserts **real `getComputedStyle` changes** (body bg + a glass surface) on toggle, the `data-theme` flip, and reload persistence — on the landing page (no creds). The signed-in path (in-app Header toggle) is **env-gated** via `E2E_EMAIL`/`E2E_PASSWORD` and skips when absent so the default run stays self-contained.
- **Testability seams:** `index.ts` exports `app` and guards its listener/price-timer behind `NODE_ENV !== 'test'`; a few pure helpers (`sanitizeArticles`, `decodeEntities`, `responseText`, `buildChatDataSection`, `detectRange`, `detectTicker`) are exported for direct unit tests. `useTheme()` returns a safe default (no throw) when no provider is mounted, so components that call it render bare in tests.

## Architecture

Full-stack swing trading dashboard: React frontend, Express backend, connected to Alpaca Markets, Claude AI, Supabase, Finnhub, NewsAPI, Reddit, and StockTwits.

### Backend (`server/src/`)

`index.ts` is the single Express entry point — all ~30 API routes live there. Key modules:

- **`alpaca.ts`** — Market data: 5-day OHLCV candles, news, live prices, StockTwits sentiment, intraday data, weekly candles, premarket candles, VWAP, and `fetchChartCandles(ticker, range)` for the research / workstation charts (range → granularity mapping in `CHART_RANGE_CONFIG`). Watchlist is ~240 tickers defined inline.
- **`claude.ts`** — AI analysis and chat. `runScanPipeline()` scores all tickers locally, takes top 30, enriches with multi-source data, splits into 2 batches of 15. **Models (three tiers, all with `thinking: {type: 'adaptive'}`):** `claude-opus-4-8` (`SCAN_MODEL`) for scan batches — the deepest prediction task; `claude-sonnet-4-6` (`CHAT_MODEL`) for chat + position verdicts — interactive/bounded reasoning that's cheaper and faster on Sonnet with minimal quality loss; `claude-haiku-4-5` (`FAST_MODEL`) for cheap pre-processing (macro regime, news scoring). **All JSON responses use structured outputs** (`output_config.format` with JSON schemas defined at the top of the file) — never parse markdown fences; the API guarantees schema-valid JSON in the text block (use `responseText()` to skip thinking blocks). `streamChat()` uses the server-side `web_search_20260209` tool — the API executes searches itself; the loop only handles `stop_reason: 'pause_turn'` by re-sending the assistant turn. It's non-streaming (waits for full response) then yields the complete text. The chat system prompt is two blocks: a frozen `CHAT_PERSONA` (cache-friendly, contains the Bloomberg-analyst tone rules: no markdown headers, no horizontal rules, no emojis) + a dynamic live-data block. `expandNewsQuery(input)` (Haiku, structured output) turns a short news search into an ecosystem-aware NewsAPI boolean query plus a human-readable `focus` line (the tickers/companies/themes covered); falls back to `{ query: input, focus: '' }` with no key or on error.
- **`brokerage.ts`** — Alpaca Paper Trading API: place orders, fetch live positions/orders/account.
- **`finnhub.ts`** — Company news (last 72h) + earnings calendar (7-day window) + economic calendar.
- **`reddit.ts`** — Reddit sentiment scraping for watchlist tickers.
- **`newsapi.ts`** — NewsAPI.org `/everything` search (`searchNews(query, pageSize, sortBy)`, `sortBy` ∈ `publishedAt | relevancy | popularity`, default `publishedAt`; results cached per `query|sortBy|pageSize`): fixed macro queries + per-position ticker queries at chat-context load, and the relevancy-sorted query behind `/api/news/search`.
- **`db.ts`** — Supabase CRUD for: positions, brokerage accounts, push subscriptions, **chat sessions** (incl. workstation `tickers` / `layout` / `articles`), **chat messages**.
- **`auth.ts`** — `requireAuth` middleware: validates Supabase JWT on all `/api/*` routes.
- **`encryption.ts`** — AES-256-GCM for storing user Alpaca API keys.
- **`notifications.ts`** — Web Push (VAPID): send alerts, manage subscriptions, price monitor loop.
- **`mockData.ts`** — Demo fallback. If `ANTHROPIC_API_KEY` or `ALPACA_API_KEY` are absent, the app serves mock data and shows a yellow "Demo" banner.

### Frontend (`client/src/`)

- **`App.tsx`** — Root component. Manages all scan/position/news state. Desktop layout: 2/3 chat + 1/3 sidebar (Scan/Positions/News tabs). Mobile layout: 4-tab bottom nav (Chat / Scan / Positions / News) — no drawer overlays.
- **`api.ts`** — All `/api/*` fetch calls centralized here. Components never call `fetch` directly. Includes chat session CRUD functions.
- **`AuthContext.tsx`** — `useAuth()` hook wrapping Supabase auth.
- **`ThemeContext.tsx`** — `useTheme()` hook → `{ theme, toggleTheme, setTheme }`. Light/dark, persisted to `localStorage` only (no DB). Wrapped outside `AuthProvider` in `main.tsx` so landing + app both get it. See the **Design system** patterns below for the token model and the `index.html` no-flash script.
- **`components/ThemeToggle.tsx`** — Sun/Moon toggle button (used in `Header` desktop + mobile rows, and on the landing nav + auth views).
- **`types.ts`** — Shared TypeScript interfaces (`TradeRecommendation`, `Position`, etc.).
- **`components/ChatPanel.tsx`** — AI chat with persistent history sidebar. On desktop the sidebar is always visible (left column); on mobile it slides in via a hamburger toggle. Sessions are auto-created from the first message (title = truncated first message). Messages are saved to Supabase after each AI response. Hosts the **Chat / Research / Workstation** mode toggle and the shared resizable chart-vs-chat split (one `StockChart` for research, a `WorkstationPanel` grid for workstation).
- **`components/WorkstationPanel.tsx`** — Research-workstation grid. Renders an `auto-fit` grid of `StockChart` tiles (each with its own independent range + a hover remove ×) plus an "add ticker" input, and a collapsible "Articles" footer tray for pasting/saving news links (title/source resolved via `fetchLinkPreview`). Reused inside `ChatPanel`'s chart-vs-chat split for workstation sessions.
- **`components/Header.tsx`** — Top nav. Desktop: single row. Mobile: two rows — row 1 has logo + LONG/BOTH/SHORT + market status + sign out; row 2 has Run Scan + buying power input + Paper button.
- **`components/ModeSwitcher.tsx`** — LONG / BOTH / SHORT pill toggle for scan direction.
- **`components/landing/ParticleWave.tsx`** — Three.js/WebGL animated particle background for the landing hero. Takes a `theme` prop (light = `#f5f5f7` fog + normal blending; dark = `#0c0c0d` fog + additive glow) and re-inits on toggle. Falls back to a CSS `.aurora-fallback` gradient when WebGL can't initialize, and renders a single static frame under `prefers-reduced-motion`.
- Other components: `RecommendationsTable`, `RecommendationCard`, `PositionsPanel`, `PaperTradingPanel`, `AccountSettingsModal`, `ConnectBrokerageForm`, `AddPositionModal`, `ExecuteTradeModal`, `StockChart`, `NewsPanel`.

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

**News search flow:**
1. User types a query in the News panel → `GET /api/news/search?q=`
2. Backend calls `expandNewsQuery(q)` (Haiku) → `{ query, focus }`, then `searchNews(query, 30, 'relevancy')`
3. Response returns `{ news, focus, mock }`; `NewsPanel` renders the headlines plus a "Covering: {focus}" banner
4. On no NewsAPI key / no matches: falls back to filtering the existing market feed by substring; on error returns `{ news: [], focus: '', mock: true }`

**Chat history:**
- `GET /api/chat/sessions` — list user's sessions (50 most recent)
- `POST /api/chat/sessions` — create session (title = first message, max 100 chars)
- `PATCH /api/chat/sessions/:id` — rename session and/or set research fields (`is_research` / `ticker`) or workstation fields (`is_workstation` / `tickers` / `layout` / `articles`). `tickers`, `layout`, and `articles` are server-validated (tickers ≤12 & uppercased; layout ∈ the 4 split tokens; articles ≤30, deduped, valid http(s) urls, title/source length-capped). Research and workstation are mutually exclusive — turning one on clears the other server-side. Un-marking either clears its state (incl. `articles`) and bumps `updated_at` to now (the chat re-dates to today by design).
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

**Research Workstation (chat):**
- A chat toggles into "workstation" via the three-way mode toggle in the chat top bar (mutually exclusive with research). Workstation sessions carry a `tickers[]` array + a saved split `layout`, stored as flags on the same `chat_sessions` row.
- `WorkstationPanel` renders the loaded tickers as a grid of `StockChart` tiles next to the conversation, reusing research mode's resizable chart-vs-chat split and its 4 arrangements (chart-grid on top/bottom/left/right). Layout changes persist per workstation session; ticker add/remove persist immediately (with a local-only fallback if the migration hasn't been run, mirroring research mode).
- Chat awareness: `ChatPanel` fetches `GET /api/chat/context` for the loaded tickers (same endpoint as position context) and sends them as `context.workstationTickers` on `POST /api/chat/stream`. `buildChatDataSection()` in `claude.ts` adds a "RESEARCH WORKSTATION — N tickers loaded side by side" line and buckets their candle summaries under a WORKSTATION label, so the model resolves "these"/"them" to the on-screen set.
- Saved articles: the workstation "Articles" tray persists pasted news links as `articles[]` (`{ url, title, source?, addedAt? }`) on the same `chat_sessions` row. Pasting a link calls `GET /api/link-preview?url=` which fetches the page (5s timeout, 1MB cap, ≤4 redirects) and extracts `og:title` / `<title>` (HTML entities decoded), falling back to the hostname when blocked or non-HTML. Add/remove persist immediately, with a local-only fallback if the migration hasn't been run (mirroring tickers/layout).
- The history sidebar groups workstation sessions into a "Workstations" section (above "Research" / "Chats").
- Requires the `is_workstation` / `tickers` / `layout` / `articles` columns on `chat_sessions` (see the Supabase Schema section).

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
  is_workstation boolean not null default false, -- research-workstation flag (mutually exclusive with is_research)
  tickers text[] not null default '{}',        -- tickers loaded in a workstation, e.g. {AMD,NVDA,INTC}
  layout text,                                 -- saved chart-vs-chat split: col | col-reverse | row | row-reverse
  articles jsonb not null default '[]'::jsonb, -- saved workstation news links: [{ url, title, source?, addedAt? }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.chat_sessions (user_id, updated_at desc);
create index chat_sessions_research_idx on public.chat_sessions (user_id, ticker) where ticker is not null;
create index chat_sessions_workstation_idx on public.chat_sessions (user_id, updated_at desc) where is_workstation;
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
- **Border consistency:** Sub-panel headers (History sidebar, chat top bar, right sidebar tabs) all use `h-12` and `border-border` so their bottom borders align.
- **Theming (light/dark):** Two themes share one amber accent — **only bg/surface/text/border tones invert.** Colors are **semantic CSS-variable tokens** defined in `index.css` (light under `:root`, dark under `[data-theme="dark"]` on `<html>`) and consumed via Tailwind utilities: backgrounds `bg-bg` / `bg-surface` / `bg-surface-2` / `bg-surface-3`, borders `border-border` / `border-border-strong`, text `text-fg` / `text-muted` / `text-faint` / `text-dim`. Channels are stored space-separated so opacity modifiers work (`bg-surface/70`). **Never reintroduce raw color literals** (`bg-[#…]`, `text-white`, `text-gray-*`, `border-[#222225]`) where a token belongs. Status hues (green/red/amber/violet/purple) stay vivid in both themes; tinted *backgrounds* use a light base + `dark:` variant (e.g. `bg-emerald-50 dark:bg-emerald-900/50`) since `darkMode` is selector-based (`[data-theme="dark"]`). Amber **fills/active states are identical** in both themes; amber *text* darkens one notch in light (`text-amber-600 dark:text-amber-400`) for legibility. Theme-dependent visuals that can't use tokens (`ParticleWave`, `StockChart`'s lightweight-charts colors) read `useTheme()` and rebuild on change. Persistence is **`localStorage` only** (key `stakdx-theme`) — the inline `<head>` script in `index.html` applies it pre-paint (no flash). Do **not** add a DB/`api.ts` path for theme.
- **Elevation / shadows:** Two theme-aware elevation tiers, defined as CSS-variable tokens in `index.css` (`--shadow-card` / `--shadow-pop`, light under `:root` + dark under `[data-theme="dark"]`) and exposed as Tailwind utilities `shadow-card` / `shadow-pop` (registered in `tailwind.config.js` as `var(--shadow-*)`, so they invert with the theme automatically). **`shadow-card`** = resting panels (feature tiles, glass cards on a page; `.card-elevated` also consumes `var(--shadow-card)`). **`shadow-pop`** = floating overlays (modals, dropdowns/popovers, the landing hero cards). **Don't hardcode raw shadows** (`shadow-2xl`, `shadow-xl shadow-black/50`, `shadow-[0_8px_28px_…]`) on cards or floating panels — use the two utilities so elevation stays consistent and theme-correct. Amber *glow* effects (`btn-primary`, focus rings, icon halos) are intentional accents, not elevation, and stay as-is. Stacking note: glass surfaces (`.glass`) each force a `backdrop-filter` layer, so overlapping animated glass cards need an explicit `z-index` on every sibling (never `z-auto`) inside an `isolate` container, or their composited order flickers during entrance animations (see `HeroPreview` in `AuthPage.tsx`).
- **Chat AI tone:** The `streamChat` system prompt enforces: no `##`/`###` headers, no `---` dividers, no emojis. Write like a Bloomberg analyst — dense, factual, structured with plain dashes.
- **Design system:** Fonts — `Clash Display` (`.font-display`, headings/logo) + `Satoshi` (body) via Fontshare, `IBM Plex Mono` (`.mono`, all numbers/tickers/prices) via Google Fonts. Icons — `@phosphor-icons/react` (typically `weight="duotone"` for accents, `"bold"` for controls); do NOT add inline heroicon-style SVGs. Textures — `.noise-overlay` (film grain), `.dot-grid`, and `.grid-overlay` utilities in `index.css` (all theme-aware). Glass surfaces use `.glass` (light + dark recipes). Accent color stays amber in both themes.
- **AI calls:** Use the `SCAN_MODEL` / `CHAT_MODEL` / `FAST_MODEL` constants in `claude.ts` — don't hardcode model IDs elsewhere. New JSON-returning calls must use structured outputs (`output_config.format`) with a schema, not prompt-and-parse.

## PWA / Icons

- Icons live in `client/public/icons/` — sizes 72, 96, 128, 144, 152, 180, 192, 512px
- Regenerate with: `node client/public/icons/generate-icons.js` (requires `canvas` npm package)
- `apple-touch-icon` links in `index.html` point to `icon-180.png` and `icon-152.png`
- In-app logo uses `stakd-logo.png` (the original bar-chart logo) — do NOT replace with generated icons
- Service worker at `client/public/sw.js` — cache name `stakdx-v1`
