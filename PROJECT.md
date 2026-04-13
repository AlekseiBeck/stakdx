# SwingAI — Project Documentation

## What It Is

SwingAI is a full-stack AI-powered swing trading dashboard. It fetches live market data for 240+ stocks, runs multi-source analysis through Claude, and surfaces ranked trade recommendations with entry zones, stop losses, targets, and confidence scores. Users can track positions, monitor them with live AI verdicts, and execute paper trades directly against a simulated Alpaca brokerage account.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express 4, TypeScript, ts-node-dev |
| AI | Anthropic Claude Sonnet 4.6 (analysis), Claude Haiku (fast tasks) |
| Market Data | Alpaca Markets REST API |
| News | Alpaca News, Finnhub (multi-source, earnings calendar) |
| Social Sentiment | StockTwits API (real-time, no key required) |
| Auth & Database | Supabase (JWT auth + PostgreSQL) |
| Paper Trading | Alpaca Paper Trading API |
| Deployment | Railway (backend), Vercel or Railway (frontend) |

---

## Repository Structure

```
swing-trader/
├── server/                        # Express backend
│   └── src/
│       ├── index.ts               # All Express routes + app entry point
│       ├── alpaca.ts              # Market data: candles, news, prices, StockTwits, intraday
│       ├── claude.ts              # Claude AI: scan analysis, position monitoring
│       ├── brokerage.ts           # Alpaca paper trading: orders, positions, account
│       ├── encryption.ts          # AES-256-GCM encrypt/decrypt for API key storage
│       ├── finnhub.ts             # Finnhub: company news, earnings calendar
│       ├── auth.ts                # Supabase JWT middleware (requireAuth)
│       ├── db.ts                  # Supabase CRUD: positions, brokerage accounts
│       ├── mockData.ts            # Demo fallback data (no API keys required)
│       └── types.ts               # Shared TypeScript interfaces
│
├── client/                        # React frontend
│   └── src/
│       ├── App.tsx                # Root dashboard, state, streaming scan logic
│       ├── api.ts                 # All fetch calls to /api/* (never call fetch in components)
│       ├── types.ts               # Frontend TypeScript interfaces
│       ├── AuthContext.tsx        # Supabase auth state + useAuth() hook
│       ├── supabase.ts            # Supabase client initialisation
│       ├── index.css              # Global styles, Tailwind, CSS variables, animations
│       └── components/
│           ├── Header.tsx                # Top bar: mode switcher, scan button, brokerage status
│           ├── ModeSwitcher.tsx          # LONG / BOTH / SHORT 3-way pill toggle
│           ├── ScanButton.tsx            # "Run Daily Scan" with loading state
│           ├── RecommendationsTable.tsx  # Card grid with skeleton loaders + streaming status
│           ├── RecommendationCard.tsx    # Individual trade card: collapsed + expanded views
│           ├── PositionsPanel.tsx        # Manually tracked positions + HOLD/SELL/CAUTION verdicts
│           ├── AddPositionModal.tsx      # Add position manually or from a recommendation
│           ├── NewsPanel.tsx             # News feed sidebar (replaces scrolling ticker)
│           ├── ConnectBrokerageModal.tsx # Link Alpaca paper account (encrypts + stores keys)
│           ├── PaperTradingPanel.tsx     # Live paper account: equity, positions, orders
│           └── ExecuteTradeModal.tsx     # Confirm + place a paper trade from any card
│
├── .claude/
│   └── agents/                    # Custom Claude Code subagent definitions
│       ├── orchestrator.md        # Routes tasks to specialist agents
│       ├── frontend-developer.md  # React/UI specialist
│       ├── backend-developer.md   # Express/API specialist
│       ├── swing-trader.md        # Trade analysis specialist
│       ├── financial-adviser.md   # Macro/long-term strategy specialist
│       ├── global-news-analyst.md # News filtering + impact scoring specialist
│       └── twitter-analyst.md     # Social sentiment specialist
└── PROJECT.md                     # This file
```

---

## How the Scan Works

### Step 1 — Fetch market data in parallel

When the user clicks "Run Daily Scan", the backend fires all data fetches simultaneously:

```
Promise.all([
  fetchCandles()          → 5-day daily OHLCV for 240+ tickers (Alpaca)
  fetchNews()             → ticker-specific news (Alpaca)
  fetchMarketNews()       → broad market/macro headlines (Alpaca)
  fetchLatestPrices()     → current bid/ask prices (Alpaca)
  fetchFinnhubNews()      → multi-source news last 72h (Finnhub)
  fetchUpcomingEarnings() → earnings within 7 days (Finnhub)
])
```

### Step 2 — Pre-filter by technical score

All 240+ tickers are scored locally (no AI cost) using `scoreTickerForMode`:

- **LONG mode**: boosts green candles, closes in top 30% of range, above-average volume on up days
- **SHORT mode**: boosts red candles, closes in bottom 30% of range, above-average volume on down days
- **BOTH mode**: combined momentum, volume spike, body strength, multi-day trend

Only the **top 30 tickers** pass through to Claude.

### Step 3 — Fetch enrichment data for top 30

```
Promise.all([
  fetchStockTwitsSentiment() → real-time bullish/bearish vote counts (up to 15 tickers)
  fetchIntradayCandles()     → 1-hour bars for last 2 trading days (up to 20 tickers)
])
```

### Step 4 — Parallel Claude analysis

The top 30 tickers are split into two batches of 15. Both batches are sent to Claude simultaneously via `Promise.all`, cutting scan time roughly in half (~8-10 seconds vs ~20 seconds).

Each Claude call receives:
- Compressed 5-day daily candle summaries
- 1-hour intraday context (last 16 bars)
- Alpaca news (ticker + broad market)
- Finnhub news (multi-source, last 72h)
- Earnings risk flags (⚠️ reports within 7 days)
- StockTwits real-time sentiment (bullish/bearish vote counts)
- Buying power (if provided) for position sizing
- Scan mode (LONG/SHORT/BOTH)
- Focus directions (LONG/SHORT/CALL/PUT filter)

### Step 5 — Claude applies the analysis framework

Claude evaluates each ticker using a detailed system prompt covering:

**Technical patterns recognised:**
- Bullish: Engulfing, Hammer/Pin Bar, Morning Star, Inside Bar Breakout, EMA Bounce, Cup & Handle
- Bearish: Engulfing, Shooting Star, Evening Star, Distribution Day, Resistance Failure

**Mandatory quality filters (any failure = excluded):**
- Risk/Reward ≥ 2:1 — no exceptions
- Volume confirmation on signal candle
- Trend alignment OR clear reversal pattern
- No overextension (>12% from nearest S/R)
- Max 3 stocks per sector per scan
- Minimum confidence of 58

**Confidence scoring (58–100):**
- 88–100: Pattern + high volume + news catalyst + trend + clean S/R level
- 75–87: Pattern + volume + news OR trend
- 65–74: Clear pattern + average volume
- 58–64: Pattern present, 1–2 confirming factors weak
- Below 58: excluded

**Confidence adjustments:**
- News supports direction: +8 to +12
- News contradicts direction: −15
- Social sentiment aligns: +5
- Social sentiment contradicts: −5
- SPY/QQQ uptrend: +8 to longs, −8 to shorts
- SPY/QQQ downtrend: −8 to longs, +8 to shorts
- VIX >25: minimum threshold raised to 70
- Earnings within 3 days: flag as high risk

**Output per recommendation:**
```json
{
  "ticker": "NVDA",
  "direction": "LONG | SHORT | CALL | PUT",
  "confidence": 82,
  "entryZone": "$875.00 - $880.00",
  "stopLoss": "$858.00",
  "target": "$910.00",
  "timeframe": "2-3 days",
  "rationale": "...",
  "pattern": "Bullish Engulfing at 50-day Support",
  "positionSize": "12 shares",
  "maxRisk": "$204.00",
  "potentialGain": "$420.00",
  "socialSentiment": { "sentiment": "bullish", "signal": "Heavy call flow chatter" }
}
```

### Step 6 — Streaming response to frontend

Results stream back via SSE (`/api/scan/stream`):
- **Batch 1 arrives (~8s):** First cards appear with `fadeInUp` animation
- **Batch 2 arrives (~10s):** Remaining cards append
- Skeleton loaders shown during both batches
- Progress indicator: "Analyzing batch 1… / Analyzing batch 2…"

---

## API Routes

### Market / Scan

| Method | Route | Description |
|---|---|---|
| GET | `/api/scan` | Full scan, returns all recommendations at once |
| GET | `/api/scan/stream` | SSE streaming scan, streams batch 1 then batch 2 |
| GET | `/api/news` | Fetch latest market news |

Query params for scan: `?buyingPower=10000&directions=LONG,CALL&mode=long`

### Position Tracking (SwingAI internal)

| Method | Route | Description |
|---|---|---|
| GET | `/api/positions` | List user's tracked positions |
| POST | `/api/positions` | Add a position to track |
| DELETE | `/api/positions/:id` | Remove a tracked position |
| GET | `/api/positions/:ticker/update` | Get HOLD/SELL/CAUTION verdict from Claude |

### Paper Brokerage (Alpaca per-user)

| Method | Route | Description |
|---|---|---|
| POST | `/api/brokerage/connect` | Encrypt + store user's Alpaca keys in Supabase |
| GET | `/api/brokerage/status` | Check if user has a brokerage linked |
| DELETE | `/api/brokerage/disconnect` | Remove user's brokerage credentials |
| GET | `/api/brokerage/account` | Fetch paper account balance + buying power |
| GET | `/api/brokerage/positions` | Fetch live Alpaca paper positions + recent orders |
| POST | `/api/brokerage/order` | Place a paper trade (market or limit) |
| DELETE | `/api/brokerage/order/:orderId` | Cancel a pending paper order |

---

## Per-User Paper Trading

### Security model

- Each user's Alpaca API key and secret are **encrypted with AES-256-GCM** before being stored in Supabase
- The encryption key (`ENCRYPTION_KEY`) lives only on the server — never sent to the client
- Supabase **Row Level Security (RLS)** enforces that each user can only read/write their own row in `brokerage_accounts`
- Decryption only happens server-side, inside the request handler, immediately before the Alpaca API call
- API keys are never logged

### Database table

```sql
brokerage_accounts (
  id            uuid primary key,
  user_id       uuid references auth.users(id),
  broker        text default 'alpaca',
  account_type  text default 'paper',       -- 'paper' | 'live'
  encrypted_api_key    text,
  encrypted_secret_key text,
  created_at    timestamptz,
  unique(user_id, broker)
)
```

### Paper trading flow

```
User clicks "Connect Broker" in header
  → ConnectBrokerageModal opens
  → User enters Alpaca API key + secret
  → Backend verifies credentials against https://paper-api.alpaca.markets/v2/account
  → Keys encrypted with AES-256-GCM → stored in Supabase
  → Header shows green pulsing "Paper" badge

User clicks "⚡ Execute Paper Trade" on a recommendation card
  → ExecuteTradeModal shows order preview (qty, est. cost, stop, max risk)
  → User confirms
  → POST /api/brokerage/order → backend decrypts keys → Alpaca paper order placed
  → Order fills at market price in the simulated account

User clicks "Paper" badge in header
  → PaperTradingPanel opens
  → Live equity, cash, buying power
  → All open positions with unrealized P&L
  → Recent orders with fill status
```

---

## Environment Variables

### Backend (`server/.env`)

```
ANTHROPIC_API_KEY=          # Claude API key (required for AI analysis)
ALPACA_API_KEY=             # Alpaca data API key (required for market data)
ALPACA_SECRET_KEY=          # Alpaca data API secret
ALPACA_ENDPOINT=            # https://data.alpaca.markets
ALPACA_PAPER_ENDPOINT=      # https://paper-api.alpaca.markets
SUPABASE_URL=               # Supabase project URL (required for auth + DB)
SUPABASE_SERVICE_ROLE_KEY=  # Supabase service role key (server-side DB access)
FINNHUB_API_KEY=            # Finnhub API key (free tier — news + earnings calendar)
ENCRYPTION_KEY=             # 64-char hex string for AES-256 key encryption
PORT=3001
CLIENT_URL=                 # Frontend URL for CORS
```

### Frontend (`client/.env.local`)

```
VITE_SUPABASE_URL=          # Supabase project URL
VITE_SUPABASE_ANON_KEY=     # Supabase anon public key
```

### Demo mode

If `ANTHROPIC_API_KEY` or `ALPACA_API_KEY` are missing, the app automatically falls back to mock data. A yellow "Demo" banner appears in the UI. All features work with realistic placeholder data — no real API calls are made.

---

## Watchlist

240+ tickers across all 11 GICS sectors:

- **Mega-cap tech**: AAPL, MSFT, NVDA, META, AMZN, GOOGL, TSLA, AVGO, ORCL
- **Financials**: JPM, V, MA, GS, MS, BAC, SCHW, AXP, COF
- **Healthcare**: UNH, LLY, JNJ, MRK, ABBV, ISRG, DXCM, VRTX, REGN
- **Semis**: AMD, QCOM, TXN, INTC, MU, AMAT, LRCX, KLAC, ARM, MRVL
- **SaaS / Cloud**: NOW, CRM, ADBE, PANW, CRWD, ZS, DDOG, SNOW, NET, HUBS
- **Consumer**: HD, COST, WMT, MCD, SBUX, AMZN, BKNG, CMG, ABNB
- **Energy**: XOM, CVX, OXY, SLB, COP, EOG
- **Industrials**: CAT, RTX, GE, LMT, HON, UNP, AXON
- **ETFs (market regime)**: SPY, QQQ, IWM, XLK, XLF, XLE, TQQQ, SQQQ, SOXL, SOXS
- **High-vol / crypto-adjacent**: PLTR, COIN, MSTR, HOOD, RIOT, MARA
- **Emerging / speculative**: ASTS, IONQ, RGTI, RKLB, ACHR, JOBY
- **International ADRs**: TSM, ASML, BABA, MELI, NU, SE

All 240+ tickers are fetched and scored locally. Only the **top 30** by technical signal strength are sent to Claude for analysis.

---

## Multi-Agent System (Claude Code)

The project uses a custom Claude Code multi-agent setup defined in `.claude/agents/`. Each agent is a specialist invoked via the Agent tool:

| Agent | Role |
|---|---|
| `orchestrator` | Primary interface. Routes tasks, coordinates parallel agent execution, synthesises results |
| `frontend-developer` | All React/TypeScript/Tailwind work in `client/`. Uses the `frontend-design` skill |
| `backend-developer` | All Express/TypeScript work in `server/`. Owns API routes, Alpaca, Claude prompts |
| `swing-trader` | Technical analysis, trade scoring, HOLD/SELL/CAUTION verdicts |
| `financial-adviser` | Macro conditions, sector rotation, long-term hold decisions |
| `global-news-analyst` | News filtering, impact scoring, signal vs noise classification |
| `twitter-analyst` | Social sentiment, short squeeze detection, Reddit/StockTwits analysis |

The 6 specialist agents (all except `orchestrator`) use the **caveman skill** — terse, token-efficient communication that preserves full technical accuracy.

---

## Running Locally

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Set up environment variables
cp server/.env.example server/.env
# Fill in your API keys in server/.env

cp client/.env.example client/.env.local
# Fill in your Supabase URL and anon key

# Start backend (port 3001, auto-reload)
cd server && npm run dev

# Start frontend (port 3000, HMR)
cd client && npm run dev
```

Open `http://localhost:3000`.

Without API keys the app runs in demo mode with mock data — fully functional for UI development.

---

## Deployment

The app is deployed on **Railway**:

- Backend: Railway service running `npm run dev` (or a build command)
- Frontend: Vite build served statically

On every `git push origin master`, Railway auto-deploys both services.

**Required Railway environment variables** (same as `.env` above):
- `ANTHROPIC_API_KEY`
- `ALPACA_API_KEY` + `ALPACA_SECRET_KEY` + `ALPACA_ENDPOINT` + `ALPACA_PAPER_ENDPOINT`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- `FINNHUB_API_KEY`
- `ENCRYPTION_KEY`
- `CLIENT_URL` (your frontend's public URL)
