import { cachedFetch as fetch } from "./fetch.ts";

export const runtime = "nodejs";

import type { TmdbResult } from "../../core/src/integrations.ts";
export type { TmdbResult } from "../../core/src/integrations.ts";

export async function GET(request: Request, TMDB_KEY?: string) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q)
    return Response.json(
      { ok: false, error: "Missing query." },
      { status: 400 },
    );

  if (!TMDB_KEY) {
    return Response.json(
      {
        ok: false,
        configured: false,
        error: "Connect TMDB in Settings → Integrations.",
      },
      { status: 501 },
    );
  }

  const params = new URLSearchParams({
    query: q,
    language: "en-US",
    page: "1",
  });
  const bearer = !/^[a-f0-9]{32}$/i.test(TMDB_KEY);
  if (!bearer) params.set("api_key", TMDB_KEY);
  const url = `https://api.themoviedb.org/3/search/multi?${params}`;

  let data: { results?: unknown[] };
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(bearer ? { Authorization: `Bearer ${TMDB_KEY}` } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
    data = (await res.json()) as { results?: unknown[] };
  } catch {
    return Response.json(
      { ok: false, error: "TMDB search failed." },
      { status: 502 },
    );
  }

  const results: TmdbResult[] = (data.results ?? [])
    .filter(
      (r): r is Record<string, unknown> & { media_type: "movie" | "tv" } => {
        const t = r as Record<string, unknown>;
        return (
          (t.media_type === "movie" || t.media_type === "tv") &&
          typeof (t.title ?? t.name) === "string"
        );
      },
    )
    .map((r) => ({
      id: r.id as number,
      media_type: r.media_type,
      title: (r.title ?? r.name) as unknown as string,
      year:
        ((r.release_date ?? r.first_air_date) as string | undefined)?.slice(
          0,
          4,
        ) || null,
      poster:
        typeof r.poster_path === "string" && r.poster_path
          ? `https://image.tmdb.org/t/p/w342${r.poster_path}`
          : null,
    }))
    .slice(0, 8);

  return Response.json({ ok: true, results });
}
