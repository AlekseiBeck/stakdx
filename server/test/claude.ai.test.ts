import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Anthropic SDK: every `new Anthropic()` shares one `create` spy we drive per test.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

import {
  expandNewsQuery,
  classifyMacroRegime,
  scoreNewsImpact,
  triageCandidates,
  analyzePositionWithClaude,
  buildChatDataSection,
  type ChatContext,
} from '../src/claude';
import type { TechnicalProfile } from '../src/alpaca';
import { candle, series } from './helpers';

// A structured-output response: JSON in a single text block.
const jsonMsg = (obj: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });

beforeEach(() => {
  create.mockReset();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('expandNewsQuery', () => {
  it('falls back to the raw input with no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await expandNewsQuery('memory')).toEqual({ query: 'memory', focus: '' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns the parsed query and focus', async () => {
    create.mockResolvedValueOnce(jsonMsg({ query: 'Micron OR "SK Hynix"', focus: 'Memory — MU, Samsung' }));
    expect(await expandNewsQuery('memory')).toEqual({ query: 'Micron OR "SK Hynix"', focus: 'Memory — MU, Samsung' });
  });

  it('falls back to the input when the model returns an empty query', async () => {
    create.mockResolvedValueOnce(jsonMsg({ query: '   ', focus: '' }));
    expect(await expandNewsQuery('nvda')).toEqual({ query: 'nvda', focus: '' });
  });

  it('falls back on an SDK error', async () => {
    create.mockRejectedValueOnce(new Error('boom'));
    expect(await expandNewsQuery('ai')).toEqual({ query: 'ai', focus: '' });
  });
});

describe('classifyMacroRegime', () => {
  const regime = { regime: 'RISK_ON', fedStance: 'NEUTRAL', summary: 'Tech leading', topRisks: ['a', 'b', 'c'] };

  it('returns null with no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await classifyMacroRegime(series(5), series(5), [], [])).toBeNull();
  });

  it('returns the parsed regime', async () => {
    create.mockResolvedValueOnce(jsonMsg(regime));
    expect(await classifyMacroRegime(series(5), series(5), [], [])).toMatchObject({ regime: 'RISK_ON' });
  });

  it('returns null on error', async () => {
    create.mockRejectedValueOnce(new Error('x'));
    expect(await classifyMacroRegime(series(5), series(5), [], [])).toBeNull();
  });
});

describe('scoreNewsImpact', () => {
  const news = [
    { headline: 'Beats earnings', ticker: 'AAPL', source: 'WSJ' },
    { headline: 'Minor reshuffle', ticker: 'MSFT', source: 'Blog' },
    { headline: 'FDA approval', ticker: 'PFE', source: 'Reuters' },
  ];

  it('returns [] when there is no news', async () => {
    expect(await scoreNewsImpact([])).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps only HIGH/MEDIUM items and maps them back to the source headline', async () => {
    create.mockResolvedValueOnce(jsonMsg({
      scores: [
        { index: 0, impact: 'HIGH', direction: 'BULLISH', category: 'earnings' },
        { index: 1, impact: 'LOW', direction: 'NEUTRAL', category: 'other' },
        { index: 2, impact: 'MEDIUM', direction: 'BULLISH', category: 'regulatory' },
      ],
    }));
    const out = await scoreNewsImpact(news);
    expect(out.map((s) => s.ticker)).toEqual(['AAPL', 'PFE']);
    expect(out[0]).toMatchObject({ headline: 'Beats earnings', impact: 'HIGH', source: 'WSJ' });
  });

  it('drops scores whose index has no matching headline', async () => {
    create.mockResolvedValueOnce(jsonMsg({ scores: [{ index: 99, impact: 'HIGH', direction: 'BULLISH', category: 'other' }] }));
    expect(await scoreNewsImpact(news)).toEqual([]);
  });

  it('returns [] on error', async () => {
    create.mockRejectedValueOnce(new Error('x'));
    expect(await scoreNewsImpact(news)).toEqual([]);
  });
});

describe('triageCandidates', () => {
  const profile = (ticker: string): TechnicalProfile => ({
    ticker, price: 100, changePct: 1, rs20: 5, distSma20: 2, distSma50: 4,
    atrPct: 3, high20Pct: 2, low20Pct: 20, volRatio: 1.5, trendUp: true,
  });
  const profiles = [profile('AMD'), profile('NVDA')];

  it('returns [] with no key or no profiles', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await triageCandidates(profiles, 'both', null, new Set(), 2)).toEqual([]);
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    expect(await triageCandidates([], 'both', null, new Set(), 2)).toEqual([]);
  });

  it('keeps only known tickers, dedupes, and caps at count', async () => {
    create.mockResolvedValueOnce(jsonMsg({
      picks: [
        { ticker: 'AMD', bias: 'long', reason: 'breakout' },
        { ticker: 'ZZZZ', bias: 'long', reason: 'unknown ticker' }, // not in profiles → dropped
        { ticker: 'AMD', bias: 'long', reason: 'dupe' },             // dupe → dropped
        { ticker: 'NVDA', bias: 'long', reason: 'leader' },
      ],
    }));
    const picks = await triageCandidates(profiles, 'both', null, new Set(), 1);
    expect(picks).toHaveLength(1);
    expect(picks[0].ticker).toBe('AMD');
  });

  it('returns [] on error', async () => {
    create.mockRejectedValueOnce(new Error('x'));
    expect(await triageCandidates(profiles, 'both', null, new Set(), 2)).toEqual([]);
  });
});

describe('analyzePositionWithClaude', () => {
  const position = {
    id: '1', ticker: 'AAPL', entryPrice: 100, entryTime: '2026-06-01T00:00:00Z',
    direction: 'long' as const, stopLoss: 90, target: 120,
  };
  const candles = [candle({ c: 100 }), candle({ o: 100, c: 110 })];

  it('returns null with no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await analyzePositionWithClaude(position, candles, [])).toBeNull();
  });

  it('returns the parsed verdict', async () => {
    create.mockResolvedValueOnce(jsonMsg({ verdict: 'HOLD', reasoning: 'on track', priceChange: '+1.00%' }));
    const out = await analyzePositionWithClaude(position, candles, []);
    expect(out).toMatchObject({ verdict: 'HOLD', priceChange: '+1.00%' });
  });

  it('normalizes a priceChange that lacks a +/- sign using the computed move', async () => {
    create.mockResolvedValueOnce(jsonMsg({ verdict: 'HOLD', reasoning: 'x', priceChange: 'flat' }));
    const out = await analyzePositionWithClaude(position, candles, []);
    expect(out!.priceChange).toMatch(/^[+-]\d/); // recomputed from candles (110 vs 100 → +10.00%)
  });

  it('returns null on error', async () => {
    create.mockRejectedValueOnce(new Error('x'));
    expect(await analyzePositionWithClaude(position, candles, [])).toBeNull();
  });
});

describe('buildChatDataSection (pure)', () => {
  const baseCtx = (over: Partial<ChatContext> = {}): ChatContext => ({
    positions: [], scanResults: [], news: [], prices: {},
    candleSummaries: {}, tickerNews: {}, newsAPIArticles: [], ...over,
  });

  it('reports no positions / no scan when empty', () => {
    const out = buildChatDataSection(baseCtx());
    expect(out).toContain('OPEN POSITIONS: None.');
    expect(out).toContain('LATEST SCAN: No scan run yet.');
  });

  it('renders an open position with live P/L', () => {
    const out = buildChatDataSection(baseCtx({
      positions: [{ id: '1', ticker: 'aapl', entryPrice: 100, entryTime: 't', direction: 'long', stopLoss: 90, target: 120 } as ChatContext['positions'][number]],
      prices: { AAPL: 110 },
    }));
    expect(out).toContain('AAPL LONG @ $100.00');
    expect(out).toContain('+10.00%');
    expect(out).toContain('Stop $90.00');
  });

  it('adds the workstation line and buckets workstation tickers vs positions', () => {
    const out = buildChatDataSection(baseCtx({
      workstationTickers: ['amd', 'nvda'],
      candleSummaries: { AMD: 'AMD: ...', NVDA: 'NVDA: ...', TSLA: 'TSLA: ...', SPY: 'SPY: ...' },
    }));
    expect(out).toContain('RESEARCH WORKSTATION — 2 tickers loaded side by side');
    expect(out).toContain('AMD, NVDA');
  });

  it('omits the workstation line when no workstation tickers are loaded', () => {
    expect(buildChatDataSection(baseCtx())).not.toContain('RESEARCH WORKSTATION');
  });
});
