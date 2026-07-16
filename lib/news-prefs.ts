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

export interface NewsPrefs {
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

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function socialFeedQuery(prefs: NewsPrefs) {
  const params = new URLSearchParams();
  prefs.youtube.forEach((channel) => params.append("youtube", `${channel.channelId}|${channel.name}|${channel.category}`));
  prefs.reddit.forEach((sub) => params.append("reddit", sub));
  prefs.x.forEach((handle) => params.append("x", handle));
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
