import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { extractLinkMeta, absolutizeImage, titleFromUrl } from "@/lib/link-meta";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (compatible; BaseNotes/1.0; +link-preview)";
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 400 * 1024;

const PRIVATE_V4 = [
  /^10\./, /^127\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

// Stops the endpoint being used as a proxy into the network the app runs in.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  if (PRIVATE_V4.some((re) => re.test(h))) return true;
  if (/^f[cd]/.test(h) || h.startsWith("fe80")) return true; // IPv6 ULA / link-local
  const ip = isIP(h);
  if (ip === 4) return false;
  return ip === 6 && (h.startsWith("::1") || h.startsWith("::"));
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url")?.trim();
  if (!raw) return NextResponse.json({ ok: false, error: "Missing url." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ ok: false, error: "Not a valid URL." }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "Unsupported protocol." }, { status: 400 });
  }
  if (isBlockedHost(target.hostname)) {
    return NextResponse.json({ ok: false, error: "That host can't be fetched." }, { status: 400 });
  }

  let html: string;
  let finalUrl: URL;
  try {
    const res = await fetch(target, {
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `That page returned ${res.status}.` }, { status: 502 });
    finalUrl = new URL(res.url || target.href);
    // Re-check after redirects so a public host can't bounce us inward.
    if (isBlockedHost(finalUrl.hostname)) {
      return NextResponse.json({ ok: false, error: "That host can't be fetched." }, { status: 400 });
    }
    const type = res.headers.get("content-type") ?? "";
    if (!/html|text|xml/i.test(type)) {
      return NextResponse.json({ ok: false, error: "That link isn't a web page." }, { status: 415 });
    }
    html = (await res.text()).slice(0, MAX_BYTES);
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't reach that site." }, { status: 502 });
  }

  const meta = extractLinkMeta(html);
  const siteName = meta.siteName ?? finalUrl.hostname.replace(/^www\./, "");

  return NextResponse.json({
    ok: true,
    title: meta.title || titleFromUrl(finalUrl.pathname, finalUrl.hostname),
    description: meta.description ?? "",
    image: absolutizeImage(meta.image, finalUrl.href),
    siteName,
    url: finalUrl.href,
  });
}