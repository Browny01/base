"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { mdToHtml } from "@/lib/markdown";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useNexus } from "@/lib/hooks";
import type { AssetData } from "@/app/api/market/charts/route";
import type { LiveStatusItem } from "@/app/api/live-status/route";
import type { NewsArticle } from "@/app/api/news/route";
import type { SocialFeedItem } from "@/app/api/social-feed/route";
import {
  CATEGORY_LABEL,
  DEFAULT_NEWS_PREFS,
  socialFeedQuery,
  type NewsPrefs,
  type VideoCategory,
} from "@/lib/news-prefs";

function formatPrice(price: number | null): string {
  if (price === null) return "-";
  if (price >= 1000) return `A$${price.toLocaleString("en-AU", { maximumFractionDigits: 1 })}`;
  return `A$${price.toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function MarketTile({ asset, active, onClick }: { asset: AssetData; active: boolean; onClick: () => void }) {
  const up = (asset.change24h ?? 0) >= 0;
  const data = asset.history.slice(-18);

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-[var(--surface)] px-3 py-2 text-left transition-colors",
        active ? "border-[var(--border-2)] bg-[var(--chip)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{asset.symbol}</p>
        {asset.change24h !== null && (
          <span className="flex items-center gap-0.5 text-[10.5px] font-semibold" style={{ color: up ? "var(--c-emerald)" : "var(--c-rose)" }}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {up ? "+" : ""}{asset.change24h.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-[var(--text)]">{asset.name}</p>
          {asset.price === null && asset.note ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">{asset.note}</p>
          ) : (
            <p className="text-sm font-bold tabular text-[var(--text)]">{formatPrice(asset.price)}</p>
          )}
        </div>
        <div className={cn("h-8 w-16 shrink-0", up ? "nx-chart-up" : "nx-chart-down")}>
          {data.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.map((d) => ({ value: d.v }))}>
                <Area type="monotone" dataKey="value" stroke="var(--text)" strokeWidth={1.4} fill="var(--text)" fillOpacity={0.08} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MarketChart({ asset }: { asset: AssetData | null }) {
  if (!asset) {
    return (
      <div className="flex h-[210px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]">
        Select a market widget.
      </div>
    );
  }

  const data = asset.history.map((d) => ({
    date: new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    price: d.v,
  }));
  const up = (asset.change24h ?? 0) >= 0;

  return (
    <section className={cn("rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4", up ? "nx-chart-up" : "nx-chart-down")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Market detail</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text)]">{asset.name}</h2>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular text-[var(--text)]">{formatPrice(asset.price)}</p>
          {asset.change24h !== null && (
            <p className="text-[12px] font-semibold tabular" style={{ color: up ? "var(--c-emerald)" : "var(--c-rose)" }}>{up ? "+" : ""}{asset.change24h.toFixed(2)}%</p>
          )}
        </div>
      </div>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="market-detail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--text)" stopOpacity={0.22} />
                <stop offset="95%" stopColor="var(--text)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid #262626", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
              formatter={(v: unknown) => [formatPrice(Number(v)), asset.symbol]}
            />
            <Area type="monotone" dataKey="price" stroke="var(--text)" strokeWidth={2} fill="url(#market-detail)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[170px] items-center justify-center text-sm text-[var(--muted)]">Chart data unavailable</div>
      )}
    </section>
  );
}

function SocialHub({ prefs, articles, newsLoading }: { prefs: NewsPrefs; articles: NewsArticle[]; newsLoading: boolean }) {
  const [category, setCategory] = useState<VideoCategory>("all");
  const [items, setItems] = useState<SocialFeedItem[]>([]);
  const [loading, setLoading] = useState(false);

  const feedQuery = useMemo(() => socialFeedQuery(prefs), [prefs]);

  function refresh() {
    setLoading(true);
    fetch(`/api/social-feed?${feedQuery}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    if (!feedQuery) {
      Promise.resolve().then(() => { if (!cancelled) setItems([]); });
      return;
    }

    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    fetch(`/api/social-feed?${feedQuery}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [feedQuery]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      return true;
    });
  }, [items, category]);

  const youtubeItems = filteredItems.filter((item) => item.sourceType === "youtube");
  const redditItems = filteredItems.filter((item) => item.sourceType === "reddit");
  const xItems = filteredItems.filter((item) => item.sourceType === "x");

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Content radar</p>
          <h2 className="text-lg font-bold text-[var(--text)]">Social feeds</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="flex h-8 items-center justify-center rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]">
            Edit sources
          </Link>
          <button onClick={refresh} disabled={loading || !feedQuery} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Headlines</p>
          <span className="text-[11px] text-[var(--faint)]">{articles.length} stories</span>
        </div>
        {newsLoading ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)]"><Loader2 className="h-5 w-5 animate-spin text-[var(--text)]" /></div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {articles.slice(0, 24).map((article, i) => (
              <a
                key={`${article.link}-${i}`}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[104px] w-[240px] shrink-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-colors hover:bg-[var(--surface-2)]"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{article.category}</span>
                  <span className="truncate text-[11px] font-medium text-[var(--muted)]">{article.source}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--faint)]">{timeAgo(article.pubDate)}</span>
                </div>
                <p className="line-clamp-3 text-[13px] font-semibold leading-snug text-[var(--text)]">{article.title}</p>
              </a>
            ))}
            {articles.length === 0 && (
              <div className="flex h-28 min-w-[280px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">No headlines available.</div>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {(["all", "crypto", "ai", "irl", "gaming", "general"] as const).map((item) => (
          <button key={item} onClick={() => setCategory(item)} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", category === item ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
            {CATEGORY_LABEL[item]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--text)]" /></div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">YouTube</p>
              <span className="text-[11px] text-[var(--faint)]">{youtubeItems.length} videos</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {youtubeItems.map((item) => (
                <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" className="group w-[260px] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 transition-colors hover:bg-[var(--surface-2)]">
                  <div className="aspect-video overflow-hidden rounded-md bg-[var(--chip)]">
                    {item.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.thumbnail} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-[var(--faint)]">No thumbnail</div>
                    )}
                  </div>
                  <div className="min-w-0 pt-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-[11px] font-medium text-[var(--muted)]">{item.source}</span>
                      <span className="text-[11px] text-[var(--faint)]">{timeAgo(item.publishedAt)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text)]">{item.title}</p>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{item.description}</p>}
                  </div>
                </a>
              ))}
              {youtubeItems.length === 0 && (
                <div className="flex h-40 min-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                  <p>No YouTube videos for this filter.</p>
                  <Link href="/settings" className="text-xs font-semibold text-[var(--text)] hover:opacity-70">Edit YouTube sources</Link>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Reddit</p>
              <span className="text-[11px] text-[var(--faint)]">{redditItems.length} posts</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {redditItems.map((item) => (
                <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" className="group min-h-[122px] w-[280px] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-colors hover:bg-[var(--surface-2)]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Reddit</span>
                    <span className="truncate text-[11px] font-medium text-[var(--muted)]">{item.source}</span>
                    <span className="ml-auto text-[11px] text-[var(--faint)]">{timeAgo(item.publishedAt)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text)]">{item.title}</p>
                  {item.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{item.description}</p>}
                </a>
              ))}
              {redditItems.length === 0 && (
                <div className="flex h-32 min-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted)]">
                  <p>No Reddit sources configured.</p>
                  <Link href="/settings" className="text-xs font-semibold text-[var(--text)] hover:opacity-70">Edit Reddit sources</Link>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">X</p>
              <span className="text-[11px] text-[var(--faint)]">{xItems.length} posts</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {xItems.map((item) => (
                <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" className="group min-h-[142px] w-[280px] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 transition-colors hover:bg-[var(--surface-2)]">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">X</span>
                    <span className="truncate text-[11px] font-medium text-[var(--muted)]">{item.source}</span>
                    <span className="ml-auto text-[11px] text-[var(--faint)]">{timeAgo(item.publishedAt)}</span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 text-[var(--faint)] group-hover:text-[var(--text)]" />
                  </div>
                  <p className="line-clamp-4 whitespace-pre-line text-sm font-semibold leading-snug text-[var(--text)]">{item.title}</p>
                </a>
              ))}
              {xItems.length === 0 && (
                <div className="flex h-32 min-w-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 text-center text-sm text-[var(--muted)]">
                  <p>{prefs.x.length ? "No X posts available. Add X_BEARER_TOKEN to enable synced post fetching." : "No X accounts configured."}</p>
                  <Link href="/settings" className="text-xs font-semibold text-[var(--text)] hover:opacity-70">Edit X sources</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function statusStyle(status: LiveStatusItem["status"]) {
  if (status === "live") return "bg-[var(--text)] text-[var(--bg)]";
  if (status === "offline") return "bg-[var(--chip)] text-[var(--muted)]";
  return "bg-[var(--surface-2)] text-[var(--faint)]";
}

function LiveTracker({ prefs }: { prefs: NewsPrefs }) {
  const [items, setItems] = useState<LiveStatusItem[]>([]);
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    prefs.creators.forEach((creator) => params.append("creator", `${creator.platform}|${creator.handle}|${creator.name}`));
    return params.toString();
  }, [prefs.creators]);

  function refresh() {
    if (!query) return;
    setLoading(true);
    fetch(`/api/live-status?${query}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    if (!query) {
      Promise.resolve().then(() => { if (!cancelled) setItems([]); });
      return;
    }

    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    fetch(`/api/live-status?${query}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setItems(data.items ?? []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">Live watch</p>
          <h2 className="text-base font-bold text-[var(--text)]">Twitch / Kick</h2>
        </div>
        <button onClick={refresh} disabled={loading || !query} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--text)] disabled:opacity-40" title="Refresh live status">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
        {items.map((creator) => (
          <div key={creator.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--chip)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creator.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{creator.name}</p>
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", statusStyle(creator.status))}>{creator.status}</span>
              </div>
              <p className="truncate text-[11px] uppercase tracking-wide text-[var(--faint)]">{creator.platform} · @{creator.handle}</p>
              {creator.title && <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{creator.title}</p>}
            </div>
            <a href={creator.url} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--text)]" title="Open channel">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
            <p>No live creators configured.</p>
            <Link href="/settings" className="mt-2 inline-block font-semibold text-[var(--text)] hover:opacity-70">Edit in Settings</Link>
          </div>
        )}
      </div>
    </section>
  );
}
function NewsBriefing() {
  const [state, setState] = useState<{ loading: boolean; summary?: string; generatedAt?: string; error?: string }>({ loading: true });
  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    fetch("/api/news/summary")
      .then((r) => r.json())
      .then((j) => setState(j.ok ? { loading: false, summary: j.summary, generatedAt: j.generatedAt } : { loading: false, error: j.error || "Couldn't load the briefing." }))
      .catch((e) => setState({ loading: false, error: String(e) }));
  };
  useEffect(load, []);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]"><Sparkles className="h-4 w-4" strokeWidth={1.9} /> Hourly briefing</p>
        <div className="flex items-center gap-2">
          {state.generatedAt && <span className="text-[11px] text-[var(--muted)]">Updated {timeAgo(state.generatedAt)}</span>}
          <button onClick={load} disabled={state.loading} title="Refresh" className="rounded p-1 text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-40"><RefreshCw className={cn("h-3.5 w-3.5", state.loading && "animate-spin")} /></button>
        </div>
      </div>
      {state.loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--faint)]"><Loader2 className="h-4 w-4 animate-spin" /> Summarising the latest headlines…</div>
      ) : state.error ? (
        <p className="text-[13px] text-[var(--faint)]">{state.error}</p>
      ) : (
        <div className="nx-md text-[13.5px]" dangerouslySetInnerHTML={{ __html: mdToHtml(state.summary || "") }} />
      )}
    </div>
  );
}

export function NewsPage() {
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [mktPage, setMktPage] = useState(0);
  const [cols, setCols] = useState(4);
  const { data } = useNexus();
  const prefs = data.newsPrefs ?? DEFAULT_NEWS_PREFS;

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[3] ?? assets[0] ?? null;

  // Market widgets are capped at 3 rows and paged with arrows. Column count is
  // responsive so "3 rows" stays accurate across breakpoints.
  useEffect(() => {
    const mq3 = window.matchMedia("(min-width: 640px)");
    const mq4 = window.matchMedia("(min-width: 1024px)");
    const update = () => setCols(mq4.matches ? 4 : mq3.matches ? 3 : 2);
    update();
    mq3.addEventListener("change", update); mq4.addEventListener("change", update);
    return () => { mq3.removeEventListener("change", update); mq4.removeEventListener("change", update); };
  }, []);
  const pageSize = cols * 3;
  const pageCount = Math.max(1, Math.ceil(assets.length / pageSize));
  const mktPageClamped = Math.min(mktPage, pageCount - 1);
  const visibleAssets = assets.slice(mktPageClamped * pageSize, mktPageClamped * pageSize + pageSize);

  function loadAll() {
    setChartsLoading(true);
    setNewsLoading(true);
    fetch("/api/market/charts")
      .then((res) => res.json())
      .then((data) => {
        const nextAssets = data.assets ?? [];
        setAssets(nextAssets);
        setSelectedAssetId((current) => current ?? nextAssets[3]?.id ?? nextAssets[0]?.id ?? null);
      })
      .catch(() => setAssets([]))
      .finally(() => setChartsLoading(false));

    fetch("/api/news")
      .then((res) => res.json())
      .then((data) => setNews(data.articles ?? []))
      .catch(() => setNews([]))
      .finally(() => {
        setNewsLoading(false);
        setLastRefreshed(new Date());
      });
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/charts")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const nextAssets = data.assets ?? [];
        setAssets(nextAssets);
        setSelectedAssetId(nextAssets[3]?.id ?? nextAssets[0]?.id ?? null);
      })
      .catch(() => { if (!cancelled) setAssets([]); })
      .finally(() => { if (!cancelled) setChartsLoading(false); });

    fetch("/api/news")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setNews(data.articles ?? []); })
      .catch(() => { if (!cancelled) setNews([]); })
      .finally(() => {
        if (!cancelled) {
          setNewsLoading(false);
          setLastRefreshed(new Date());
        }
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-full p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">Feeds / Markets / Creators</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">News</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && <span className="text-xs text-[var(--muted)]">Updated {lastRefreshed.toLocaleTimeString()}</span>}
          <button onClick={loadAll} disabled={chartsLoading || newsLoading} className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40">
            <RefreshCw className={cn("h-3.5 w-3.5", (chartsLoading || newsLoading) && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          {chartsLoading ? (
            <div className="flex h-[74px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]"><Loader2 className="h-5 w-5 animate-spin text-[var(--text)]" /></div>
          ) : (
            <>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {visibleAssets.map((asset) => (
                  <MarketTile key={asset.id} asset={asset} active={selectedAsset?.id === asset.id} onClick={() => setSelectedAssetId(asset.id)} />
                ))}
              </div>
              {pageCount > 1 && (
                <div className="mt-2.5 flex items-center justify-center gap-3">
                  <button onClick={() => setMktPage(Math.max(0, mktPageClamped - 1))} disabled={mktPageClamped === 0} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Previous markets"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-[11px] font-medium tabular text-[var(--faint)]">{mktPageClamped + 1} / {pageCount}</span>
                  <button onClick={() => setMktPage(Math.min(pageCount - 1, mktPageClamped + 1))} disabled={mktPageClamped === pageCount - 1} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent" aria-label="More markets"><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <MarketChart asset={selectedAsset} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <SocialHub prefs={prefs} articles={news} newsLoading={newsLoading} />
        </div>
        <div className="grid content-start gap-4">
          <NewsBriefing />
          <LiveTracker prefs={prefs} />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Manage YouTube, Reddit, X, Twitch, and Kick sources from Settings.
            </p>
            <Link href="/settings" className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--border)] px-2.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--chip)]">
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
