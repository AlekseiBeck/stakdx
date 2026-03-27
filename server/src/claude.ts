import Anthropic from '@anthropic-ai/sdk';
import { Candle, TradeRecommendation, NewsItem, PositionUpdate, Position } from './types';

const SYSTEM_PROMPT = `You are an expert swing trader with 20 years of experience. Analyze the provided stock data and identify the top swing trade candidates for a 1-3 day hold. For each candidate consider: candlestick patterns (engulfing, doji, hammer, shooting star), trend direction, volume vs average, proximity to key levels, momentum indicators implied by price action, and any news catalysts. Return ONLY a valid JSON array, no markdown, no explanation outside the JSON. Each object must have: ticker (string), direction ('LONG' or 'SHORT'), confidence (number 1-100), entryZone (string e.g. '$182.50 - $183.00'), stopLoss (string), target (string), timeframe (string), rationale (string, 2-3 sentences max), pattern (string, the key candlestick or chart pattern identified).`;

function hasAnthropicKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here');
}

export async function analyzeCandlesWithClaude(
  candleData: Record<string, Candle[]>,
  news: NewsItem[]
): Promise<TradeRecommendation[] | null> {
  if (!hasAnthropicKey()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const dataPayload = {
    stockData: candleData,
    recentNews: news.slice(0, 10).map((n) => ({
      headline: n.headline,
      symbols: n.symbols,
      source: n.source,
    })),
    analysisDate: new Date().toISOString().split('T')[0],
  };

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Analyze these stocks and return your swing trade recommendations as a JSON array:\n\n${JSON.stringify(dataPayload, null, 2)}`,
        },
      ],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    // Strip any accidental markdown fences
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
  const priceChange = latestCandle
    ? (((latestCandle.c - latestCandle.o) / latestCandle.o) * 100).toFixed(2)
    : '0.00';

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
