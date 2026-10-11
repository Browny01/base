import type { CreatorPlatform } from "@/lib/news-prefs";

export interface LiveStatusItem {
  id: string;
  name: string;
  handle: string;
  platform: CreatorPlatform;
  status: "live" | "offline" | "unknown";
  avatarUrl: string;
  url: string;
  title?: string;
}

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  category: "crypto" | "markets" | "general";
}

export interface SocialFeedItem {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceType: "youtube" | "reddit" | "x";
  category: "crypto" | "ai" | "irl" | "gaming" | "general";
  publishedAt: string;
  description: string;
  thumbnail?: string;
}

export interface YoutubeMeta {
  title: string;
  thumbnail: string | null;
  channel: string | null;
}

export interface TmdbResult {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  year: string | null;
  poster: string | null;
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  priceAud: number | null;
  valueAud: number | null;
  logoUri?: string;
}

export interface AssetData {
  id: string;
  name: string;
  symbol: string;
  price: number | null;       // in AUD
  priceUsd: number | null;    // kept for reference
  change24h: number | null;
  history: { t: number; v: number }[];  // values in AUD
  currency: string;
  note?: string;   // shown instead of a price for assets that don't trade (e.g. private companies)
  error?: string;
}
