import axios from 'axios';

export type NewsAPIArticle = {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
};

export type NewsAPIResult = {
  query: string;
  articles: NewsAPIArticle[];
};

// 30-minute in-memory cache keyed by query string
const cache = new Map<string, { articles: NewsAPIArticle[]; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

// Source-name substrings that signal market/financial reporting (boosted) vs
// consumer-gadget/gaming blogs that flood a relevancy search but are noise to a
// trader (downranked). Matched case-insensitively against the NewsAPI source name.
const FINANCIAL_SOURCE_HINTS = [
  'bloomberg', 'reuters', 'cnbc', 'wall street journal', 'wsj', 'marketwatch',
  'barron', 'financial times', 'investor', 'seeking alpha', 'motley fool',
  'benzinga', 'yahoo finance', 'business insider', 'forbes', 'investing.com',
  'thestreet', 'morningstar', 'zacks', 'fortune', 'economist', 'axios',
  'nasdaq', 'kiplinger', 'finance', 'market',
];
const LOW_RELEVANCE_SOURCE_HINTS = [
  'kotaku', 'hackaday', 'boing boing', 'polygon', 'engadget', 'the verge',
  'gizmodo', 'techradar', 'pcgamer', 'pc gamer', 'android police', '9to5',
  'gamespot', 'ign', 'digital trends', 'makeuseof', 'lifehacker', 'mashable',
  'cnet', 'tom\'s hardware', 'boingboing',
];

// Title words that signal market/trading relevance regardless of source — so a
// relevant headline from a non-financial outlet still surfaces, and a gadget
// review from one stays down.
const MARKET_KEYWORD_RE = /\b(earnings|revenue|guidance|share[s]?|stock[s]?|analyst|price target|upgrade[d]?|downgrade[d]?|valuation|market cap|ipo|dividend|forecast|profit|sales|demand|supply|pricing|shipments|outlook|quarter|sec filing|buyback|acquisition|merger|rate cut|fed)\b/i;

// Re-rank a relevancy search for the trading use case: financial sources, market
// keywords, and recent articles first; stale gadget-blog noise last. A soft score
// (not a hard filter) so genuinely relevant non-financial coverage can still surface.
function rankForTrading(articles: NewsAPIArticle[], now = Date.now()): NewsAPIArticle[] {
  return articles
    .map((a) => {
      const src = a.source.toLowerCase();
      let score = 0;
      if (FINANCIAL_SOURCE_HINTS.some((h) => src.includes(h))) score += 10;
      if (LOW_RELEVANCE_SOURCE_HINTS.some((h) => src.includes(h))) score -= 6;
      if (MARKET_KEYWORD_RE.test(a.title)) score += 4;

      const ageH = (now - Date.parse(a.publishedAt)) / 3_600_000;
      if (!Number.isNaN(ageH)) {
        if (ageH <= 48) score += 5;
        else if (ageH <= 168) score += 2;       // ≤ 7d
        else if (ageH > 336) score -= 4;          // > 14d — stale for a market feed
      }
      return { a, score, ageH: Number.isNaN(ageH) ? Infinity : ageH };
    })
    .sort((x, y) => y.score - x.score || x.ageH - y.ageH)
    .map((x) => x.a);
}

function hasNewsAPIKey(): boolean {
  return !!(process.env.NEWSAPI_KEY && process.env.NEWSAPI_KEY !== 'your_newsapi_key_here');
}

export async function searchNews(
  query: string,
  pageSize = 5,
  sortBy: 'publishedAt' | 'relevancy' | 'popularity' = 'publishedAt'
): Promise<NewsAPIArticle[]> {
  if (!hasNewsAPIKey()) return [];

  const cacheKey = `${query}|${sortBy}|${pageSize}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.articles;
  }

  try {
    const { data } = await axios.get<{
      status: string;
      articles: Array<{ title: string; source: { name: string }; publishedAt: string; url: string }>;
    }>('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        pageSize,
        sortBy,
        language: 'en',
        apiKey: process.env.NEWSAPI_KEY,
      },
    });

    if (data.status !== 'ok' || !Array.isArray(data.articles)) return [];

    const mapped: NewsAPIArticle[] = data.articles.map(a => ({
      title: a.title,
      source: a.source?.name ?? 'Unknown',
      publishedAt: a.publishedAt,
      url: a.url ?? '',
    }));

    // Relevancy is the free-form news-search path; re-rank it for traders.
    // Date/popularity sorts (fixed macro + ticker feeds) are left as-is.
    const articles = sortBy === 'relevancy' ? rankForTrading(mapped) : mapped;

    cache.set(cacheKey, { articles, fetchedAt: Date.now() });
    return articles;
  } catch (err) {
    console.error(`[newsapi] Error for query "${query}":`, err);
    return [];
  }
}
