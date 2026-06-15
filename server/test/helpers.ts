import type { Candle } from '../src/types';

// A single OHLCV candle with sensible defaults; override any field per test.
export function candle(p: Partial<Candle> = {}): Candle {
  return { t: '2026-06-10T00:00:00Z', o: 100, h: 101, l: 99, c: 100, v: 1_000_000, ...p };
}

// Build a daily series of `n` candles compounding a constant per-day drift (%).
// Useful for trend/SMA/relative-strength assertions.
export function series(
  n: number,
  opts: { start?: number; driftPct?: number; vol?: number; startDate?: string } = {}
): Candle[] {
  const { start = 100, driftPct = 0, vol = 1_000_000, startDate = '2026-01-01' } = opts;
  const out: Candle[] = [];
  let price = start;
  const base = new Date(`${startDate}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = +(price * (1 + driftPct / 100)).toFixed(4);
    const h = +(Math.max(o, c) * 1.01).toFixed(4);
    const l = +(Math.min(o, c) * 0.99).toFixed(4);
    out.push({ t: new Date(base + i * 86_400_000).toISOString(), o, h, l, c, v: vol });
    price = c;
  }
  return out;
}
