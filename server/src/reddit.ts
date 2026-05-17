import axios from 'axios';
import { RedditSentimentEntry } from './types';

// Common words that look like tickers but are not — filter these out
const NOISE_TOKENS = new Set([
  'A', 'I', 'AM', 'BE', 'DO', 'GO', 'IN', 'IS', 'IT', 'MY', 'NO', 'OF', 'ON',
  'OR', 'SO', 'TO', 'UP', 'WE', 'AT', 'BY', 'DD', 'DM', 'EV', 'FD', 'FUD',
  'GDP', 'IMO', 'IPO', 'IRA', 'LOL', 'NEW', 'NOW', 'OTC', 'PDF', 'PE', 'PM',
  'SP', 'THE', 'US', 'WSB', 'YOY', 'AI', 'CEO', 'CFO', 'CTO', 'SEC', 'FTC',
  'IRS', 'GDP', 'CPI', 'ETF', 'ATH', 'ALL', 'FOR', 'NOT', 'AND', 'BUT', 'YTD',
  'EPS', 'MOD', 'TOS', 'OPM', 'APR', 'MAY', 'JAN', 'FEB', 'MAR', 'JUN', 'JUL',
  'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'EST', 'PST', 'CST', 'UTC', 'HQ',
]);

const BULLISH_KEYWORDS = [
  'calls', 'call', 'buy', 'buying', 'bought', 'long', 'bull', 'bullish',
  'moon', 'mooning', 'breakout', 'squeeze', 'yolo', 'rip', 'pump', 'green',
  'rocket', 'gains', 'upside', 'strong', 'hold', 'holding', 'hodl', 'accumulate',
];

const BEARISH_KEYWORDS = [
  'puts', 'put', 'sell', 'selling', 'sold', 'short', 'shorting', 'bear', 'bearish',
  'crash', 'dump', 'dumping', 'drop', 'red', 'overvalued', 'bubble', 'fade',
  'downside', 'weak', 'tank', 'tanking', 'collapse', 'avoid', 'exit',
];

const TICKER_REGEX = /\b([A-Z]{1,5})\b/g;

interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
}

async function fetchSubredditPosts(subreddit: string, limit = 50): Promise<RedditPost[]> {
  try {
    const res = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json`,
      {
        params: { limit },
        headers: {
          'User-Agent': 'Stakd/1.0 (trading dashboard)',
        },
        timeout: 6000,
      }
    );
    return (res.data?.data?.children ?? []).map(
      (child: { data: RedditPost }) => child.data
    );
  } catch {
    return [];
  }
}

export async function fetchRedditSentiment(
  tickers: string[]
): Promise<Record<string, RedditSentimentEntry>> {
  const tickerSet = new Set(tickers);

  // Fetch WSB + r/stocks in parallel
  const [wsbPosts, stocksPosts] = await Promise.all([
    fetchSubredditPosts('wallstreetbets', 50),
    fetchSubredditPosts('stocks', 25),
  ]);

  const allPosts = [...wsbPosts, ...stocksPosts];

  // Per-ticker accumulators
  const acc: Record<string, {
    bullish: number;
    bearish: number;
    mentions: number;
    topPost: string;
    topScore: number;
  }> = {};

  for (const post of allPosts) {
    const text = `${post.title} ${post.selftext ?? ''}`;
    const textLower = text.toLowerCase();
    const matches = text.match(TICKER_REGEX) ?? [];

    const seenInPost = new Set<string>();
    for (const match of matches) {
      if (!tickerSet.has(match)) continue;
      if (NOISE_TOKENS.has(match)) continue;
      if (seenInPost.has(match)) continue;
      seenInPost.add(match);

      if (!acc[match]) {
        acc[match] = { bullish: 0, bearish: 0, mentions: 0, topPost: '', topScore: -1 };
      }

      acc[match].mentions++;

      // Track highest-engagement post mentioning this ticker
      const postScore = (post.score ?? 0) + (post.num_comments ?? 0) * 5;
      if (postScore > acc[match].topScore) {
        acc[match].topScore = postScore;
        acc[match].topPost = post.title.slice(0, 120);
      }

      const bullHits = BULLISH_KEYWORDS.filter(w => textLower.includes(w)).length;
      const bearHits = BEARISH_KEYWORDS.filter(w => textLower.includes(w)).length;

      if (bullHits > bearHits) acc[match].bullish++;
      else if (bearHits > bullHits) acc[match].bearish++;
    }
  }

  const result: Record<string, RedditSentimentEntry> = {};

  for (const [ticker, data] of Object.entries(acc)) {
    const total = data.bullish + data.bearish;
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (total >= 2) {
      const bullPct = data.bullish / total;
      if (bullPct >= 0.6) sentiment = 'bullish';
      else if (bullPct <= 0.4) sentiment = 'bearish';
    }
    result[ticker] = {
      ticker,
      mentions: data.mentions,
      sentiment,
      topPost: data.topPost,
    };
  }

  return result;
}
