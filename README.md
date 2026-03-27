# SwingAI — AI-Powered Swing Trading Assistant

A production-quality swing trading dashboard powered by Claude AI and Alpaca Markets data.

## Features

- **Daily Market Scan** — Fetches 5 days of OHLCV candles for 10 tickers and asks Claude to rank the best swing trade setups
- **AI Trade Recommendations** — Ranked table with direction, confidence score, entry zone, stop loss, target, and AI rationale
- **Position Tracker** — Log positions and get live AI HOLD/SELL/CAUTION verdicts with reasoning
- **Live News Ticker** — Scrolling market news from Alpaca's news feed
- **Market Status** — Real-time open/pre-market/after-hours/closed indicator
- **Demo Mode** — Fully functional with mock data when API keys are not configured

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + TypeScript, Express |
| AI | Claude claude-sonnet-4-6 (Anthropic SDK) |
| Market Data | Alpaca Markets API |
| Frontend | React + TypeScript, Vite |
| Styling | Tailwind CSS |

---

## Prerequisites

- Node.js 18+
- npm 9+
- Alpaca Markets account (free at [alpaca.markets](https://alpaca.markets))
- Anthropic API key (at [console.anthropic.com](https://console.anthropic.com))

---

## Setup

### 1. Clone and install dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure environment variables

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
ALPACA_API_KEY=PK...
ALPACA_SECRET_KEY=...
ALPACA_ENDPOINT=https://data.alpaca.markets
```

> **Note:** The app works without API keys — it will display realistic mock data so you can explore the UI immediately.

### 3. Start the servers

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scan` | Fetch candles + run Claude analysis, returns ranked recommendations |
| GET | `/api/news` | Fetch latest market news for the watchlist |
| GET | `/api/positions` | List all tracked positions |
| POST | `/api/positions` | Add a position `{ ticker, entryPrice, direction }` |
| DELETE | `/api/positions/:id` | Remove a position |
| GET | `/api/positions/:ticker/update` | Get fresh Claude HOLD/SELL/CAUTION verdict |

---

## Watchlist

AAPL · MSFT · NVDA · TSLA · AMD · SPY · QQQ · META · AMZN · GOOGL

To change the watchlist, edit `server/src/alpaca.ts` → `WATCHLIST` array.

---

## Alpaca API Notes

- Uses the **IEX feed** (free tier) for market data
- News endpoint requires a funded or paper trading account
- If you only have a paper account, set `ALPACA_ENDPOINT=https://data.alpaca.markets`

---

## Production Build

```bash
# Build server
cd server && npm run build

# Build client
cd ../client && npm run build
# Serve client/dist with any static file server
```
