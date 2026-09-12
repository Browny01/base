import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TMDB_KEY = process.env.TMDB_API_KEY;

export interface TmdbResult {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  year: string | null;
  poster: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ ok: false, error: "Missing query." }, { status: 400 });

  if (!TMDB_KEY) {
    return NextResponse.json(
      { ok: false, configured: false, error: "TMDB_API_KEY isn't configured." },
      { status: 501 }
    );
  }

  const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_KEY)}&query=${encodeURIComponent(q)}&language=en-US&page=1`;

  let data: { results?: unknown[] };
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`TMDB responded ${res.status}`);
    data = (await res.json()) as { results?: unknown[] };
  } catch {
    return NextResponse.json({ ok: false, error: "TMDB search failed." }, { status: 502 });
  }

  const results: TmdbResult[] = (data.results ?? [])
    .filter((r): r is Record<string, unknown> & { media_type: "movie" | "tv" } => {
      const t = r as Record<string, unknown>;
      return (t.media_type === "movie" || t.media_type === "tv") && typeof (t.title ?? t.name) === "string";
    })
    .map((r) => ({
      id: r.id as number,
      media_type: r.media_type,
      title: (r.title ?? r.name) as unknown as string,
      year: ((r.release_date ?? r.first_air_date) as string | undefined)?.slice(0, 4) || null,
      poster: typeof r.poster_path === "string" && r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
    }))
    .slice(0, 8);

  return NextResponse.json({ ok: true, results });
}