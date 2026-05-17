import axios from 'axios';

export type NewsAPIArticle = {
  title: string;
  source: string;
  publishedAt: string;
};

export type NewsAPIResult = {
  query: string;
  articles: NewsAPIArticle[];
};

// 30-minute in-memory cache keyed by query string
const cache = new Map<string, { articles: NewsAPIArticle[]; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function hasNewsAPIKey(): boolean {
  return !!(process.env.NEWSAPI_KEY && process.env.NEWSAPI_KEY !== 'your_newsapi_key_here');
}

export async function searchNews(query: string, pageSize = 5): Promise<NewsAPIArticle[]> {
  if (!hasNewsAPIKey()) return [];

  const cached = cache.get(query);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.articles;
  }

  try {
    const { data } = await axios.get<{
      status: string;
      articles: Array<{ title: string; source: { name: string }; publishedAt: string }>;
    }>('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        pageSize,
        sortBy: 'publishedAt',
        language: 'en',
        apiKey: process.env.NEWSAPI_KEY,
      },
    });

    if (data.status !== 'ok' || !Array.isArray(data.articles)) return [];

    const articles: NewsAPIArticle[] = data.articles.map(a => ({
      title: a.title,
      source: a.source?.name ?? 'Unknown',
      publishedAt: a.publishedAt,
    }));

    cache.set(query, { articles, fetchedAt: Date.now() });
    return articles;
  } catch (err) {
    console.error(`[newsapi] Error for query "${query}":`, err);
    return [];
  }
}
