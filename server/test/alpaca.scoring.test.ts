import { describe, it, expect } from 'vitest';
import {
  averageDollarVolume,
  scoreTicker,
  scoreTickerForMode,
  computeTechnicalProfile,
  scoreTechnical,
  summarizeCandles,
  summarizeIntradayCandles,
  summarizeWeeklyCandles,
  summarizePremarket,
  computeVWAPMap,
  getUniverse,
  CHART_RANGES,
  type TechnicalProfile,
} from '../src/alpaca';
import { candle, series } from './helpers';

describe('averageDollarVolume', () => {
  it('is 0 for no candles', () => {
    expect(averageDollarVolume([])).toBe(0);
  });

  it('is average volume × last close', () => {
    const candles = [candle({ v: 1_000_000, c: 10 }), candle({ v: 2_000_000, c: 20 })];
    // avgVol = 1.5M, last close = 20 → 30M
    expect(averageDollarVolume(candles)).toBe(30_000_000);
  });
});

describe('scoreTicker', () => {
  it('is 0 with fewer than 2 candles', () => {
    expect(scoreTicker([])).toBe(0);
    expect(scoreTicker([candle()])).toBe(0);
  });

  it('matches the weighted formula for a known volume-spike candle', () => {
    const candles = [
      candle({ o: 100, h: 101, l: 99, c: 100, v: 1_000_000 }),
      candle({ o: 100, h: 102, l: 100, c: 101, v: 1_000_000 }),
      candle({ o: 101, h: 106, l: 101, c: 105, v: 3_000_000 }),
    ];
    // volRatio=3 → 90, momentum≈3.96%→15.84, bodyStrength=0.8→16, trend=5%→10
    expect(scoreTicker(candles)).toBeCloseTo(131.84, 1);
  });

  it('rewards a volume spike over a quiet tape', () => {
    const quiet = [candle({ c: 100, v: 1_000_000 }), candle({ o: 100, c: 100, v: 1_000_000 })];
    const spike = [candle({ c: 100, v: 1_000_000 }), candle({ o: 100, h: 110, l: 100, c: 109, v: 5_000_000 })];
    expect(scoreTicker(spike)).toBeGreaterThan(scoreTicker(quiet));
  });
});

describe('scoreTickerForMode', () => {
  const greenSpike = [
    candle({ o: 100, h: 101, l: 99, c: 100, v: 1_000_000 }),
    candle({ o: 100, h: 102, l: 100, c: 101, v: 1_000_000 }),
    candle({ o: 101, h: 106, l: 101, c: 105, v: 3_000_000 }),
  ];

  it('equals scoreTicker for mode "both"', () => {
    expect(scoreTickerForMode(greenSpike, 'both')).toBe(scoreTicker(greenSpike));
  });

  it('boosts a strong green close in long mode and penalizes it in short mode', () => {
    const base = scoreTicker(greenSpike);
    // long: +15 (green) +10 (close top 30%) +10 (above-avg vol & green) = +35
    expect(scoreTickerForMode(greenSpike, 'long')).toBeCloseTo(base + 35, 1);
    // short: -10 (not red), no other bonuses
    expect(scoreTickerForMode(greenSpike, 'short')).toBeCloseTo(base - 10, 1);
    expect(scoreTickerForMode(greenSpike, 'long')).toBeGreaterThan(scoreTickerForMode(greenSpike, 'short'));
  });

  it('is 0 with fewer than 2 candles in a directional mode', () => {
    expect(scoreTickerForMode([candle()], 'long')).toBe(0);
  });
});

describe('computeTechnicalProfile', () => {
  it('returns null with fewer than 25 candles', () => {
    expect(computeTechnicalProfile('AAA', series(24), series(24))).toBeNull();
  });

  it('flags an uptrend (SMA20 > SMA50, price above SMA20) for a steadily rising series', () => {
    const up = series(60, { driftPct: 0.5 });          // ~+0.5%/day
    const flatSpy = series(60, { driftPct: 0 });
    const p = computeTechnicalProfile('UP', up, flatSpy);
    expect(p).not.toBeNull();
    expect(p!.trendUp).toBe(true);
    expect(p!.distSma20).toBeGreaterThan(0);
    expect(p!.rs20).toBeGreaterThan(0);                // outperforming a flat SPY
    expect(p!.high20Pct).toBeLessThan(5);              // sitting near the highs
    expect(p!.price).toBeGreaterThan(0);
  });

  it('flags a downtrend for a steadily falling series', () => {
    const down = series(60, { driftPct: -0.5 });
    const p = computeTechnicalProfile('DN', down, series(60));
    expect(p!.trendUp).toBe(false);
    expect(p!.distSma20).toBeLessThan(0);
    expect(p!.low20Pct).toBeLessThan(5);               // sitting near the lows
  });
});

describe('scoreTechnical', () => {
  const bullish: TechnicalProfile = {
    ticker: 'B', price: 100, changePct: 4, rs20: 20, distSma20: 6, distSma50: 12,
    atrPct: 3, high20Pct: 1, low20Pct: 30, volRatio: 2, trendUp: true,
  };
  const bearish: TechnicalProfile = {
    ticker: 'R', price: 100, changePct: -4, rs20: -20, distSma20: -6, distSma50: -12,
    atrPct: 3, high20Pct: 30, low20Pct: 1, volRatio: 2, trendUp: false,
  };

  it('scores a bullish profile higher long than short', () => {
    expect(scoreTechnical(bullish, 'long')).toBeGreaterThan(scoreTechnical(bullish, 'short'));
  });

  it('scores a bearish profile higher short than long', () => {
    expect(scoreTechnical(bearish, 'short')).toBeGreaterThan(scoreTechnical(bearish, 'long'));
  });

  it('mode "both" returns the max of long and short', () => {
    expect(scoreTechnical(bullish, 'both')).toBe(
      Math.max(scoreTechnical(bullish, 'long'), scoreTechnical(bullish, 'short'))
    );
  });
});

describe('candle summaries', () => {
  it('summarizeCandles reports a bull candle, body and volume ratio', () => {
    const s = summarizeCandles('NVDA', [
      candle({ c: 100, v: 1_000_000 }),
      candle({ o: 100, h: 110, l: 100, c: 108, v: 3_000_000 }),
    ]);
    expect(s).toContain('NVDA');
    expect(s).toContain('bull candle');
    expect(s).toContain('body=');
    expect(s).toContain('vol=3.0x avg');
  });

  it('summarizeCandles handles no data', () => {
    expect(summarizeCandles('NVDA', [])).toBe('NVDA: no data');
  });

  it('intraday/weekly/premarket return empty strings for no candles', () => {
    expect(summarizeIntradayCandles('X', [])).toBe('');
    expect(summarizeWeeklyCandles('X', [])).toBe('');
    expect(summarizePremarket('X', [])).toBe('');
  });

  it('weekly summary is labelled and lists week candles', () => {
    expect(summarizeWeeklyCandles('AMD', series(3))).toContain('AMD weekly(3wk):');
  });

  it('premarket summary is labelled with high/low/last', () => {
    const s = summarizePremarket('TSLA', [candle({ o: 200, c: 204 }), candle({ o: 204, c: 206 })]);
    expect(s).toContain('TSLA pre-mkt:');
    expect(s).toContain('H:$');
    expect(s).toContain('Last:$');
  });
});

describe('computeVWAPMap', () => {
  it('returns {} for no input', () => {
    expect(computeVWAPMap({})).toEqual({});
  });

  it('produces a VWAP within the price range for each ticker (today\'s candles only)', () => {
    const today = new Date().toISOString().split('T')[0];
    const intraday = {
      AMD: [
        candle({ t: `${today}T14:00:00Z`, h: 12, l: 8, c: 10 }),
        candle({ t: `${today}T15:00:00Z`, h: 14, l: 10, c: 12 }),
      ],
    };
    const map = computeVWAPMap(intraday);
    expect(map.AMD).toBeCloseTo(11, 5); // typical prices 10 and 12, equal volume
  });

  it('omits tickers with no candles dated today', () => {
    const intraday = { OLD: [candle({ t: '2020-01-01T14:00:00Z' })] };
    expect(computeVWAPMap(intraday)).toEqual({});
  });
});

describe('CHART_RANGES', () => {
  it('lists the eight ranges in display order', () => {
    expect(CHART_RANGES).toEqual(['max', '2y', '1y', 'ytd', '1m', '1w', '1d', 'now']);
  });
});

describe('getUniverse (no Alpaca keys → static fallback)', () => {
  it('returns the static universe of uppercase tickers', async () => {
    const u = await getUniverse();
    expect(u.length).toBeGreaterThan(100);
    expect(u).toContain('AAPL');
    expect(u).toContain('NVDA');
    expect(u.every((t) => t === t.toUpperCase())).toBe(true);
  });
});
