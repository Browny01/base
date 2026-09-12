"use client";

import { useEffect, useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import { Play, Film, Tv, Video, Search, Plus, Loader2, Check } from "lucide-react";
import { CardListPage, type CardConfig } from "@/components/card-list-page";
import type { WatchListItem, WatchKind } from "@/lib/store";
import type { TmdbResult } from "@/app/api/tmdb/search/route";
import type { YoutubeMeta } from "@/app/api/youtube/oembed/route";

const KIND_BADGE: Record<WatchKind, { label: string; icon: typeof Film; emoji: string }> = {
  movie:  { label: "Movie",   icon: Film,    emoji: "🎬" },
  tv:     { label: "Show",    icon: Tv,      emoji: "📺" },
  youtube:{ label: "YouTube", icon: Video, emoji: "▶️" },
};

const FILTERS: { value: "all" | WatchKind; label: string; icon: typeof Film }[] = [
  { value: "all",     label: "All",     icon: Play },
  { value: "movie",   label: "Movies",  icon: Film },
  { value: "tv",      label: "Shows",   icon: Tv },
  { value: "youtube", label: "YouTube", icon: Video },
];

const CONFIG: CardConfig<WatchListItem> = {
  dataKey: "watchList",
  title: "Watch List",
  addLabel: "Add Title",
  emptyIcon: Play,
  emptyText: "Your watch list is empty. Search a movie or show, or paste a YouTube link!",
  doneLabel: (n) => `Watched (${n})`,
  cover: (item) => item.poster,
  titleOf: (item) => item.title,
  subtitleOf: (item) => (item.kind === "youtube" ? item.channel : item.year),
  aspect: (item) => (item.kind === "youtube" ? "aspect-video" : "aspect-[2/3]"),
  badge: (item) => KIND_BADGE[item.kind],
  fallbackEmoji: (item) => KIND_BADGE[item.kind].emoji,
};

const YT_RE = /(?:youtube\.com|youtu\.be)/i;

function AddWatch({ items, close, append }: {
  items: WatchListItem[];
  close: () => void;
  append: (item: WatchListItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "movie" | "tv">("all");
  const [results, setResults] = useState<TmdbResult[] | null>(null);
  const [yt, setYt] = useState<YoutubeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const isYt = YT_RE.test(query);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setYt(null); setError(null); setNotConfigured(false); setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setResults(null);
    setYt(null);
    const t = setTimeout(async () => {
      try {
        if (YT_RE.test(q)) {
          const res = await fetch(`/api/youtube/oembed?url=${encodeURIComponent(q)}`, { signal: ac.signal });
          const j = await res.json();
          if (j.ok) setYt(j as YoutubeMeta);
          else setError(j.error ?? "Couldn't fetch that video.");
        } else {
          const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`, { signal: ac.signal });
          const j = await res.json();
          if (j.ok) setResults(j.results ?? []);
          else if (j.configured === false) setNotConfigured(true);
          else setError(j.error ?? "Search failed.");
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Something went wrong.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => { ac.abort(); clearTimeout(t); };
  }, [query, type]);

  const isDupTmdb = (id: number) => items.some((i) => i.kind !== "youtube" && i.tmdbId === id);
  const shownResults = (results ?? []).filter((r) => type === "all" || r.media_type === type);

  function addTmdb(r: TmdbResult) {
    append({
      id: uid(), kind: r.media_type, title: r.title, year: r.year ?? undefined,
      poster: r.poster ?? undefined, tmdbId: r.id,
      checked: false, createdAt: new Date().toISOString(),
    });
  }

  function addYt(m: YoutubeMeta) {
    append({
      id: uid(), kind: "youtube", title: m.title, channel: m.channel ?? undefined,
      poster: m.thumbnail ?? undefined,
      checked: false, createdAt: new Date().toISOString(),
    });
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--text)]">Add Title</h2>
      <p className="text-[11px] text-[var(--faint)] -mt-2">Search movies &amp; TV shows, or paste a YouTube link — it&apos;ll pull the title and thumbnail automatically.</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. The Matrix, or https://youtu.be/…"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--faint)]" strokeWidth={2} />
        </div>
        {!isYt && (
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden shrink-0">
            {(["all", "movie", "tv"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "px-3 py-2.5 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl capitalize",
                  type === t ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {t === "all" ? "All" : t === "movie" ? "Movies" : "TV"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--muted)] py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {isYt ? "Fetching video…" : "Searching…"}
        </div>
      )}

      {notConfigured && (
        <p className="rounded-xl border border-[var(--c-yellow)]/40 bg-[var(--c-yellow)]/10 px-3 py-2.5 text-[12px] text-[var(--text)]">
          Movies &amp; shows search needs a TMDB API key — add <code className="font-semibold">TMDB_API_KEY</code> to your environment variables. YouTube links still work.
        </p>
      )}

      {error && <p className="text-[12px] text-[var(--c-red)] py-1">{error}</p>}

      {/* YouTube preview */}
      {yt && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
          {yt.thumbnail ? (
            <img src={yt.thumbnail} alt="" className="w-32 aspect-video object-cover rounded-lg shrink-0" />
          ) : (
            <div className="w-32 aspect-video rounded-lg bg-[var(--chip)] grid place-items-center shrink-0">
              <Video className="w-6 h-6 opacity-40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text)] leading-snug line-clamp-2">{yt.title}</p>
            {yt.channel && <p className="text-[11px] text-[var(--faint)] mt-0.5 truncate">{yt.channel}</p>}
          </div>
          <button
            onClick={() => addYt(yt)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      )}

      {/* TMDB results */}
      {shownResults.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {shownResults.map((r) => {
            const dup = isDupTmdb(r.id);
            const BadgeIcon = KIND_BADGE[r.media_type].icon;
            const badgeLabel = KIND_BADGE[r.media_type].label;
            const emoji = KIND_BADGE[r.media_type].emoji;
            return (
              <div key={`${r.media_type}-${r.id}`} className="w-36 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden flex flex-col">
                <div className="aspect-[2/3] w-full relative bg-[var(--chip)] grid place-items-center">
                  {r.poster ? (
                    <img src={r.poster} alt={r.title} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl opacity-30">{emoji}</span>
                  )}
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-[var(--bg)]/90 border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                    <BadgeIcon className="w-3 h-3" />
                    {badgeLabel}
                  </span>
                </div>
                <div className="p-2 flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text)] leading-snug line-clamp-2">{r.title}</p>
                    {r.year && <p className="text-[10px] text-[var(--faint)]">{r.year}</p>}
                  </div>
                  <button
                    onClick={() => addTmdb(r)}
                    disabled={dup}
                    title={dup ? "Already in your list" : "Add"}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      dup ? "bg-[var(--chip)] text-[var(--faint)]" : "bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)]"
                    )}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={dup ? 2 : 3} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shownResults.length === 0 && results !== null && !loading && (
        <p className="text-[12px] text-[var(--faint)] py-1">No results — try a different title, or paste a YouTube link.</p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={close} className="px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
      </div>
    </div>
  );
}

export function WatchListPage() {
  const { data } = useBridge();
  const [filter, setFilter] = useState<"all" | WatchKind>("all");

  // Normalize legacy items (name/category → title/kind) so old data still renders.
  const items: WatchListItem[] = (data.watchList ?? []).map((raw) => {
    const it = raw as WatchListItem & { name?: string; category?: string };
    const kind: WatchKind =
      it.kind ?? (it.category === "series" ? "tv" : it.category === "youtube" ? "youtube" : "movie");
    return { ...it, kind, title: it.title ?? it.name ?? "Untitled" };
  });

  const filterBar = (
    <div className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => {
        const Icon = f.icon;
        const active = filter === f.value;
        return (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
              active
                ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <CardListPage
      config={CONFIG}
      items={items}
      filter={(item) => filter === "all" || item.kind === filter}
      filterBar={filterBar}
      renderAdd={({ close, append }) => <AddWatch items={items} close={close} append={append} />}
    />
  );
}