import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

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

const parser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "Bridge/1.0 (+https://vercel.app)",
  },
});

const clean = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

interface XTweet {
  id: string;
  text?: string;
  created_at?: string;
}

function youtubeVideoId(item: Parser.Item) {
  const withId = item as Parser.Item & { id?: string };
  const id = withId.id ?? item.guid ?? "";
  if (id.startsWith("yt:video:")) return id.replace("yt:video:", "");
  try {
    const url = new URL(item.link ?? "");
    return url.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

async function fetchXPosts(handle: string): Promise<SocialFeedItem[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];

  const headers = { Authorization: `Bearer ${token}` };
  const userRes = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`, {
    headers,
    next: { revalidate: 180 },
  });
  if (!userRes.ok) return [];
  const userJson = await userRes.json();
  const userId = userJson?.data?.id;
  const username = userJson?.data?.username ?? handle;
  if (!userId) return [];

  const tweetsRes = await fetch(
    `https://api.x.com/2/users/${userId}/tweets?max_results=10&exclude=replies,retweets&tweet.fields=created_at,text`,
    { headers, next: { revalidate: 180 } },
  );
  if (!tweetsRes.ok) return [];
  const tweetsJson = await tweetsRes.json();
  const tweets: XTweet[] = Array.isArray(tweetsJson?.data) ? tweetsJson.data : [];

  return tweets.map((tweet) => ({
    id: `x:${tweet.id}`,
    title: tweet.text ?? "",
    link: `https://x.com/${username}/status/${tweet.id}`,
    source: `@${username}`,
    sourceType: "x" as const,
    category: "general" as const,
    publishedAt: tweet.created_at ?? "",
    description: tweet.text ?? "",
  }));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const youtube = params.getAll("youtube").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean).slice(0, 12);
  const reddit = params.getAll("reddit").flatMap((v) => v.split(",")).map((v) => v.trim().replace(/^r\//, "")).filter(Boolean).slice(0, 12);
  const x = params.getAll("x").flatMap((v) => v.split(",")).map((v) => v.trim().replace(/^@/, "")).filter(Boolean).slice(0, 12);

  const jobs: Promise<SocialFeedItem[]>[] = [];

  for (const raw of youtube) {
    const [channelId, name = channelId, category = "general"] = raw.split("|").map((part) => part.trim());
    if (!channelId.startsWith("UC")) continue;
    jobs.push(
      parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`)
        .then((feed) => feed.items.filter((item) => !(item.link ?? "").includes("/shorts/")).slice(0, 8).map((item) => {
          const videoId = youtubeVideoId(item);
          return {
            id: item.guid ?? item.link ?? `${channelId}-${item.title}`,
            title: item.title ?? "Untitled video",
            link: item.link ?? `https://www.youtube.com/channel/${channelId}`,
            source: name || feed.title || "YouTube",
            sourceType: "youtube" as const,
            category: (category as SocialFeedItem["category"]) || "general",
            publishedAt: item.isoDate ?? item.pubDate ?? "",
            description: clean(item.contentSnippet ?? item.content ?? "").slice(0, 180),
            thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined,
          };
        }))
        .catch(() => []),
    );
  }

  for (const sub of reddit) {
    jobs.push(
      parser.parseURL(`https://www.reddit.com/r/${encodeURIComponent(sub)}/new/.rss`)
        .then((feed) => feed.items.slice(0, 8).map((item) => ({
          id: item.guid ?? item.link ?? `${sub}-${item.title}`,
          title: item.title ?? "Untitled post",
          link: item.link ?? `https://reddit.com/r/${sub}`,
          source: `r/${sub}`,
          sourceType: "reddit" as const,
          category: "general" as const,
          publishedAt: item.isoDate ?? item.pubDate ?? "",
          description: clean(item.contentSnippet ?? item.content ?? "").slice(0, 180),
        })))
        .catch(() => []),
    );
  }

  for (const handle of x) {
    jobs.push(fetchXPosts(handle).catch(() => []));
  }

  const settled = await Promise.all(jobs);
  const items = settled.flat().sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });

  return NextResponse.json(
    { items: items.slice(0, 80) },
    { headers: { "Cache-Control": "s-maxage=180, stale-while-revalidate=600" } },
  );
}
