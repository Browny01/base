// Extracts link-preview metadata from an HTML document. Pure string work, kept
// out of the route so it can be tested directly.

export interface LinkMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function pick(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const v = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
      if (v) return v;
    }
  }
  return null;
}

// Meta tags are written with the attributes in either order, so each field needs
// a pattern for "name first" and one for "content first".
const both = (attr: string, key: string) => [
  new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
  new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, "i"),
];

export function extractLinkMeta(html: string): LinkMeta {
  return {
    title: pick(html, [
      ...both("property", "og:title"),
      ...both("name", "twitter:title"),
      /<title[^>]*>([\s\S]{1,300}?)<\/title>/i,
    ]),
    description: pick(html, [
      ...both("property", "og:description"),
      ...both("name", "twitter:description"),
      ...both("name", "description"),
    ]),
    image: pick(html, [
      ...both("property", "og:image"),
      ...both("property", "og:image:secure_url"),
      ...both("property", "og:image:url"),
      ...both("name", "twitter:image"),
      ...both("name", "twitter:image:src"),
      /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    ]),
    siteName: pick(html, [
      ...both("property", "og:site_name"),
      ...both("name", "application-name"),
    ]),
  };
}

/** Turns a possibly-relative image reference into an absolute URL, or null. */
export function absolutizeImage(raw: string | null, pageUrl: string): string | null {
  if (!raw) return null;
  const candidate = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const u = new URL(candidate, pageUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Last-resort title when a page has no title tag: the final URL path segment. */
export function titleFromUrl(pathname: string, hostname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const pretty = decodeEntities(last).replace(/[-_]+/g, " ").trim();
  return pretty || hostname.replace(/^www\./, "");
}