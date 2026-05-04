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

Full-stack swing trading dashboard with a React frontend and Express backend, connected to Alpaca Markets, Claude AI, Supabase, and Finnhub.

### Backend (`server/src/`)

`index.ts` is the single Express entry point — all 14 API routes live there. Key modules:

- **`alpaca.ts`** — Market data: 5-day OHLCV candles, news, live prices, StockTwits sentiment, intraday data. Watchlist is ~240 tickers defined inline.
- **`claude.ts`** — AI analysis: `runScanPipeline()` is the core function. It scores all tickers locally, takes the top 30, fetches multi-source enrichment, then splits into 2 batches of 15 and sends to Claude Haiku + Sonnet in parallel.
- **`brokerage.ts`** — Alpaca Paper Trading API: place orders, fetch live positions/orders/account.
- **`finnhub.ts`** — Company news (last 72h) + earnings calendar (7-day window).
- **`db.ts`** — Supabase CRUD for positions, brokerage accounts, push subscriptions.
- **`auth.ts`** — `requireAuth` middleware: validates Supabase JWT on all `/api/*` routes.
- **`encryption.ts`** — AES-256-GCM for storing user Alpaca API keys.
- **`mockData.ts`** — Demo fallback. If `ANTHROPIC_API_KEY` or `ALPACA_API_KEY` are absent, the app serves mock data and shows a yellow "Demo" banner.

### Frontend (`client/src/`)

- **`App.tsx`** — Root: scan state management, mobile tab layout (scan/positions/news).
- **`api.ts`** — All `/api/*` fetch calls are centralized here. Components never call `fetch` directly.
- **`AuthContext.tsx`** — `useAuth()` hook wrapping Supabase auth.
- **`types.ts`** — Shared TypeScript interfaces (`Recommendation`, `Position`, etc.).
- Components: `RecommendationsTable`, `RecommendationCard`, `PositionsPanel`, `PaperTradingPanel`, `ConnectBrokerageModal`, `ExecuteTradeModal`, `NewsPanel`.

### Key Data Flow

1. User clicks "Run Daily Scan" → POST `/api/scan/stream` (SSE)
2. Backend fetches candles for all ~240 tickers → scores locally → selects top 30
3. Enriches top 30 with multi-source news, StockTwits sentiment, intraday candles, earnings flags
4. Two parallel Claude calls (15 tickers each) → streams results back via SSE as batches complete
5. Frontend renders cards with `fadeInUp` animation as each batch arrives (~8s, then ~10s)

### Paper Trading Flow

User enters Alpaca key/secret → backend verifies, AES-256-GCM encrypts, stores in Supabase → on trade: backend decrypts, calls `paper-api.alpaca.markets`, returns order confirmation.

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
ENCRYPTION_KEY=          # 64-char hex string
CLIENT_URL=              # e.g. http://localhost:3000
PORT=3001
```

**`client/.env.local`:**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Patterns to Follow

- **Centralized API calls:** All fetch logic belongs in `client/src/api.ts`.
- **SSE streaming:** The scan endpoint uses Server-Sent Events for real-time progress; keep this pattern for any long-running AI calls.
- **Parallel enrichment:** Use `Promise.all()` for independent data fetches in `runScanPipeline()`.
- **Auth enforcement:** All new protected routes must use the `requireAuth` middleware from `auth.ts`.
- **Demo mode:** If adding new external API calls, check for missing keys and fall back to mock data so the demo mode stays functional.
- **TypeScript strict:** Both `server/tsconfig.json` and `client/tsconfig.json` use strict mode — no `any` unless unavoidable.
