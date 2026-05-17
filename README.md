# Stakd — AI-Powered Swing Trading Assistant

A full-stack swing trading dashboard powered by Claude AI, Alpaca Markets, and Supabase — with real-time push alerts, an AI chat interface, and paper trading integration.

---

## Features

- **AI Market Scan** — Screens 240+ tickers daily, surfaces the highest-conviction LONG / SHORT / CALL / PUT setups with entry zones, stops, targets, and confidence scores
- **AI Trading Chat** — Streaming chat that knows your open positions, live prices, candle data, and latest news; powered by Claude Sonnet 4.6
- **Stop / Target Alerts** — Push notifications fire the moment a position hits its stop loss or profit target (iOS PWA + Android Chrome)
- **Position Tracker** — Log trades, get live AI HOLD / SELL / CAUTION verdicts, track paper P&L
- **Paper Trading** — Execute trades directly against Alpaca's paper brokerage with one tap
- **Live News** — Market news from Alpaca (24h), Finnhub (72h), and NewsAPI.org (7-day, broader sources)
- **Demo Mode** — Fully functional with mock data when API keys are not configured

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Claude Sonnet 4.6 (Anthropic) |
| Market Data | Alpaca Markets API |
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
ENCRYPTION_KEY=         # 64-char hex string
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

### 3. Start development servers

```bash
# Terminal 1 — backend on :3001
npm run dev:server

# Terminal 2 — frontend on :3000
npm run dev:client
```

---

## Push Notifications

- Requires `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `server/.env`
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
