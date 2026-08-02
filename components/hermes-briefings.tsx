"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, History, ScrollText, X } from "lucide-react";
import type { Brief, BriefType } from "@/lib/store";
import { mdToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const BRIEF_CONFIG: { type: BriefType; label: string; empty: string; staleAfterHours: number }[] = [
  { type: "morning_coo", label: "Morning COO Brief", empty: "No Morning COO Brief has been published yet.", staleAfterHours: 36 },
  { type: "weekly_business_review", label: "Weekly Business Review", empty: "No Weekly Business Review has been published yet.", staleAfterHours: 9 * 24 },
  { type: "content_opportunity", label: "Content Opportunity Brief", empty: "No Content Opportunity Brief has been published yet.", staleAfterHours: 8 * 24 },
];

function localGeneratedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown generation time";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function markdownPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStale(brief: Brief, thresholdHours: number): boolean {
  const generated = Date.parse(brief.generatedAt);
  return Number.isFinite(generated) && Date.now() - generated > thresholdHours * 60 * 60 * 1000;
}

export function HermesBriefings({ briefs = [] }: { briefs?: Brief[] }) {
  const published = briefs
    .filter((brief) => brief.status === "published")
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  const [activeBrief, setActiveBrief] = useState<Brief | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const closeOverlay = useCallback(() => {
    setActiveBrief(null);
    setShowHistory(false);
  }, [setActiveBrief, setShowHistory]);

  return (
    <section className="card h-full overflow-auto p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-[var(--text)]">
          <span className="text-[var(--muted)]"><ScrollText aria-hidden="true" className="h-[15px] w-[15px]" strokeWidth={1.9} /></span>
          Hermes Briefings
        </h2>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          disabled={published.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--faint)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <History aria-hidden="true" className="h-3.5 w-3.5" /> History
        </button>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-3">
        {BRIEF_CONFIG.map((config) => {
          const brief = published.find((item) => item.type === config.type);
          const stale = brief ? isStale(brief, config.staleAfterHours) : false;
          return (
            <article key={config.type} className="flex min-h-[184px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase leading-snug tracking-[0.075em] text-[var(--muted)]">{config.label}</p>
                {stale && <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--faint)]">Stale</span>}
              </div>
              {brief ? (
                <>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text)]">{brief.title}</h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-[var(--faint)]">
                    <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" className="h-3 w-3" />{localGeneratedTime(brief.generatedAt)}</span>
                    {brief.workspace && <><span aria-hidden="true">·</span><span className="truncate">{brief.workspace}</span></>}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{markdownPreview(brief.contentMarkdown) || "This briefing has no preview text."}</p>
                  <button type="button" onClick={() => setActiveBrief(brief)} className="mt-auto inline-flex items-center gap-1 self-start pt-2 text-[11.5px] font-semibold text-[var(--text)] hover:underline">
                    View full brief <ArrowRight aria-hidden="true" className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="flex flex-1 items-center">
                  <p className="text-xs leading-relaxed text-[var(--faint)]">{config.empty}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {(activeBrief || showHistory) && (
        <BriefOverlay
          activeBrief={activeBrief}
          briefs={published}
          history={showHistory && !activeBrief}
          onClose={closeOverlay}
          onSelect={(brief) => { setShowHistory(false); setActiveBrief(brief); }}
          onShowHistory={() => { setActiveBrief(null); setShowHistory(true); }}
        />
      )}
    </section>
  );
}

function BriefOverlay({ activeBrief, briefs, history, onClose, onSelect, onShowHistory }: {
  activeBrief: Brief | null;
  briefs: Brief[];
  history: boolean;
  onClose: () => void;
  onSelect: (brief: Brief) => void;
  onShowHistory: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const config = activeBrief ? BRIEF_CONFIG.find((item) => item.type === activeBrief.type) : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 px-0 backdrop-blur-[3px] sm:items-center sm:px-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="hermes-dialog-title" className="nx-slide-up flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[26px] border border-[var(--border)] bg-[var(--bg)] elevated sm:max-w-[760px] sm:rounded-[22px]">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">{history ? "Hermes archive" : config?.label}</p>
            <h2 id="hermes-dialog-title" className="text-lg font-semibold leading-tight text-[var(--text)]">{history ? "Previous briefings" : activeBrief?.title}</h2>
            {activeBrief && (
              <p className="mt-1.5 text-xs text-[var(--faint)]">
                Generated {localGeneratedTime(activeBrief.generatedAt)}{activeBrief.workspace ? ` · ${activeBrief.workspace}` : ""}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close briefing" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {history ? (
            <div className="space-y-2">
              {briefs.map((brief) => {
                const label = BRIEF_CONFIG.find((item) => item.type === brief.type)?.label ?? brief.type;
                return (
                  <button key={brief.id} type="button" onClick={() => onSelect(brief)} className="group flex w-full items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--border-2)]">
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)]">{label}</span>
                      <span className="mt-1 block truncate text-sm font-semibold text-[var(--text)]">{brief.title}</span>
                      <span className="mt-1 block text-[11px] text-[var(--faint)]">{localGeneratedTime(brief.generatedAt)}{brief.workspace ? ` · ${brief.workspace}` : ""}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="mt-4 h-4 w-4 shrink-0 text-[var(--faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--text)]" />
                  </button>
                );
              })}
            </div>
          ) : activeBrief ? (
            <>
              {(activeBrief.periodStart || activeBrief.periodEnd) && (
                <p className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--muted)]">
                  Reporting period: {activeBrief.periodStart} to {activeBrief.periodEnd}
                </p>
              )}
              <div className={cn("nx-md text-[14px] leading-relaxed text-[var(--text)]", "[&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base")} dangerouslySetInnerHTML={{ __html: mdToHtml(activeBrief.contentMarkdown) }} />
              {briefs.length > 1 && (
                <button type="button" onClick={onShowHistory} className="mt-7 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]">
                  <History aria-hidden="true" className="h-3.5 w-3.5" /> View briefing history
                </button>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
