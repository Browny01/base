import { NextResponse } from "next/server";

export const runtime = "nodejs";

const YT_HOST_RE = /(^|\.)(youtube\.com|youtu\.be)$/i;

export interface YoutubeMeta {
  title: string;
  thumbnail: string | null;
  channel: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url")?.trim();
  if (!raw) return NextResponse.json({ ok: false, error: "Missing url." }, { status: 400 });

  let host = "";
  try {
    host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ ok: false, error: "Not a valid URL." }, { status: 400 });
  }
  if (!YT_HOST_RE.test(host)) {
    return NextResponse.json({ ok: false, error: "Only YouTube links are supported." }, { status: 400 });
  }

  let data: { title?: string; thumbnail_url?: string; author_name?: string };
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(raw)}&format=json`,
      { headers: { accept: "application/json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`YouTube responded ${res.status}`);
    data = (await res.json()) as { title?: string; thumbnail_url?: string; author_name?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't fetch that video." }, { status: 502 });
  }

  if (!data.title) {
    return NextResponse.json({ ok: false, error: "No video found at that link." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    title: data.title,
    thumbnail: data.thumbnail_url ?? null,
    channel: data.author_name ?? null,
  });
}