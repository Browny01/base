import { NextRequest, NextResponse } from "next/server";
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

function creatorUrl(platform: CreatorPlatform, handle: string) {
  return platform === "twitch"
    ? `https://www.twitch.tv/${handle}`
    : `https://kick.com/${handle}`;
}

function avatarUrl(platform: CreatorPlatform, handle: string) {
  return `https://unavatar.io/${platform}/${handle}`;
}

async function twitchStatus(handle: string): Promise<Pick<LiveStatusItem, "status" | "title">> {
  try {
    const res = await fetch(`https://www.twitch.tv/${encodeURIComponent(handle)}`, {
      headers: { "User-Agent": "Mozilla/5.0 Nexus/1.0" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return { status: "unknown" };
    const html = await res.text();
    if (html.includes("isLiveBroadcast") || html.includes('"isLive":true')) return { status: "live" };
    if (html.includes("Twitch")) return { status: "offline" };
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

async function kickStatus(handle: string): Promise<Pick<LiveStatusItem, "status" | "title">> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}`, {
      headers: { "User-Agent": "Mozilla/5.0 Nexus/1.0", Accept: "application/json" },
      next: { revalidate: 120 },
    });
    if (!res.ok) return { status: "unknown" };
    const data = await res.json();
    if (data?.livestream) {
      return { status: "live", title: data.livestream.session_title ?? data.livestream.slug };
    }
    return { status: "offline" };
  } catch {
    return { status: "unknown" };
  }
}

export async function GET(request: NextRequest) {
  const creators = request.nextUrl.searchParams.getAll("creator")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 24);

  const items = await Promise.all(creators.map(async (raw) => {
    const [platformRaw, handleRaw, nameRaw] = raw.split("|").map((part) => part.trim());
    const platform = platformRaw === "kick" ? "kick" : "twitch";
    const handle = handleRaw.replace(/^@/, "");
    const name = nameRaw || handle;
    const detected = platform === "twitch" ? await twitchStatus(handle) : await kickStatus(handle);
    return {
      id: `${platform}:${handle}`,
      name,
      handle,
      platform,
      status: detected.status,
      title: detected.title,
      avatarUrl: avatarUrl(platform, handle),
      url: creatorUrl(platform, handle),
    } satisfies LiveStatusItem;
  }));

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" } },
  );
}
