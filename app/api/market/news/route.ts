import Parser from "rss-parser";

const SYMBOLS: Record<string, string> = {
  gold: "GC=F",
  silver: "SI=F",
  oil: "CL=F",
  sp500: "^GSPC",
  nasdaq: "^IXIC",
  asx200: "^AXJO",
  natgas: "NG=F",
  nvidia: "NVDA",
  tesla: "TSLA",
  amazon: "AMZN",
  apple: "AAPL",
  palantir: "PLTR",
  bitcoin: "BTC-USD",
  ethereum: "ETH-USD",
  solana: "SOL-USD",
  ripple: "XRP-USD",
};

const parser = new Parser({ timeout: 8000 });

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const symbol = SYMBOLS[id];
  if (!symbol) return Response.json({ articles: [] });

  try {
    const feed = await parser.parseURL(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
    );
    const articles = feed.items.slice(0, 12).map((item) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      description: (item.contentSnippet ?? item.content ?? "").replace(/<[^>]*>/g, "").slice(0, 240),
      pubDate: item.pubDate ?? item.isoDate ?? "",
      source: "Yahoo Finance",
      category: ["bitcoin", "ethereum", "solana", "ripple"].includes(id) ? "crypto" as const : "markets" as const,
    }));
    return Response.json(
      { articles },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json({ articles: [] });
  }
}
