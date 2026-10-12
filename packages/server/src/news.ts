import { cachedFetch as fetch } from "./fetch.ts";
import Parser from "rss-parser";

import type { NewsArticle } from "../../core/src/integrations.ts";
export type { NewsArticle } from "../../core/src/integrations.ts";

const FEEDS = [
  {
    url: "https://feeds.marketwatch.com/marketwatch/topstories",
    id: "marketwatch",
    source: "MarketWatch",
    category: "markets" as const,
  },
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    id: "coindesk",
    source: "CoinDesk",
    category: "crypto" as const,
  },
  {
    url: "https://cointelegraph.com/rss",
    id: "cointelegraph",
    source: "CoinTelegraph",
    category: "crypto" as const,
  },
  {
    url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
    id: "yahoo",
    source: "Yahoo Finance",
    category: "markets" as const,
  },
  {
    url: "https://www.theverge.com/rss/index.xml",
    id: "verge",
    source: "The Verge",
    category: "general" as const,
  },
];

const parser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["dc:creator", "creator"],
    ],
  },
});

export async function getArticles(
  sourceIds?: string[],
): Promise<NewsArticle[]> {
  const settled = await Promise.allSettled(
    FEEDS.filter((feed) => !sourceIds || sourceIds.includes(feed.id)).map(
      async (feed) => {
        const response = await fetch(feed.url, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error("Feed unavailable");
        const xml = await response.text();
        if (xml.length > 2_000_000) throw new Error("Feed too large");
        const parsed = await parser.parseString(xml);
        return parsed.items.slice(0, 12).map((item) => ({
          title: item.title ?? "",
          link: item.link ?? "",
          description: (item.contentSnippet ?? item.content ?? "")
            .replace(/<[^>]*>/g, "")
            .slice(0, 200),
          pubDate: item.pubDate ?? item.isoDate ?? "",
          source: feed.source,
          category: feed.category,
        }));
      },
    ),
  );

  const articles: NewsArticle[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") articles.push(...result.value);
  }
  articles.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });
  return articles.slice(0, 60);
}

export async function GET(request?: Request) {
  const selected = request
    ? new URL(request.url).searchParams.get("sources")
    : null;
  const articles = await getArticles(
    selected === null ? undefined : selected.split(","),
  );
  return Response.json(
    { articles },
    {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    },
  );
}
