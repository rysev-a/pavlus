export interface Article {
  id: string;
  title: string;
  snippet: string;
  tag: string;
  /** Words that also find the article. */
  keywords: string;
}

export interface Suggestion {
  id: string;
  title: string;
  snippet: string;
  tag: string;
  /** `3 matches`. */
  hits: string;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/** Pure: how many of the query's words appear in an article (title counts double). */
export function scoreOf(article: Article, query: string): number {
  const title = article.title.toLowerCase();
  const rest =
    `${article.snippet} ${article.keywords} ${article.tag}`.toLowerCase();
  return words(query).reduce(
    (sum, w) => sum + (title.includes(w) ? 2 : 0) + (rest.includes(w) ? 1 : 0),
    0,
  );
}

/** Pure: the best articles for a search text, best first (nothing for an empty query). */
export function suggest(
  articles: Article[],
  query: string,
  limit = 4,
): Suggestion[] {
  if (words(query).length === 0) return [];
  return articles
    .map((a) => ({ a, score: scoreOf(a, query) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(({ a, score }) => ({
      id: a.id,
      title: a.title,
      snippet: a.snippet,
      tag: a.tag,
      hits: score === 1 ? "1 match" : `${score} matches`,
    }));
}
