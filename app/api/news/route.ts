import { NextResponse } from "next/server";
import Parser from "rss-parser";

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category: "crypto" | "markets" | "general";
}

const FEEDS = [
  {
    url: "https://feeds.marketwatch.com/marketwatch/topstories",
    source: "MarketWatch",
    category: "markets" as const,
  },
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
    category: "crypto" as const,
  },
  {
    url: "https://cointelegraph.com/rss",
    source: "CoinTelegraph",
    category: "crypto" as const,
  },
  {
    url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
    source: "Yahoo Finance",
    category: "markets" as const,
  },
  {
    url: "https://www.theverge.com/rss/index.xml",
    source: "The Verge",
    category: "general" as const,
  },
];

const parser = new Parser({
  timeout: 8000,
  customFields: {
    item: [["media:content", "mediaContent"], ["dc:creator", "creator"]],
  },
});

export async function getArticles(): Promise<NewsArticle[]> {
  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
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
    })
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

export async function GET() {
  const articles = await getArticles();
  return NextResponse.json(
    { articles },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
  );
}
