import { beforeAll, afterEach, afterAll } from 'vitest';
import { mswServer } from './msw';

// ─── Deterministic environment ────────────────────────────────────────────────
// Runs before any module-under-test is imported. We set NODE_ENV=test (so
// index.ts does not open a port / start the price-alert timer) and pin the
// secrets/keys tests rely on. External-API keys are blanked so modules take their
// "no key" paths by default; individual tests opt into a key with vi.stubEnv.
//
// NOTE: index.ts calls `import 'dotenv/config'`, but dotenv never overrides a key
// that is already present in process.env — so setting these here keeps the real
// server/.env from leaking into tests.
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = '0'.repeat(64); // 32-byte key as 64 hex chars

for (const k of [
  'ANTHROPIC_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_SECRET_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FINNHUB_API_KEY',
  'NEWSAPI_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
]) {
  process.env[k] = '';
}

process.env.ALPACA_ENDPOINT = 'https://data.alpaca.markets';
process.env.ALPACA_PAPER_ENDPOINT = 'https://paper-api.alpaca.markets';

// ─── MSW lifecycle ─────────────────────────────────────────────────────────────
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
