"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { AssetData } from "@/app/api/market/charts/route";
import type { MarketInsight } from "@/app/api/market/insight/route";
import type { NewsArticle } from "@/app/api/news/route";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

const TRADING_VIEW_SYMBOLS: Record<string, string> = {
  gold: "COMEX:GC1!",
  silver: "COMEX:SI1!",
  oil: "NYMEX:CL1!",
  sp500: "SP:SPX",
  nasdaq: "NASDAQ:IXIC",
  asx200: "ASX:XJO",
  natgas: "NYMEX:NG1!",
  nvidia: "NASDAQ:NVDA",
  tesla: "NASDAQ:TSLA",
  amazon: "NASDAQ:AMZN",
  apple: "NASDAQ:AAPL",
  palantir: "NYSE:PLTR",
  bitcoin: "COINBASE:BTCUSD",
  ethereum: "COINBASE:ETHUSD",
  solana: "COINBASE:SOLUSD",
  ripple: "BITSTAMP:XRPUSD",
};

const NEWS_TERMS: Record<string, string[]> = {
  gold: ["gold", "bullion", "precious metal"],
  silver: ["silver", "precious metal"],
  oil: ["oil", "wti", "crude", "opec"],
  sp500: ["s&p", "sp 500", "wall street", "us stocks", "equities"],
  nasdaq: ["nasdaq", "technology stocks", "tech stocks"],
  asx200: ["asx", "australian stocks", "australia market"],
  natgas: ["natural gas", "nat gas"],
  nvidia: ["nvidia", "nvda"],
  tesla: ["tesla", "tsla", "elon musk"],
  amazon: ["amazon", "amzn"],
  apple: ["apple", "aapl", "iphone"],
  palantir: ["palantir", "pltr"],
  bitcoin: ["bitcoin", "btc", "crypto"],
  ethereum: ["ethereum", "ether", "eth", "crypto"],
  solana: ["solana", "sol", "crypto"],
  ripple: ["xrp", "ripple", "crypto"],
  spacex: ["spacex", "space x", "starship", "elon musk"],
};

function formatPrice(price: number | null): string {
  if (price === null) return "Unavailable";
  if (price >= 1000) return `A$${price.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `A$${price.toFixed(2)}`;
  return `A$${price.toPrecision(4)}`;
}

function percentChange(start: number | undefined, end: number | undefined): number | null {
  if (!start || !end) return null;
  return ((end - start) / start) * 100;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function timeAgo(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function matchedNews(asset: AssetData, articles: NewsArticle[]): NewsArticle[] {
  const terms = NEWS_TERMS[asset.id] ?? [asset.name.toLowerCase(), asset.symbol.toLowerCase()];
  const direct = articles.filter((article) => {
    const haystack = `${article.title} ${article.description}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
  if (direct.length >= 3) return direct.slice(0, 6);
  const broader = articles.filter((article) => article.category === (["bitcoin", "ethereum", "solana", "ripple"].includes(asset.id) ? "crypto" : "markets"));
  return [...direct, ...broader.filter((article) => !direct.includes(article))].slice(0, 6);
}

function TradingViewChart({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget h-full w-full";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Australia/Perth",
      theme: theme === "dark" ? "dark" : "light",
      style: "1",
      locale: "en",
      backgroundColor: theme === "dark" ? "rgba(10, 10, 10, 1)" : "rgba(255, 255, 255, 1)",
      gridColor: theme === "dark" ? "rgba(38, 38, 38, 0.65)" : "rgba(229, 229, 229, 0.8)",
      allow_symbol_change: false,
      calendar: false,
      hide_side_toolbar: false,
      save_image: false,
      support_host: "https://www.tradingview.com",
    });
    host.append(widget, script);
    return () => {
      host.innerHTML = "";
    };
  }, [symbol, theme]);

  return (
    <div ref={hostRef} className="tradingview-widget-container h-full w-full overflow-hidden rounded-xl bg-[var(--bg)]" />
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{label}</p>
      <p className={cn(
        "mt-1 text-base font-bold tabular text-[var(--text)]",
        tone === "up" && "text-[var(--c-emerald)]",
        tone === "down" && "text-[var(--c-rose)]",
      )}>{value}</p>
    </div>
  );
}

function ScenarioCard({ label, text, tone }: { label: string; text: string; tone: "base" | "bull" | "bear" }) {
  return (
    <div className={cn(
      "rounded-lg border p-3",
      tone === "base" && "border-[var(--border-2)] bg-[var(--surface-2)]",
      tone === "bull" && "border-emerald-500/25 bg-emerald-500/[0.06]",
      tone === "bear" && "border-rose-500/25 bg-rose-500/[0.06]",
    )}>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--faint)]">{label}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text)]">{text}</p>
    </div>
  );
}

export function MarketDetailModal({
  asset,
  articles,
  onClose,
}: {
  asset: AssetData | null;
  articles: NewsArticle[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [insight, setInsight] = useState<MarketInsight | null>(null);
  const [insightError, setInsightError] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [specificNews, setSpecificNews] = useState<{ assetId: string; articles: NewsArticle[] }>({ assetId: "", articles: [] });
  const tradingViewSymbol = asset ? TRADING_VIEW_SYMBOLS[asset.id] : undefined;
  const relevantNews = useMemo(() => {
    if (!asset) return [];
    const direct = specificNews.assetId === asset.id ? specificNews.articles : [];
    return matchedNews(asset, [...direct, ...articles]);
  }, [asset, articles, specificNews]);

  const historyStats = useMemo(() => {
    const history = asset?.history ?? [];
    const values = history.map((point) => point.v);
    const last = values.at(-1);
    const sevenDayStart = values.at(Math.max(0, values.length - 8));
    const monthStart = values[0];
    return {
      week: percentChange(sevenDayStart, last),
      month: percentChange(monthStart, last),
      low: values.length ? Math.min(...values) : null,
      high: values.length ? Math.max(...values) : null,
    };
  }, [asset]);

  async function loadInsight(signal?: AbortSignal, newsForAnalysis = relevantNews) {
    if (!asset) return;
    setInsightLoading(true);
    setInsightError("");
    try {
      const response = await fetch("/api/market/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          asset: {
            name: asset.name,
            symbol: asset.symbol,
            price: asset.price,
            change24h: asset.change24h,
            currency: asset.currency,
            note: asset.note,
            history: asset.history.slice(-30),
          },
          headlines: newsForAnalysis.map(({ title, description, source, pubDate }) => ({ title, description, source, pubDate })),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Analysis unavailable.");
      setInsight(result.insight);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setInsightError(error instanceof Error ? error.message : "Analysis unavailable.");
      }
    } finally {
      if (!signal?.aborted) setInsightLoading(false);
    }
  }

  useEffect(() => {
    if (!asset) return;
    const controller = new AbortController();
    fetch(`/api/market/news?id=${encodeURIComponent(asset.id)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        const nextNews = (result.articles ?? []) as NewsArticle[];
        setSpecificNews({ assetId: asset.id, articles: nextNews });
        return loadInsight(controller.signal, matchedNews(asset, [...nextNews, ...articles]));
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") loadInsight(controller.signal);
      });
    router.prefetch("/chat");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      controller.abort();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
    // The modal is intentionally refreshed whenever a different asset opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  if (!asset || typeof document === "undefined") return null;

  const up = (asset.change24h ?? 0) >= 0;
  const openChat = (prompt: string) => {
    const context = `${asset.name} (${asset.symbol}) is currently ${formatPrice(asset.price)} with a ${formatPercent(asset.change24h)} 24-hour move.`;
    try {
      localStorage.setItem("bridge_chat_prefill", `${context}\n\n${prompt}`);
    } catch {}
    router.push("/chat");
  };
  const promptButtons = [
    `Explain this move and separate confirmed facts from likely drivers.`,
    `Pressure-test my thesis on ${asset.name}. Start by asking me what my thesis is.`,
    `Build a bull, base, and bear case for ${asset.name} and tell me what would invalidate each one.`,
    `What important risks or signals might I be missing with ${asset.name}?`,
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex bg-black/65 p-2 backdrop-blur-sm sm:p-4 lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-[1540px] flex-col overflow-hidden rounded-2xl border border-[var(--border-2)] bg-[var(--bg)] shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <span className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            up ? "bg-emerald-500/10 text-[var(--c-emerald)]" : "bg-rose-500/10 text-[var(--c-rose)]",
          )}>
            {up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="market-detail-title" className="truncate text-lg font-bold text-[var(--text)] sm:text-xl">{asset.name}</h2>
              <span className="rounded-md bg-[var(--chip)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{asset.symbol}</span>
            </div>
            <p className="text-xs text-[var(--muted)]">Interactive chart, market context, scenarios, and relevant news</p>
          </div>
          <div className="ml-auto hidden text-right sm:block">
            <p className="text-lg font-bold tabular text-[var(--text)]">{asset.note ?? formatPrice(asset.price)}</p>
            {asset.change24h !== null && (
              <p className="text-xs font-bold tabular" style={{ color: up ? "var(--c-emerald)" : "var(--c-rose)" }}>{formatPercent(asset.change24h)} today</p>
            )}
          </div>
          {tradingViewSymbol && (
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tradingViewSymbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] md:flex"
            >
              TradingView <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button autoFocus onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Close market detail">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full xl:grid-cols-[minmax(0,1.65fr)_minmax(380px,0.85fr)]">
            <div className="min-w-0 border-b border-[var(--border)] p-3 sm:p-4 xl:border-b-0 xl:border-r">
              <div className="h-[430px] sm:h-[520px] xl:h-[calc(100vh-235px)] xl:min-h-[540px]">
                {tradingViewSymbol ? (
                  <TradingViewChart symbol={tradingViewSymbol} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-2)] bg-[var(--surface)] px-8 text-center">
                    <BarChart3 className="mb-4 h-10 w-10 text-[var(--faint)]" />
                    <h3 className="text-lg font-bold text-[var(--text)]">No public market chart</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{asset.name} is a private company, so it does not have a continuously traded public ticker on TradingView.</p>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Metric label="Price (AUD)" value={asset.note ?? formatPrice(asset.price)} />
                <Metric label="24 hours" value={formatPercent(asset.change24h)} tone={asset.change24h === null ? undefined : up ? "up" : "down"} />
                <Metric label="7 days" value={formatPercent(historyStats.week)} tone={historyStats.week === null ? undefined : historyStats.week >= 0 ? "up" : "down"} />
                <Metric label="30 days" value={formatPercent(historyStats.month)} tone={historyStats.month === null ? undefined : historyStats.month >= 0 ? "up" : "down"} />
                <Metric label="30d range" value={historyStats.low === null ? "—" : `${formatPrice(historyStats.low)}–${formatPrice(historyStats.high)}`} />
              </div>
            </div>

            <aside className="min-w-0 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--faint)]">AI market read</p>
                  <h3 className="mt-1 text-base font-bold text-[var(--text)]">Why it moved & what comes next</h3>
                </div>
                <button onClick={() => loadInsight()} disabled={insightLoading} title="Refresh analysis" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40">
                  <RefreshCw className={cn("h-3.5 w-3.5", insightLoading && "animate-spin")} />
                </button>
              </div>

              {insightLoading ? (
                <div className="flex min-h-44 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--text)]" />
                    <p className="mt-2 text-xs text-[var(--muted)]">Connecting price action with recent headlines…</p>
                  </div>
                </div>
              ) : insight ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-[var(--text)]" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--faint)]">{insight.confidence} confidence</span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[var(--text)]">{insight.moveSummary}</p>
                    {insight.drivers.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {insight.drivers.map((driver) => <li key={driver} className="flex gap-2 text-[12px] leading-relaxed text-[var(--muted)]"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text)]" />{driver}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <ScenarioCard label="Base case" text={insight.baseCase} tone="base" />
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <ScenarioCard label="Bull case" text={insight.bullCase} tone="bull" />
                      <ScenarioCard label="Bear case" text={insight.bearCase} tone="bear" />
                    </div>
                  </div>
                  {insight.watchItems.length > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--faint)]">Watch next</p>
                      <div className="flex flex-wrap gap-1.5">
                        {insight.watchItems.map((item) => <span key={item} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--muted)]">{item}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">AI analysis is temporarily unavailable</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{insightError || "Try refreshing the analysis."} The chart, price metrics, and matched headlines are still live.</p>
                </div>
              )}

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--faint)]">Big updates & news</p>
                  <span className="text-[10px] text-[var(--faint)]">{relevantNews.length} matched</span>
                </div>
                <div className="space-y-2">
                  {relevantNews.map((article) => (
                    <a key={article.link} href={article.link} target="_blank" rel="noopener noreferrer" className="group block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-2)]">
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-[var(--faint)]">
                        <span>{article.source}</span><span>·</span><span>{timeAgo(article.pubDate)}</span>
                        <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <p className="text-[12.5px] font-semibold leading-snug text-[var(--text)]">{article.title}</p>
                    </a>
                  ))}
                  {relevantNews.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">No matched headlines in the current feed.</p>}
                </div>
              </div>
              <p className="mt-4 text-[10px] leading-relaxed text-[var(--faint)]">Scenario analysis is informational and can be wrong. It is not personal financial advice. Confirm material claims with primary sources before acting.</p>
            </aside>
          </div>
        </div>

        <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle className="h-3.5 w-3.5 text-[var(--text)]" />
            <p className="text-xs font-bold text-[var(--text)]">Continue in AI Chat</p>
            <p className="hidden text-[11px] text-[var(--faint)] sm:block">Your market context is added automatically.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {promptButtons.map((prompt, index) => (
              <button key={prompt} onClick={() => openChat(prompt)} className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:border-[var(--border-2)] hover:text-[var(--text)]">
                {["Explain the move", "Pressure-test my thesis", "Build scenarios", "What am I missing?"][index]}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (question.trim()) openChat(question.trim());
            }}
          >
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={`Ask anything about ${asset.name}…`} className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--border-2)]" />
            <button type="submit" disabled={!question.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--text)] px-3 text-xs font-bold text-[var(--bg)] disabled:opacity-35">
              Open Chat <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
