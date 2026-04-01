import Anthropic from '@anthropic-ai/sdk';
import { Candle, TradeRecommendation, NewsItem, PositionUpdate, Position } from './types';
import { summarizeCandles } from './alpaca';

function buildScanPrompt(buyingPower: number | null): string {
  const hasBP = buyingPower && buyingPower > 0;
  const maxRiskPerTrade = hasBP ? (buyingPower! * 0.02).toFixed(2) : null;

  return `You are an expert swing trader with 20 years of experience. Analyze the provided stock data and identify the top swing trade candidates for a 1-3 day hold.

${hasBP ? `BUYING POWER: The trader has $${buyingPower!.toLocaleString()} available. Risk no more than 2% per trade (max $${maxRiskPerTrade} loss per trade). Size positions so the stop loss distance does not exceed this max risk. Prioritize the highest conviction setups that fit within this budget.` : ''}

For each candidate consider:
- Candlestick patterns (engulfing, doji, hammer, shooting star, morning/evening star)
- Trend direction and momentum implied by price action
- Volume vs average (high volume confirms moves)
- Proximity to key support/resistance levels
- News catalysts from provided headlines
- Trade type: LONG (buy stock), SHORT (sell short), CALL (buy call option for bullish momentum), PUT (buy put option for bearish momentum)

For CALL and PUT options, base the recommendation on strong directional conviction in the underlying stock. Options are preferable when: implied move is large, buying power is limited, or the setup has very high confidence (75+).

Return ONLY a valid JSON array, no markdown, no explanation outside the JSON. Each object must have:
- ticker (string)
- direction ('LONG', 'SHORT', 'CALL', or 'PUT')
- confidence (number 1-100)
- entryZone (string e.g. '$182.50 - $183.00')
- stopLoss (string)
- target (string)
- timeframe (string)
- rationale (string, 2-3 sentences max)
- pattern (string, the key candlestick or chart pattern identified)
- positionSize (string, e.g. '${hasBP ? '45 shares' : 'size to 2% risk'}' for stocks or '2 contracts' for options${hasBP ? ` — calculated so max loss equals ~$${maxRiskPerTrade}` : ''})
- maxRisk (string, e.g. '$180.00' — the dollar amount at risk if stop is hit)
- potentialGain (string, e.g. '$450.00' — the dollar gain if target is reached based on position size)`;
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

  // Compress candle data into compact summaries (much fewer tokens than raw JSON)
  const stockSummaries = Object.entries(candleData)
    .map(([ticker, candles]) => summarizeCandles(ticker, candles))
    .join('\n');

  // Deduplicate and combine news
  const allNews = [...news, ...marketNews]
    .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
    .slice(0, 25)
    .map((n) => `[${n.symbols.join(',')}] ${n.headline} (${n.source})`);

  const dataPayload = {
    analysisDate: new Date().toISOString().split('T')[0],
    stockCount: Object.keys(candleData).length,
    ...(buyingPower ? { buyingPower } : {}),
    stockSummaries: stockSummaries,
    news: allNews,
  };

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: buildScanPrompt(buyingPower),
      messages: [
        {
          role: 'user',
          content: `Analyze these stocks and return your swing trade recommendations as a JSON array:\n\n${JSON.stringify(dataPayload, null, 2)}`,
        },
      ],
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

  const dataPayload = {
    position: {
      ticker: position.ticker,
      direction: position.direction,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      currentPrice,
      unrealizedPnlPct: (((currentPrice - position.entryPrice) / position.entryPrice) * 100 * (position.direction === 'short' ? -1 : 1)).toFixed(2) + '%',
    },
    recentCandles: candles,
    recentNews: news.slice(0, 5).map((n) => ({ headline: n.headline, source: n.source })),
    analysisDate: new Date().toISOString().split('T')[0],
  };

  const positionSystemPrompt = `You are an expert swing trader with 20 years of experience managing open positions. Given an existing position and fresh price data, determine whether to HOLD, SELL, or issue a CAUTION. Return ONLY valid JSON with exactly these fields: verdict ('HOLD', 'SELL', or 'CAUTION'), reasoning (string, 2-3 sentences explaining the decision), currentPrice (string formatted as '$XXX.XX'), priceChange (string formatted as '+/-X.XX%'). No markdown, no extra text.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: positionSystemPrompt,
      messages: [
        {
          role: 'user',
          content: `Evaluate this open position and advise:\n\n${JSON.stringify(dataPayload, null, 2)}`,
        },
      ],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as PositionUpdate;
    return parsed;
  } catch (err) {
    console.error('Claude position update error:', err);
    return null;
  }
}
