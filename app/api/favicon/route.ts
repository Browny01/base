import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

const UA = "Mozilla/5.0 (compatible; BaseBookmarks/1.0)";
const MAX_BYTES = 250_000;

async function toDataUrl(res: Response): Promise<string | null> {
  const type = (res.headers.get("content-type") || "").split(";")[0].trim() || "image/png";
  if (!type.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function grab(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return await toDataUrl(res);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
  }

  const candidates: string[] = [];

  // 1. Parse <link rel="...icon..."> out of the page <head>.
  try {
    const page = await fetch(target.href, { signal: AbortSignal.timeout(8000), headers: { "user-agent": UA } });
    if (page.ok) {
      const html = (await page.text()).slice(0, 120_000);
      for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        if (!/rel=["'][^"']*icon[^"']*["']/i.test(tag)) continue;
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
        if (href) {
          try { candidates.push(new URL(href, target.href).href); } catch { /* skip */ }
        }
      }
    }
  } catch {
    /* fall through to guesses */
  }

  // 2. Conventional locations + a rendering fallback.
  candidates.push(new URL("/favicon.ico", target.href).href);
  candidates.push(`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(target.hostname)}`);

  for (const url of candidates) {
    const dataUrl = await grab(url);
    if (dataUrl) {
      return NextResponse.json(
        { ok: true, dataUrl },
        { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800" } },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "No favicon found" });
}
