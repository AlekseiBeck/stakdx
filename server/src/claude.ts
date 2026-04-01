import Anthropic from '@anthropic-ai/sdk';
import { Candle, TradeRecommendation, NewsItem, PositionUpdate, Position } from './types';
import { summarizeCandles } from './alpaca';

function buildScanPrompt(buyingPower: number | null): string {
  const hasBP = buyingPower && buyingPower > 0;
  const maxRiskPerTrade = hasBP ? (buyingPower! * 0.02).toFixed(2) : null;

  const buyingPowerSection = hasBP
    ? `
BUYING POWER & POSITION SIZING:
- Available capital: $${buyingPower!.toLocaleString()}
- Max risk per trade: 2% = $${maxRiskPerTrade} (this is the MAXIMUM loss if stopped out)
- Position size formula for stocks: shares = $${maxRiskPerTrade} / (entry price - stop loss price)
- Position size formula for options: contracts = $${maxRiskPerTrade} / (option premium × 100)
- Prioritize the highest-conviction setups — if buying power is limited, fewer better trades beats more mediocre ones
- Include exact share/contract counts in positionSize field
- Calculate maxRisk and potentialGain in exact dollar amounts based on position size`
    : `
POSITION SIZING: No buying power specified. Use "size to 2% account risk" as positionSize. Estimate maxRisk and potentialGain as relative to a standard position.`;

  return `You are a professional swing trader with 20+ years of experience at a top-tier hedge fund. You specialize in 1-3 day momentum trades using technical analysis, volume analysis, and news catalysts. You are disciplined, precise, and only recommend trades with genuine edge.

CORE PHILOSOPHY: Quality over quantity. Return ONLY setups you would personally trade with real capital. It is far better to return 3 exceptional setups than 10 mediocre ones. If fewer than 3 truly qualify, return only those that do.
${buyingPowerSection}

━━━ DATA FORMAT ━━━
Each stock entry contains 5 daily candles: DATE O[open] H[high] L[low] C[close] V[millions]
Followed by: % change on latest day, candle body as % of total range (higher = stronger conviction candle), and volume ratio vs recent average (>1.3x is meaningful, >2x is significant).

━━━ TECHNICAL ANALYSIS FRAMEWORK ━━━

BULLISH PATTERNS (LONG / CALL):
• Bullish Engulfing — current green candle body fully engulfs prior red candle body. Best at support. Requires vol ≥1.3x avg.
• Hammer / Pin Bar — lower wick ≥2x body size, closes near high, at support level. Signals rejection of lower prices.
• Morning Star — 3-candle: bearish candle → small indecision candle → bullish candle closing >50% into first candle's body.
• Inside Bar Breakout — current candle contained within prior candle's range. Breakout direction = next move.
• EMA/Support Bounce — price dips to and bounces from a key moving average or prior support with bullish candle + volume.
• Cup and Handle / Base Breakout — multi-day consolidation followed by a volume-confirmed break above resistance.

BEARISH PATTERNS (SHORT / PUT):
• Bearish Engulfing — current red candle body fully engulfs prior green candle body at resistance. Requires vol ≥1.3x avg.
• Shooting Star / Gravestone Doji — upper wick ≥2x body, closes near low, at resistance. Signals rejection of higher prices.
• Evening Star — opposite of morning star. 3-candle reversal at highs.
• Distribution Day — high-volume down day near recent highs, suggesting institutional selling.
• Resistance Failure — price tests a prior high/resistance multiple times but fails to close above it.

━━━ MANDATORY QUALITY FILTERS ━━━
Reject any setup that fails these — do not include it in output:
1. Risk/Reward ≥ 2:1 — target distance must be at least 2× the stop distance. No exceptions.
2. Volume confirmation — signal candle must have volume ≥ average. Low-volume breakouts are traps.
3. Trend alignment — trade direction must match the 3-5 day trend OR there must be a clear reversal pattern. Do not fade strong trends without a reversal signal.
4. No overextension — do not recommend LONG on stocks >12% above nearest support, or SHORT on stocks >12% below nearest resistance.
5. Sector diversity — do not recommend more than 3 stocks from the same sector in one scan.
6. Confidence floor — minimum confidence of 58. Do not include anything below this threshold.

━━━ CONFIDENCE SCORING RUBRIC ━━━
Score based on how many signals align:
• 88-100: Pattern + high-volume confirmation + news catalyst + trend alignment + clean S/R level. Rare. High conviction.
• 75-87: Pattern + volume + either news OR trend alignment. Strong setup.
• 65-74: Clear pattern + average or better volume. Decent setup, size conservatively.
• 58-64: Pattern present but 1-2 confirming factors weak or absent. Only include if no better options exist.
• Below 58: EXCLUDE from output entirely.

Adjustments:
• News directly supports trade direction: +8 to +12 confidence
• News contradicts trade direction: −15 confidence (note the conflict in rationale)
• Macro/political news (Fed hawkish, tariffs, geopolitical tension): apply bearish bias across all, reduce long confidence −5
• Macro news bullish (rate cuts, stimulus, strong GDP): apply bullish bias, reduce short confidence −5
• SPY/QQQ candles show clear 3-5 day downtrend: reduce all long confidence −8, increase short confidence +8
• SPY/QQQ candles show clear 3-5 day uptrend: reduce all short confidence −8, increase long confidence +8

━━━ OPTIONS vs STOCK GUIDANCE ━━━
Use CALL or PUT when:
• Confidence ≥ 75 AND setup suggests a sharp, fast move (not a slow grind)
• The underlying stock shows a high-conviction reversal or breakout pattern
• Buying power is limited (options provide leverage with defined risk)
• A catalyst (earnings reaction, FDA, macro event) is driving the move

Use LONG or SHORT when:
• Setup is a steady momentum trade expected to grind in one direction
• Confidence is 58-74 (lower conviction = defined stock risk better than options decay)
• The stock is lower-priced and options premiums are unfavorable

━━━ MARKET REGIME & MACRO CONTEXT ━━━
• Use SPY and QQQ candle data to read overall market health before picking individual stocks
• In confirmed downtrend (SPY red multiple days, vol increasing): heavily favor shorts/puts, flag longs as counter-trend
• In confirmed uptrend: heavily favor longs/calls
• In choppy/sideways market: reduce all confidence scores by 5, prefer tighter timeframes (1-2 days)
• Political/regulatory headlines (tariffs, antitrust, FDA): apply sector-specific impact before scoring

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON array. No markdown, no text before or after the array. Each object must contain exactly these fields:
{
  "ticker": string,
  "direction": "LONG" | "SHORT" | "CALL" | "PUT",
  "confidence": number (58-100),
  "entryZone": string (e.g. "$182.50 - $183.00" — tight range near current price or breakout level),
  "stopLoss": string (e.g. "$178.20" — technical invalidation level, not arbitrary),
  "target": string (e.g. "$191.00" — next key resistance/support, must give ≥2:1 R/R),
  "timeframe": string (e.g. "1-2 days"),
  "rationale": string (2-3 sentences: name the pattern, cite the confirming signals, explain why this entry point specifically),
  "pattern": string (specific pattern name, e.g. "Bullish Engulfing at 50-day Support"),
  "positionSize": string (share count or contract count with calculation basis),
  "maxRisk": string (dollar amount at risk if stopped out),
  "potentialGain": string (dollar gain if target hit, based on position size)
}`;
}

function buildPositionPrompt(): string {
  return `You are a professional swing trader managing open positions at a hedge fund. Your job is to monitor active trades and issue clear, decisive verdicts.

VERDICT DEFINITIONS:
• HOLD — Price action and thesis remain intact. The original setup is playing out as expected. No action needed.
• CAUTION — Something has changed (adverse candle, volume shift, news) that threatens the position. Consider tightening stop or reducing size but do not fully exit yet. Monitor closely.
• SELL — Exit the position now. Either the stop has been triggered, the thesis is broken, or a strong reversal signal has emerged against the position.

DECISION FRAMEWORK:
For LONG positions:
- HOLD if: price is above entry or at entry with constructive candle, volume declining on any pullback, thesis intact
- CAUTION if: price approaching stop, bearish candle on elevated volume, adverse news, or position up >50% of target (consider partial profit)
- SELL if: stop hit, bearish engulfing on high volume, thesis-breaking news, or price failed to make new high after 2 days

For SHORT positions:
- HOLD if: price is below entry, any bounces are weak/low volume, trend intact
- CAUTION if: price approaching stop, bullish reversal candle, unexpected positive news
- SELL if: stop hit, bullish engulfing on high volume, or strong gap up

PROFIT-TAKING GUIDANCE:
- If position is up >75% of the distance to target: consider recommending partial profit (50%) in rationale
- If position has been held 3+ days without hitting target: evaluate whether momentum is stalling

Return ONLY valid JSON with exactly these fields, no markdown:
{
  "verdict": "HOLD" | "SELL" | "CAUTION",
  "reasoning": string (2-3 sentences: what you see in the price action, why you made this call, what to watch for),
  "currentPrice": string (formatted as "$XXX.XX"),
  "priceChange": string (formatted as "+X.XX%" or "-X.XX%")
}`;
}

function hasAnthropicKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here');
}

export async function analyzeCandlesWithClaude(
  candleData: Record<string, Candle[]>,
  news: NewsItem[],
  marketNews: NewsItem[],
  buyingPower: number | null = null
): Promise<TradeRecommendation[] | null> {
  if (!hasAnthropicKey()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stockSummaries = Object.entries(candleData)
    .map(([ticker, candles]) => summarizeCandles(ticker, candles))
    .join('\n');

  const allNews = [...news, ...marketNews]
    .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
    .slice(0, 25)
    .map((n) => {
      const tickers = n.symbols.length ? `[${n.symbols.join(',')}]` : '[MARKET]';
      return `${tickers} ${n.headline} — ${n.summary?.slice(0, 120) ?? ''} (${n.source})`;
    });

  const userMessage = `Analysis date: ${new Date().toISOString().split('T')[0]}
Stocks to analyze: ${Object.keys(candleData).length}
${buyingPower ? `Buying power: $${buyingPower.toLocaleString()}` : ''}

STOCK CANDLE DATA (5 days each):
${stockSummaries}

RECENT NEWS (ticker-specific + broad market):
${allNews.join('\n')}

Analyze the above data and return your swing trade recommendations as a JSON array.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: buildScanPrompt(buyingPower),
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as TradeRecommendation[];
    return parsed;
  } catch (err) {
    console.error('Claude scan error:', err);
    return null;
  }
}

export async function analyzePositionWithClaude(
  position: Position,
  candles: Candle[],
  news: NewsItem[]
): Promise<PositionUpdate | null> {
  if (!hasAnthropicKey()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const latestCandle = candles[candles.length - 1];
  const currentPrice = latestCandle?.c ?? 0;
  const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : latestCandle;
  const priceChange = prevCandle.c > 0
    ? (((currentPrice - prevCandle.c) / prevCandle.c) * 100)
    : 0;
  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice * 100 *
    (position.direction === 'short' ? -1 : 1)).toFixed(2);

  const candleSummary = summarizeCandles(position.ticker, candles);
  const newsHeadlines = news.slice(0, 5).map(n => `• ${n.headline} (${n.source})`).join('\n');

  const userMessage = `OPEN POSITION:
Ticker: ${position.ticker}
Direction: ${position.direction.toUpperCase()}
Entry price: $${position.entryPrice.toFixed(2)}
Current price: $${currentPrice.toFixed(2)}
Unrealized P&L: ${pnlPct}%
Time held: since ${position.entryTime}

RECENT CANDLES:
${candleSummary}

RECENT NEWS:
${newsHeadlines || 'No recent news'}

Evaluate this position and return your verdict as JSON.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildPositionPrompt(),
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as PositionUpdate;

    // Ensure priceChange is formatted correctly if Claude omitted the sign
    if (parsed.priceChange && !parsed.priceChange.startsWith('+') && !parsed.priceChange.startsWith('-')) {
      parsed.priceChange = (priceChange >= 0 ? '+' : '') + priceChange.toFixed(2) + '%';
    }

    return parsed;
  } catch (err) {
    console.error('Claude position update error:', err);
    return null;
  }
}
