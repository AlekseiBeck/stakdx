import Anthropic from '@anthropic-ai/sdk';
import {
  Candle, TradeRecommendation, NewsItem, PositionUpdate, Position,
  MacroRegime, ScoredNewsItem, RedditSentimentEntry, EconomicEvent,
} from './types';
import {
  summarizeCandles, summarizeIntradayCandles, summarizePremarket, summarizeWeeklyCandles,
} from './alpaca';
import type { FinnhubNewsItem, EarningsEvent } from './finnhub';

// ─── Types ───────────────────────────────────────────────────────────────────

type StockTwitsSentimentEntry = {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  bullCount: number;
  bearCount: number;
  total: number;
};

type SentimentMap = Record<string, StockTwitsSentimentEntry>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasAnthropicKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here');
}

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ─── Models ──────────────────────────────────────────────────────────────────
// Opus 4.8 for the calls where prediction quality matters (scan analysis, position
// verdicts, chat). Haiku 4.5 stays on the cheap pre-processing layers (macro regime,
// news scoring) where speed/cost matter more than depth.
const ANALYSIS_MODEL = 'claude-opus-4-8';
const FAST_MODEL = 'claude-haiku-4-5-20251001';

// ─── Structured output schemas ───────────────────────────────────────────────
// Passed via output_config.format — the API guarantees the response text is valid
// JSON matching the schema, so no markdown-fence stripping or retry logic needed.
// Note: structured outputs forbid numeric min/max constraints; ranges live in
// descriptions and the prompt instead.

const SCAN_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      setups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ticker: { type: 'string' },
            direction: { type: 'string', enum: ['LONG', 'SHORT', 'CALL', 'PUT'] },
            confidence: { type: 'integer', description: 'Calibrated confidence, 58-100' },
            entryZone: { type: 'string', description: '"$X.XX - $Y.YY"' },
            stopLoss: { type: 'string', description: '"$X.XX"' },
            target: { type: 'string', description: '"$X.XX"' },
            timeframe: { type: 'string', description: 'e.g. "1-2 days"' },
            rationale: { type: 'string' },
            pattern: { type: 'string' },
            positionSize: { type: 'string' },
            maxRisk: { type: 'string' },
            potentialGain: { type: 'string' },
          },
          required: [
            'ticker', 'direction', 'confidence', 'entryZone', 'stopLoss', 'target',
            'timeframe', 'rationale', 'pattern', 'positionSize', 'maxRisk', 'potentialGain',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['setups'],
    additionalProperties: false,
  },
};

const MACRO_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      regime: { type: 'string', enum: ['RISK_ON', 'RISK_OFF', 'MIXED'] },
      fedStance: { type: 'string', enum: ['HAWKISH', 'NEUTRAL', 'DOVISH'] },
      topRisks: { type: 'array', items: { type: 'string' } },
      sectorBias: {
        type: 'object',
        properties: {
          tech: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          financials: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          energy: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          healthcare: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          consumer: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
          industrials: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
        },
        required: ['tech', 'financials', 'energy', 'healthcare', 'consumer', 'industrials'],
        additionalProperties: false,
      },
      summary: { type: 'string' },
    },
    required: ['regime', 'fedStance', 'topRisks', 'sectorBias', 'summary'],
    additionalProperties: false,
  },
};

const NEWS_SCORE_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            impact: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
            direction: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
            category: { type: 'string', enum: ['earnings', 'macro', 'regulatory', 'product', 'ma', 'geopolitical', 'other'] },
          },
          required: ['index', 'impact', 'direction', 'category'],
          additionalProperties: false,
        },
      },
    },
    required: ['scores'],
    additionalProperties: false,
  },
};

const POSITION_OUTPUT_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['HOLD', 'SELL', 'CAUTION'] },
      reasoning: { type: 'string' },
      currentPrice: { type: 'string', description: '"$XXX.XX"' },
      priceChange: { type: 'string', description: '"+X.XX%" or "-X.XX%"' },
    },
    required: ['verdict', 'reasoning', 'currentPrice', 'priceChange'],
    additionalProperties: false,
  },
};

// Extract the text block from a response that may also contain thinking blocks
function responseText(msg: Anthropic.Message): string {
  for (const block of msg.content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}

// ─── Layer 1: Macro Regime Classifier (Claude Haiku) ────────────────────────
//
// Runs a fast, cheap Haiku call before the main analysis to classify the
// overall market environment. This context is injected into every Sonnet call
// so that individual stock recommendations are anchored to the macro reality.

export async function classifyMacroRegime(
  spyCandles: Candle[],
  qqqCandles: Candle[],
  marketNews: NewsItem[],
  economicEvents: EconomicEvent[]
): Promise<MacroRegime | null> {
  if (!hasAnthropicKey()) return null;

  const client = getClient();

  const spySummary = summarizeCandles('SPY', spyCandles);
  const qqqSummary = summarizeCandles('QQQ', qqqCandles);
  const newsLines = marketNews.slice(0, 12).map(n => `• ${n.headline}`).join('\n');
  const calendarLines = economicEvents.length > 0
    ? economicEvents.map(e => `${e.date} [${e.impact.toUpperCase()}] ${e.event}`).join('\n')
    : 'None scheduled';

  const userMsg = `SPY (5-day daily): ${spySummary}
QQQ (5-day daily): ${qqqSummary}

Economic events next 7 days:
${calendarLines}

Recent broad market headlines:
${newsLines}

Classify the current market regime. topRisks should contain the 3 most material risks. summary is one sentence describing the dominant market theme right now.`;

  try {
    const msg = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 600,
      system: 'You are a macro market analyst. Classify the market regime from the data provided.',
      messages: [{ role: 'user', content: userMsg }],
      output_config: { format: MACRO_OUTPUT_FORMAT },
    });

    return JSON.parse(responseText(msg)) as MacroRegime;
  } catch (err) {
    console.error('[claude] Macro regime classification error:', err);
    return null;
  }
}

// ─── Layer 2: News Impact Scorer (Claude Haiku) ──────────────────────────────
//
// Pre-processes raw news headlines into structured, impact-scored items.
// Only HIGH and MEDIUM items reach the main Sonnet prompt — dramatically
// improving signal quality by filtering out noise before the expensive call.

export async function scoreNewsImpact(
  news: Array<{ headline: string; ticker?: string; source: string }>
): Promise<ScoredNewsItem[]> {
  if (!hasAnthropicKey() || news.length === 0) return [];

  const client = getClient();

  const newsLines = news.slice(0, 30).map((n, i) =>
    `${i}: [${n.ticker ?? 'MARKET'}] "${n.headline}" — ${n.source}`
  ).join('\n');

  const userMsg = `Score each headline for stock trading impact. Index is 0-based. Return one entry per headline.

Headlines:
${newsLines}`;

  try {
    const msg = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 1200,
      system: 'You are a financial news analyst. Score each headline for its likely impact on stock prices.',
      messages: [{ role: 'user', content: userMsg }],
      output_config: { format: NEWS_SCORE_OUTPUT_FORMAT },
    });

    const scored = (JSON.parse(responseText(msg)) as {
      scores: Array<{
        index: number;
        impact: 'HIGH' | 'MEDIUM' | 'LOW';
        direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        category: ScoredNewsItem['category'];
      }>;
    }).scores;

    // Map back to full headline objects
    return scored
      .filter(s => s.impact === 'HIGH' || s.impact === 'MEDIUM')
      .map(s => {
        const src = news[s.index];
        if (!src) return null;
        return {
          headline: src.headline,
          ticker: src.ticker,
          source: src.source,
          impact: s.impact,
          direction: s.direction,
          category: s.category,
        } as ScoredNewsItem;
      })
      .filter((x): x is ScoredNewsItem => x !== null);
  } catch (err) {
    console.error('[claude] News scoring error:', err);
    return [];
  }
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildMacroSection(regime: MacroRegime | null): string {
  if (!regime) return '';

  const regimeEmoji = regime.regime === 'RISK_ON' ? '🟢' : regime.regime === 'RISK_OFF' ? '🔴' : '🟡';
  const fedEmoji = regime.fedStance === 'HAWKISH' ? '🦅' : regime.fedStance === 'DOVISH' ? '🕊️' : '⚖️';

  const biasLines = Object.entries(regime.sectorBias)
    .map(([sector, bias]) => `${sector}=${bias}`)
    .join(' | ');

  return `
━━━ MACRO REGIME CONTEXT (AI-classified from SPY/QQQ + news) ━━━
${regimeEmoji} Regime: ${regime.regime} | ${fedEmoji} Fed Stance: ${regime.fedStance}
Market Theme: ${regime.summary}
Top Risks: ${regime.topRisks.map((r, i) => `[${i + 1}] ${r}`).join(' | ')}
Sector Bias: ${biasLines}

REGIME TRADING RULES (apply these before scoring any setup):
${regime.regime === 'RISK_OFF' ? '• RISK_OFF: Be highly selective on longs. Shorts/puts have macro tailwind. Reduce all long confidence by −10. If setup conflicts with regime — skip it.' : ''}
${regime.regime === 'RISK_ON' ? '• RISK_ON: Longs/calls have macro tailwind. Reduce short confidence by −8. Momentum setups have higher follow-through probability.' : ''}
${regime.regime === 'MIXED' ? '• MIXED: Use tighter criteria. Prefer setups with strong individual catalysts over pure-macro plays. Reduce all confidence by −5.' : ''}
${regime.fedStance === 'HAWKISH' ? '• HAWKISH Fed: Rate-sensitive sectors (real estate, utilities, growth tech) face headwinds. Financials may benefit.' : ''}
${regime.fedStance === 'DOVISH' ? '• DOVISH Fed: Growth tech, small caps, rate-sensitive plays get a tailwind. Financials may face margin pressure.' : ''}
`;
}

function buildScoredNewsSection(scoredNews: ScoredNewsItem[]): string {
  if (scoredNews.length === 0) return '';

  const high = scoredNews.filter(n => n.impact === 'HIGH');
  const medium = scoredNews.filter(n => n.impact === 'MEDIUM');

  const formatItem = (n: ScoredNewsItem) => {
    const dirEmoji = n.direction === 'BULLISH' ? '▲' : n.direction === 'BEARISH' ? '▼' : '─';
    const ticker = n.ticker ? `[${n.ticker}]` : '[MACRO]';
    return `${dirEmoji} ${ticker} "${n.headline}" (${n.category}) — ${n.source}`;
  };

  const lines: string[] = [];
  if (high.length > 0) {
    lines.push('HIGH IMPACT:');
    lines.push(...high.map(n => `  ${formatItem(n)}`));
  }
  if (medium.length > 0) {
    lines.push('MEDIUM IMPACT:');
    lines.push(...medium.slice(0, 8).map(n => `  ${formatItem(n)}`));
  }

  return `
━━━ NEWS (AI pre-scored — HIGH & MEDIUM impact only) ━━━
${lines.join('\n')}
`;
}

function buildEconomicCalendarSection(events: EconomicEvent[]): string {
  if (events.length === 0) return '';

  const lines = events.map(e => {
    const emoji = e.impact === 'high' ? '🔴' : '🟡';
    return `${emoji} ${e.date}: ${e.event} (${e.impact.toUpperCase()} IMPACT)`;
  });

  return `
━━━ ECONOMIC CALENDAR — NEXT 7 DAYS ━━━
${lines.join('\n')}
CAUTION: Avoid initiating new positions 24h before HIGH impact events unless the setup is exceptional. Reduce confidence by −8 for any stock directly affected.
`;
}

function buildStockTwitsSection(sentiment: SentimentMap): string {
  const entries = Object.entries(sentiment).filter(([, s]) => s.total >= 3);
  if (entries.length === 0) return '';

  const lines = entries.map(([ticker, s]) => {
    const bullPct = s.total > 0 ? Math.round((s.bullCount / s.total) * 100) : 0;
    const emoji = s.sentiment === 'bullish' ? '🟢' : s.sentiment === 'bearish' ? '🔴' : '⚪';
    return `  ${ticker}: ${emoji} ${s.sentiment.toUpperCase()} ${s.bullCount}▲/${s.bearCount}▼ (${bullPct}% bull, ${s.total} votes)`;
  });

  return `
StockTwits (last 30 messages/ticker):
${lines.join('\n')}
`;
}

function buildRedditSection(reddit: Record<string, RedditSentimentEntry>): string {
  const entries = Object.entries(reddit).filter(([, r]) => r.mentions >= 2);
  if (entries.length === 0) return '';

  const lines = entries
    .sort(([, a], [, b]) => b.mentions - a.mentions)
    .slice(0, 12)
    .map(([ticker, r]) => {
      const emoji = r.sentiment === 'bullish' ? '🟢' : r.sentiment === 'bearish' ? '🔴' : '⚪';
      const postSnip = r.topPost ? ` — "${r.topPost}"` : '';
      return `  ${ticker}: ${emoji} ${r.sentiment.toUpperCase()} (${r.mentions} mentions)${postSnip}`;
    });

  return `
Reddit (r/wallstreetbets + r/stocks):
${lines.join('\n')}
`;
}

function buildEarningsSection(earningsEvents: EarningsEvent[]): string {
  if (earningsEvents.length === 0) return '';
  const lines = earningsEvents.map(e => {
    const epsStr = e.epsEstimate != null ? ` | EPS est: $${e.epsEstimate}` : '';
    const revStr = e.revenueEstimate != null ? ` | Rev est: $${(e.revenueEstimate / 1e9).toFixed(1)}B` : '';
    return `  ⚠️  ${e.ticker}: reports ${e.date}${epsStr}${revStr}`;
  });

  return `
━━━ EARNINGS RISK (within 7 days) ━━━
${lines.join('\n')}
For options: note IV crush risk post-earnings. For stocks: tighten stops 50% or avoid holding through report.
`;
}

function buildIntradaySection(intradayData: Record<string, Candle[]>): string {
  const entries = Object.entries(intradayData).filter(([, c]) => c.length > 0);
  if (entries.length === 0) return '';
  const lines = entries.map(([ticker, candles]) => summarizeIntradayCandles(ticker, candles));
  return `\nINTRADAY CONTEXT (1h bars, last 2 trading days):\n${lines.join('\n')}\n`;
}

function buildScanPrompt(): string {
  return `You are a senior professional swing trader with 20 years of experience at a top-tier hedge fund. You combine rigorous technical analysis, macro awareness, news catalysts, and social sentiment to surface the highest-conviction setups available right now.

YOUR EDGE IS SELECTIVITY. On a typical day, only 2-6 of the 15 candidates you see are genuinely tradeable. Most candidates were pre-filtered by a momentum score, not by setup quality — expect the majority to fail your filters. Returning few setups (or zero) is a correct, professional outcome; padding the list with marginal setups destroys the win rate. Never invent a pattern to justify including a ticker.

BUYING POWER & SIZING:
- Buying power is stated in the analysis request ("Buying power: $X"). Use that exact amount.
- shares = floor(buying_power / entryPrice) — size the position to deploy the full buying power
- maxRisk = shares × (entryPrice − stopLoss) — report actual dollar risk
- potentialGain = shares × (target − entryPrice)
- Return exact share counts in positionSize (e.g. "59 shares"), maxRisk and potentialGain in dollars.
- If no buying power is stated: use "size to risk $200" as positionSize.

━━━ HOW TO READ THE DATA ━━━
Each stock block contains:
1. WEEKLY (3 bars): Establishes the multi-week trend direction
2. DAILY (5 bars): Format — DATE O[open] H[high] L[low] C[close] V[millions] | change% | candle type | body strength | vol ratio
3. VWAP: Today's volume-weighted average price — above=bullish intraday bias, below=bearish
4. PRE-MARKET: Gap direction and magnitude before open (if available)
5. INTRADAY (1h, 2 days): Fine-grained momentum and entry timing

━━━ BULLISH PATTERNS (LONG / CALL) ━━━
• Bullish Engulfing — green body fully engulfs prior red body at support. Requires vol ≥1.3× avg.
• Hammer / Pin Bar — lower wick ≥2× body, closes near high, at support. Rejection of lower prices.
• Morning Star — 3-candle: bearish → indecision doji → bullish (closes >50% into first candle).
• Inside Bar Breakout — consolidation within prior bar. Breakout on volume = directional confirmation.
• EMA/Support Bounce — dips to key level, bounces with bullish candle + volume. Clean R:R.
• Cup & Handle / Base Breakout — multi-day base, then volume-confirmed break above resistance.
• Gap-and-hold — pre-market gap up, consolidates above gap level, does not fill → continuation.

━━━ BEARISH PATTERNS (SHORT / PUT) ━━━
• Bearish Engulfing — red body engulfs prior green at resistance. Vol ≥1.3× avg.
• Shooting Star / Gravestone Doji — upper wick ≥2× body, closes near low, at resistance.
• Evening Star — 3-candle topping reversal at highs.
• Distribution Day — high-volume red day near recent highs. Institutional distribution.
• Resistance Failure — multiple tests of resistance, each rejected. Exhaustion pattern.
• Gap-and-fail — opens above resistance, fades back below on volume. Trapped longs.

━━━ MANDATORY QUALITY FILTERS (any failure = reject) ━━━
1. Risk/Reward ≥ 2:1 — target distance ≥ 2× stop distance. No exceptions.
2. Volume confirmation — signal candle must have vol ≥ average. Low-vol breakouts are traps.
3. Trend alignment — direction must match 3-5 day trend OR clear reversal pattern present.
4. No overextension — LONG: price not >12% above nearest support. SHORT: not >12% below resistance.
5. Sector cap — max 3 stocks per sector per scan. Quality over quantity.
6. Confidence floor — minimum 58. Below this: exclude entirely.
7. Macro alignment — if regime is RISK_OFF, require additional confirmation for any LONG setup.

━━━ CONFIDENCE SCORING (58–100) ━━━
Confidence is a calibrated probability statement, not enthusiasm. A "75" should win roughly 3 of 4 times against its stop. When unsure between two scores, pick the lower one.
• 88–100: Pattern + high volume + news catalyst + trend + clean S/R + macro aligned. Rare — at most 1-2 per month, not per scan.
• 75–87: Pattern + volume + (news OR trend alignment). Strong setup.
• 65–74: Clear pattern + average volume. Decent, size conservatively.
• 58–64: Pattern present, 1–2 weak confirming factors. Include only if no better options.

Adjustments:
+12 : High-impact news directly confirms direction (earnings beat, major catalyst)
+8  : Medium-impact news confirms direction | SPY/QQQ 3-5d trend confirms direction
+5  : Social sentiment (StockTwits or Reddit) aligns with direction
−5  : Social sentiment contradicts direction
−8  : SPY/QQQ trend opposes direction | Medium-impact adverse news
−10 : Regime opposes direction (RISK_OFF on LONG, RISK_ON on SHORT)
−15 : High-impact news contradicts direction (note conflict in rationale)
−8  : Earnings within 3 days (flag as high risk, note IV/gap risk)
+3  : Pre-market gap confirms direction (gap up for LONG, gap down for SHORT)
−5  : Pre-market gap opposes direction

VWAP guidance:
• Price above VWAP → bullish intraday bias → +3 for LONG, −3 for SHORT
• Price below VWAP → bearish intraday bias → +3 for SHORT, −3 for LONG

━━━ OPTIONS vs STOCK ━━━
Use CALL/PUT when: confidence ≥ 75, expecting sharp/fast move, clear catalyst, or limited capital.
Use LONG/SHORT when: steady grind expected, confidence 58-74, options premiums unfavorable.

━━━ PRICE-LEVEL SELF-CHECK (run on every setup before output) ━━━
1. Entry zone must sit within ±2% of the latest close OR at a named breakout/retest level visible in the data. Never quote prices that do not derive from the candles provided.
2. LONG/CALL: stopLoss < entryZone < target. SHORT/PUT: target < entryZone < stopLoss. Any violation = fix or drop the setup.
3. Recompute R:R from your own numbers: (target − entry) / (entry − stop) ≥ 2.0 (mirror for shorts). If it fails, drop the setup — do not stretch the target to force it.
4. shares/maxRisk/potentialGain must be arithmetic from your own entry/stop/target — recompute, don't estimate.

━━━ OUTPUT ━━━
Return a JSON object: { "setups": [ ... ] } where each setup has:
- ticker, direction (LONG|SHORT|CALL|PUT), confidence (58-100, calibrated)
- entryZone ("$X.XX - $Y.YY" — tight range near current price or breakout level)
- stopLoss ("$X.XX" — technical invalidation, not arbitrary)
- target ("$X.XX" — next key S/R, must give ≥2:1 R:R)
- timeframe ("1-2 days")
- rationale (3 sentences: name the pattern, cite confirming signals including macro/news/social, explain entry timing using VWAP/intraday context)
- pattern (specific name, e.g. "Bullish Engulfing at 50-day Support")
- positionSize, maxRisk, potentialGain
An empty setups array is a valid answer when nothing qualifies.`;
}

// ─── Build per-batch user message ────────────────────────────────────────────

function buildUserMessage(
  batchEntries: [string, Candle[]][],
  weeklyData: Record<string, Candle[]>,
  intradayData: Record<string, Candle[]>,
  premarketData: Record<string, Candle[]>,
  vwapMap: Record<string, number>,
  macroRegime: MacroRegime | null,
  scoredNews: ScoredNewsItem[],
  economicEvents: EconomicEvent[],
  earningsEvents: EarningsEvent[],
  stockTwitsSentiment: SentimentMap,
  redditSentiment: Record<string, RedditSentimentEntry>,
  buyingPower: number | null,
  focusSection: string,
  analysisDate: string
): string {
  // Build per-stock blocks
  const stockBlocks = batchEntries.map(([ticker, candles]) => {
    const daily = summarizeCandles(ticker, candles);
    const weekly = weeklyData[ticker] ? summarizeWeeklyCandles(ticker, weeklyData[ticker]) : '';
    const intraday = intradayData[ticker] ? summarizeIntradayCandles(ticker, intradayData[ticker]) : '';
    const premarket = premarketData[ticker] ? summarizePremarket(ticker, premarketData[ticker]) : '';
    const vwap = vwapMap[ticker] ? `${ticker} VWAP(today): $${vwapMap[ticker].toFixed(2)}` : '';

    return [weekly, daily, vwap, premarket, intraday].filter(Boolean).join('\n');
  }).join('\n\n');

  // Social sentiment block
  const socialSection = [
    buildStockTwitsSection(stockTwitsSentiment),
    buildRedditSection(redditSentiment),
  ].filter(Boolean).join('');

  return `Analysis date: ${analysisDate}
Stocks to analyze: ${batchEntries.length}
${buyingPower ? `Buying power: $${buyingPower.toLocaleString()}` : ''}
${focusSection}
${buildMacroSection(macroRegime)}
${buildEconomicCalendarSection(economicEvents)}
${buildScoredNewsSection(scoredNews)}
${buildEarningsSection(earningsEvents)}
━━━ STOCK DATA ━━━
${stockBlocks}
━━━ SOCIAL SENTIMENT ━━━
${socialSection || 'No social data available for this batch.'}
Analyze the above and return your highest-conviction swing trade setups as a JSON array.`;
}

// ─── Main scan: analyze all candles (non-streaming) ─────────────────────────

export async function analyzeCandlesWithClaude(
  candleData: Record<string, Candle[]>,
  weeklyData: Record<string, Candle[]>,
  intradayData: Record<string, Candle[]>,
  premarketData: Record<string, Candle[]>,
  vwapMap: Record<string, number>,
  macroRegime: MacroRegime | null,
  scoredNews: ScoredNewsItem[],
  economicEvents: EconomicEvent[],
  earningsEvents: EarningsEvent[],
  stockTwitsSentiment: SentimentMap,
  redditSentiment: Record<string, RedditSentimentEntry>,
  buyingPower: number | null = null,
  focusDirections: string[] = []
): Promise<TradeRecommendation[] | null> {
  if (!hasAnthropicKey()) return null;

  const client = getClient();
  const cachedSystem = [{ type: 'text' as const, text: buildScanPrompt(), cache_control: { type: 'ephemeral' as const } }];
  const analysisDate = new Date().toISOString().split('T')[0];
  const focusSection = focusDirections.length > 0
    ? `\nSCAN FOCUS (STRICT): Return ONLY setups where direction ∈ {${focusDirections.join(', ')}}. No exceptions. Be thorough — return every qualifying setup within allowed types.\n`
    : '';

  const entries = Object.entries(candleData);
  const mid = Math.ceil(entries.length / 2);

  const makeMsg = (batch: [string, Candle[]][]) =>
    buildUserMessage(batch, weeklyData, intradayData, premarketData, vwapMap,
      macroRegime, scoredNews, economicEvents, earningsEvents,
      stockTwitsSentiment, redditSentiment, buyingPower, focusSection, analysisDate);

  try {
    const [r1, r2] = await Promise.all([
      client.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: cachedSystem,
        messages: [{ role: 'user', content: makeMsg(entries.slice(0, mid)) }],
        output_config: { format: SCAN_OUTPUT_FORMAT },
      }),
      entries.slice(mid).length > 0
        ? client.messages.create({
            model: ANALYSIS_MODEL,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
            system: cachedSystem,
            messages: [{ role: 'user', content: makeMsg(entries.slice(mid)) }],
            output_config: { format: SCAN_OUTPUT_FORMAT },
          })
        : Promise.resolve(null),
    ]);

    const parse = (msg: Anthropic.Message | null): TradeRecommendation[] => {
      if (!msg) return [];
      try { return (JSON.parse(responseText(msg)) as { setups: TradeRecommendation[] }).setups ?? []; }
      catch { return []; }
    };

    const merged = [...parse(r1), ...parse(r2)];
    const seen = new Set<string>();
    const deduped = merged.filter(r => { if (seen.has(r.ticker)) return false; seen.add(r.ticker); return true; });
    const sorted = deduped.sort((a, b) => b.confidence - a.confidence);

    if (focusDirections.length > 0) return sorted.filter(r => focusDirections.includes(r.direction));
    return sorted;
  } catch (err) {
    console.error('[claude] Scan error:', err);
    return null;
  }
}

// ─── Streaming batch analysis ────────────────────────────────────────────────

export async function analyzeBatchWithClaude(
  batchEntries: [string, Candle[]][],
  weeklyData: Record<string, Candle[]>,
  intradayData: Record<string, Candle[]>,
  premarketData: Record<string, Candle[]>,
  vwapMap: Record<string, number>,
  macroRegime: MacroRegime | null,
  scoredNews: ScoredNewsItem[],
  economicEvents: EconomicEvent[],
  earningsEvents: EarningsEvent[],
  stockTwitsSentiment: SentimentMap,
  redditSentiment: Record<string, RedditSentimentEntry>,
  buyingPower: number | null,
  focusDirections: string[]
): Promise<TradeRecommendation[]> {
  if (!hasAnthropicKey() || batchEntries.length === 0) return [];

  const client = getClient();
  const focusSection = focusDirections.length > 0
    ? `\nSCAN FOCUS (STRICT): Return ONLY setups where direction ∈ {${focusDirections.join(', ')}}. No exceptions.\n`
    : '';

  const userMsg = buildUserMessage(
    batchEntries, weeklyData, intradayData, premarketData, vwapMap,
    macroRegime, scoredNews, economicEvents, earningsEvents,
    stockTwitsSentiment, redditSentiment, buyingPower, focusSection,
    new Date().toISOString().split('T')[0]
  );

  try {
    const msg = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: buildScanPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
      output_config: { format: SCAN_OUTPUT_FORMAT },
    });

    const parsed = (JSON.parse(responseText(msg)) as { setups: TradeRecommendation[] }).setups ?? [];

    if (focusDirections.length > 0) return parsed.filter(r => focusDirections.includes(r.direction));
    return parsed;
  } catch (err) {
    console.error('[claude] Batch scan error:', err);
    return [];
  }
}

// ─── Position monitoring verdict ─────────────────────────────────────────────

function buildPositionPrompt(): string {
  return `You are a professional swing trader managing open positions at a hedge fund. Issue clear, decisive verdicts.

VERDICT DEFINITIONS:
• HOLD — Price action and thesis intact. Original setup playing out. No action needed.
• CAUTION — Something has changed (adverse candle, volume shift, news) threatening the position. Consider tightening stop or reducing size. Monitor closely.
• SELL — Exit now. Stop triggered, thesis broken, or strong reversal against position.

DECISION FRAMEWORK:
LONG positions:
- HOLD: price above entry or at entry with constructive candle, volume declining on pullback, thesis intact
- CAUTION: approaching stop, bearish candle on elevated volume, adverse news, or up >50% of target (consider partial)
- SELL: stop hit, bearish engulfing on high volume, thesis-breaking news, no new high after 2 days

SHORT positions:
- HOLD: price below entry, bounces weak/low volume, trend intact
- CAUTION: approaching stop, bullish reversal candle, unexpected positive news
- SELL: stop hit, bullish engulfing on high volume, strong gap up

PROFIT GUIDANCE:
- Up >75% of target → recommend partial profit (50%) in reasoning
- Held 3+ days without hitting target → evaluate momentum stall

In reasoning, give 2-3 sentences: what you see in price action, why this call, what to watch.`;
}

// ─── Chat types ──────────────────────────────────────────────────────────────

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type NewsAPIArticle = { title: string; source: string; publishedAt: string };
export type NewsAPIResult = { query: string; articles: NewsAPIArticle[] };

export type ChatContext = {
  positions: Position[];
  scanResults: TradeRecommendation[];
  news: NewsItem[];
  prices: Record<string, number>;
  candleSummaries: Record<string, string>;
  tickerNews: Record<string, string[]>;  // ticker → recent headlines
  newsAPIArticles: NewsAPIResult[];
};

// ─── Chat: streaming assistant ────────────────────────────────────────────────

// Stable persona/style block — rendered first so the prompt prefix stays
// byte-identical across requests; live data goes in a second system block.
const CHAT_PERSONA = `You are Stakdx's AI trading assistant — sharp, direct, and data-driven. You help swing traders analyze setups, manage positions, and understand market conditions.

You have live web search available. Use it proactively when asked about recent news, macro events, earnings, tariffs, Fed decisions, or anything that may have happened after your data snapshot was fetched. If the answer isn't clearly in the data, search before responding.

ANALYSIS STANDARDS:
- Anchor every opinion to specific numbers from the data: price levels, % moves, volume, stop/target distances. Vague calls ("looks bullish") are worthless to a trader.
- When asked "should I buy/sell/hold X", structure the answer: current read on the chart, the bull case, the bear case, your lean, and the level that invalidates it.
- Distinguish timeframes explicitly — a swing-trade answer (days) differs from an investment answer (months). Default to the swing-trading lens unless asked otherwise.
- If the user's premise conflicts with the data (e.g. "why is NVDA pumping" when it's down), correct it first.
- Acknowledge uncertainty honestly. Never fabricate prices or news — if data is missing, say so or search for it.

STYLE RULES:
- Be concise and specific. Reference the actual data when relevant.
- NEVER use markdown headers (##, ###), horizontal rules (---), or emojis. Ever. Not even one.
- Use **bold** only for key tickers, numbers, or terms. No decorative bold.
- Use plain label lines to group content (e.g. "Bullish catalysts:" not "### Bullish Catalysts 🟢").
- Use bullet points or numbered lists for multiple items.
- One financial disclaimer max per response, only if truly warranted. Never repeat generic warnings.
- Traders want signal, not noise. Write like a Bloomberg analyst, not a blog post.`;

function buildChatDataSection(ctx: ChatContext): string {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const posSection = ctx.positions.length > 0
    ? `OPEN POSITIONS (${ctx.positions.length}):\n${ctx.positions.map(p => {
        const cur = ctx.prices[p.ticker.toUpperCase()];
        const pnlPct = cur != null
          ? (((cur - p.entryPrice) / p.entryPrice) * 100 * (p.direction === 'short' ? -1 : 1))
          : null;
        return `• ${p.ticker.toUpperCase()} ${p.direction.toUpperCase()} @ $${p.entryPrice.toFixed(2)}` +
          (cur != null ? ` | Now $${cur.toFixed(2)} (${pnlPct! >= 0 ? '+' : ''}${pnlPct!.toFixed(2)}%)` : ' | No live price') +
          (p.stopLoss ? ` | Stop $${p.stopLoss.toFixed(2)}` : '') +
          (p.target ? ` | Target $${p.target.toFixed(2)}` : '');
      }).join('\n')}`
    : 'OPEN POSITIONS: None.';

  const scanSection = ctx.scanResults.length > 0
    ? `LATEST SCAN (${ctx.scanResults.length} setups):\n${ctx.scanResults.slice(0, 15).map(r =>
        `• ${r.ticker} ${r.direction} ${r.confidence}% conf — Entry ${r.entryZone} | Stop ${r.stopLoss} | Target ${r.target} | ${r.pattern}`
      ).join('\n')}`
    : 'LATEST SCAN: No scan run yet.';

  const newsSection = ctx.news.length > 0
    ? `MARKET NEWS (last 24h):\n${ctx.news.slice(0, 10).map(n => `• ${n.headline}`).join('\n')}`
    : 'MARKET NEWS: None available.';

  const tickerNewsSection = ctx.tickerNews && Object.keys(ctx.tickerNews).length > 0
    ? `COMPANY NEWS (last 72h, your positions):\n${
        Object.entries(ctx.tickerNews)
          .map(([ticker, headlines]) => `${ticker}: ${headlines.slice(0, 3).join(' | ')}`)
          .join('\n')
      }`
    : '';

  const newsAPISection = ctx.newsAPIArticles && ctx.newsAPIArticles.length > 0
    ? `BROADER NEWS (NewsAPI.org — 80k sources, 7-day lookback):\n${
        ctx.newsAPIArticles.map(r =>
          `[${r.query}]:\n${r.articles.slice(0, 3).map(a => `  • ${a.title} — ${a.source} (${a.publishedAt.slice(0, 10)})`).join('\n')}`
        ).join('\n')
      }`
    : '';

  const candleEntries = Object.entries(ctx.candleSummaries);
  const marketTickers = ['SPY', 'QQQ', 'SOXX', 'SMH', 'VGT'];
  const marketCandles = candleEntries.filter(([t]) => marketTickers.includes(t));
  const positionCandles = candleEntries.filter(([t]) => !marketTickers.includes(t));

  const candleSection = candleEntries.length > 0
    ? [
        marketCandles.length > 0
          ? `MARKET / SECTOR (5-day daily candles):\n${marketCandles.map(([, s]) => s).join('\n')}`
          : '',
        positionCandles.length > 0
          ? `POSITION TICKERS (5-day daily candles):\n${positionCandles.map(([, s]) => s).join('\n')}`
          : '',
      ].filter(Boolean).join('\n\n')
    : '';

  return `Today is ${today}. The user's live data:

${posSection}

${scanSection}

${newsSection}

${tickerNewsSection}

${newsAPISection}

${candleSection}`;
}

export async function* streamChat(
  messages: ChatMessage[],
  ctx: ChatContext
): AsyncGenerator<string> {
  if (!hasAnthropicKey()) {
    yield "I'm running in demo mode — add your ANTHROPIC_API_KEY to enable live AI chat.";
    return;
  }

  const client = getClient();

  // System prompt as two blocks: frozen persona first (stable prefix), live data second.
  const systemBlocks = [
    { type: 'text' as const, text: CHAT_PERSONA, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: buildChatDataSection(ctx) },
  ];

  // Keep only the last 12 messages (6 turns) to cap context growth in long sessions.
  const recentMessages = messages.slice(-12);
  const currentMessages: Anthropic.MessageParam[] = recentMessages.map(m => ({ role: m.role, content: m.content }));

  // Web search runs server-side: the API executes searches itself and pauses with
  // stop_reason "pause_turn" if it hits the server-side iteration limit — re-send
  // the assistant turn to resume. The final text is yielded once complete.
  for (let iter = 0; iter < 5; iter++) {
    const response = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: systemBlocks,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 } as any],
      messages: currentMessages,
    });

    if (response.stop_reason === 'pause_turn') {
      currentMessages.push({ role: 'assistant', content: response.content });
      continue;
    }

    let yielded = false;
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        yield block.text;
        yielded = true;
      }
    }
    if (!yielded) yield "I couldn't complete my response. Please try again.";
    return;
  }

  yield "I searched the web but couldn't complete my response. Please try again.";
}

export async function analyzePositionWithClaude(
  position: Position,
  candles: Candle[],
  news: NewsItem[]
): Promise<PositionUpdate | null> {
  if (!hasAnthropicKey()) return null;

  const client = getClient();
  const latestCandle = candles[candles.length - 1];
  const currentPrice = latestCandle?.c ?? 0;
  const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : latestCandle;
  const priceChange = prevCandle.c > 0
    ? (((currentPrice - prevCandle.c) / prevCandle.c) * 100)
    : 0;
  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice * 100 *
    (position.direction === 'short' ? -1 : 1)).toFixed(2);

  const stopLine = position.stopLoss != null ? `Stop loss: $${position.stopLoss.toFixed(2)}` : '';
  const targetLine = position.target != null ? `Target: $${position.target.toFixed(2)}` : '';

  const userMessage = `OPEN POSITION:
Ticker: ${position.ticker}
Direction: ${position.direction.toUpperCase()}
Entry price: $${position.entryPrice.toFixed(2)}
Current price: $${currentPrice.toFixed(2)}
Unrealized P&L: ${pnlPct}%
Time held: since ${position.entryTime}
${stopLine}
${targetLine}

RECENT CANDLES:
${summarizeCandles(position.ticker, candles)}

RECENT NEWS:
${news.slice(0, 5).map(n => `• ${n.headline} (${n.source})`).join('\n') || 'No recent news'}

Evaluate this position and return your verdict as JSON.`;

  try {
    const msg = await client.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: buildPositionPrompt(),
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: POSITION_OUTPUT_FORMAT },
    });

    const parsed = JSON.parse(responseText(msg)) as PositionUpdate;

    if (parsed.priceChange && !parsed.priceChange.startsWith('+') && !parsed.priceChange.startsWith('-')) {
      parsed.priceChange = (priceChange >= 0 ? '+' : '') + priceChange.toFixed(2) + '%';
    }

    return parsed;
  } catch (err) {
    console.error('[claude] Position update error:', err);
    return null;
  }
}
