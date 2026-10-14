import { marketCurrency, type MarketCurrency } from "../packages/core/src/market-currency.ts";
export type FeedSource = "all" | "youtube" | "reddit" | "x";
export type VideoCategory = "all" | "crypto" | "ai" | "irl" | "gaming" | "general";
export type CreatorPlatform = "twitch" | "kick";

export interface YoutubeChannel {
  id: string;
  name: string;
  channelId: string;
  category: Exclude<VideoCategory, "all">;
}

export interface CreatorLink {
  id: string;
  name: string;
  handle: string;
  platform: CreatorPlatform;
}

export const FEED_KINDS = ["headlines", "youtube", "reddit", "x", "creators"] as const;
export type FeedKind = typeof FEED_KINDS[number];
export interface NewsPrefs {
  marketCurrency?: MarketCurrency;
  feedKinds?: FeedKind[];
  newsSources?: string[];
  youtube: YoutubeChannel[];
  reddit: string[];
  x: string[];
  creators: CreatorLink[];
}

export const CATEGORY_LABEL: Record<VideoCategory, string> = {
  all: "All",
  crypto: "Crypto",
  ai: "AI",
  irl: "IRL",
  gaming: "Gaming",
  general: "General",
};

export const SOURCE_LABEL: Record<FeedSource, string> = {
  all: "All",
  youtube: "YouTube",
  reddit: "Reddit",
  x: "X",
};

export const DEFAULT_NEWS_PREFS: NewsPrefs = {
  youtube: [],
  reddit: ["CryptoCurrency", "artificial"],
  x: [],
  creators: [],
};

// Older/synced workspaces can contain only the source array that was edited.
export function normalizeNewsPrefs(value: Partial<NewsPrefs> | null | undefined): NewsPrefs {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...source,
    marketCurrency: marketCurrency(source.marketCurrency),
    feedKinds: Array.isArray(source.feedKinds) ? source.feedKinds.filter(kind => FEED_KINDS.includes(kind)) : [...FEED_KINDS],
    youtube: Array.isArray(source.youtube) ? source.youtube : [],
    reddit: Array.isArray(source.reddit) ? source.reddit : [...DEFAULT_NEWS_PREFS.reddit],
    x: Array.isArray(source.x) ? source.x : [],
    creators: Array.isArray(source.creators) ? source.creators : [],
    newsSources: Array.isArray(source.newsSources) ? source.newsSources : undefined,
  };
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function socialFeedQuery(prefs: NewsPrefs) {
  prefs = normalizeNewsPrefs(prefs);
  const params = new URLSearchParams();
  if (prefs.feedKinds!.includes("youtube")) prefs.youtube.forEach((channel) => params.append("youtube", `${channel.channelId}|${channel.name}|${channel.category}`));
  if (prefs.feedKinds!.includes("reddit")) prefs.reddit.forEach((sub) => params.append("reddit", sub));
  if (prefs.feedKinds!.includes("x")) prefs.x.forEach((handle) => params.append("x", handle));
  return params.toString();
}

export function creatorUrl(creator: CreatorLink) {
  return creator.platform === "twitch"
    ? `https://www.twitch.tv/${creator.handle.replace(/^@/, "")}`
    : `https://kick.com/${creator.handle.replace(/^@/, "")}`;
}

export function xUrl(handle: string) {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}
