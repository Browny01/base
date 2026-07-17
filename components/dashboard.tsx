"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, formatAUD, formatCurrency, formatDate, getToday, calcStreak } from "@/lib/utils";
import type { Priority, TaskTag } from "@/lib/store";
import { Repeat2, TrendingUp, Flame, Plus, Circle, CheckSquare, Wallet, Newspaper, Loader2, RefreshCw, FolderKanban, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { mdToHtml } from "@/lib/markdown";
import { DashAskBar } from "@/components/dash-ask-bar";

const PRIORITIES: Priority[] = ["P1", "P2", "P3"];
const TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];

const COLOR_DOT: Record<string, string> = {
  indigo: "bg-[var(--c-indigo)]", cyan: "bg-[var(--c-cyan)]", emerald: "bg-[var(--c-emerald)]",
  yellow: "bg-[var(--c-amber)]",  red: "bg-[var(--c-rose)]",  purple: "bg-[var(--c-purple)]",
  orange: "bg-[var(--c-orange)]", pink: "bg-[var(--c-pink)]",
};

// ── local YYYY-MM-DD for the last `n` days, oldest → newest ──────────────────
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}

export function Dashboard() {
  const { data, mutate } = useBridge();
  const now = new Date();
  const today = getToday();

  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<Priority>("P2");
  const [quickTag, setQuickTag] = useState<TaskTag>("@work");
  const [showQuickForm, setShowQuickForm] = useState(false);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const todayTasks = data.tasks.filter((t) => !t.done && (t.dueDate === today || !t.dueDate));
  const doneTodayCount = data.tasks.filter((t) => t.done && t.createdAt?.startsWith(today)).length;
  const completedHabitsToday = data.habitLogs.filter((l) => l.date === today && l.completed).length;
  const overallStreak = data.habits.length > 0
    ? Math.max(...data.habits.map((h) => calcStreak(data.habitLogs.filter((l) => l.habitId === h.id))), 0)
    : 0;
  const todayIncome = data.incomeEntries
    .filter((e) => e.date === today && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);
  const progress = data.dailyRevenueTarget > 0
    ? Math.min((todayIncome / data.dailyRevenueTarget) * 100, 100)
    : 0;

  // ── Real-data mini-series for the metric sparklines (no fabricated data) ─────
  const days14 = lastNDays(14);
  const tasksDoneSeries = days14.map((d) => data.tasks.filter((t) => t.done && t.createdAt?.startsWith(d)).length);
  const habitsSeries = days14.map((d) => data.habitLogs.filter((l) => l.date === d && l.completed).length);
  const revenueSeries = days14.map((d) =>
    data.incomeEntries.filter((e) => e.date === d && e.type === "income").reduce((s, e) => s + e.amount, 0),
  );

  // ── Portfolio ────────────────────────────────────────────────────────────────
  const snapshots = data.portfolioSnapshots ?? [];
  const last14 = snapshots.slice(-14);
  const portfolioSeries = last14.map((s) => s.totalAud);
  const currentPortfolio = snapshots[snapshots.length - 1]?.totalAud ?? null;
  const portfolioUp = last14.length >= 2 ? last14[last14.length - 1].totalAud >= last14[0].totalAud : true;
  const portfolioPct = last14.length >= 2 && last14[0].totalAud > 0
    ? ((last14[last14.length - 1].totalAud - last14[0].totalAud) / last14[0].totalAud) * 100
    : null;

  function addQuickTask() {
    if (!quickTitle.trim()) return;
    mutate((d) => ({
      ...d,
      tasks: [...d.tasks, {
        id: uid(), title: quickTitle.trim(),
        priority: quickPriority, tag: quickTag,
        dueDate: today, recurring: null, done: false,
        createdAt: new Date().toISOString(),
      }],
    }));
    setQuickTitle("");
  }

  function toggleTask(id: string) {
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  }

  const greetText = greeting(now);
  const activeProjects = data.projects.filter((p) => p.status === "active");

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
      {/* ── Greeting — sits directly on the canvas, subtle watermark on the right ── */}
      <header className="relative mb-6">
        <img
          src="/bridge-mark.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute right-0 -top-2 w-40 sm:w-56 opacity-[0.045] dark:opacity-[0.06]"
        />
        <p className="text-[13px] text-[var(--muted)] font-medium mb-1.5">{formatDate(now)}</p>
        <h1 className="text-[2rem] sm:text-[2.6rem] font-bold text-[var(--text)] leading-[1.05] tracking-tight">
          Good {greetText}, Lucas.
        </h1>
      </header>

      {/* ── Bridge AI prompt (model selector + Files + Data live inside) ── */}
      <div className="mb-6">
        <DashAskBar />
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        <MetricCard
          icon={<CheckSquare style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--muted)"
          label="Tasks Left" value={todayTasks.length.toString()} sub={`${doneTodayCount} done today`}
          series={tasksDoneSeries} seriesColor="var(--muted)" href="/tasks"
        />
        <MetricCard
          icon={<Repeat2 style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--c-emerald)"
          label="Habits" value={`${completedHabitsToday}/${data.habits.length}`} sub="done today"
          series={habitsSeries} seriesColor="var(--c-emerald)" href="/habits"
        />
        <MetricCard
          icon={<Flame style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--c-purple)"
          label="Streak" value={`${overallStreak}d`} sub="best in a row"
          series={habitsSeries} seriesColor="var(--c-purple)" href="/habits"
        />
        <MetricCard
          icon={<TrendingUp style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor={portfolioUp ? "var(--c-emerald)" : "var(--c-rose)"}
          label="Portfolio" value={currentPortfolio !== null ? formatAUD(currentPortfolio) : "—"}
          sub={portfolioPct == null ? "add wallets" : undefined}
          delta={portfolioPct == null ? undefined : { pct: portfolioPct, up: portfolioUp, note: "14d" }}
          series={portfolioSeries} seriesColor={portfolioUp ? "var(--c-emerald)" : "var(--c-rose)"} href="/finance"
        />
        <MetricCard
          icon={<Wallet style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--c-emerald)"
          label="Revenue" value={formatCurrency(todayIncome)} sub={`of ${formatCurrency(data.dailyRevenueTarget)}`}
          series={revenueSeries} seriesColor="var(--c-emerald)" href="/finance"
          footer={
            <div className="w-full bg-[var(--surface-2)] rounded-full h-1 mt-2 overflow-hidden">
              <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--c-emerald)" : "var(--text)" }} />
            </div>
          }
        />
      </div>

      {/* ── Hourly news briefing ── */}
      <DashNewsBriefing />

      {/* ── Tasks + Habits ── */}
      <div className="grid md:grid-cols-2 gap-3 mb-6">
        {/* Tasks Panel */}
        <section className="card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionTitle icon={<CheckSquare style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Today&apos;s Tasks</SectionTitle>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowQuickForm((v) => !v)} className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
              <Link href="/tasks" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
            </div>
          </div>

          {showQuickForm && (
            <div className="space-y-2">
              <input
                autoFocus
                className="field w-full px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]"
                placeholder="New task for today..."
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addQuickTask(); if (e.key === "Escape") setShowQuickForm(false); }}
              />
              <div className="flex gap-2 items-center">
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button key={p} onClick={() => setQuickPriority(p)}
                      className={cn("px-2 py-0.5 text-xs font-bold rounded-lg transition-colors",
                        quickPriority === p ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--chip)] text-[var(--faint)] hover:text-[var(--text)]")}
                    >{p}</button>
                  ))}
                </div>
                <select className="field flex-1 px-2 py-1 text-xs text-[var(--text)]" value={quickTag} onChange={(e) => setQuickTag(e.target.value as TaskTag)}>
                  {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={addQuickTask} className="btn-primary px-3 py-1 text-xs">Add</button>
              </div>
            </div>
          )}

          {todayTasks.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">{showQuickForm ? "Add a task above." : "All clear — hit + to add tasks."}</p>
          ) : (
            <ul className="flex flex-col -mx-2">
              {todayTasks
                .sort((a, b) => ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[a.priority] - ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[b.priority])
                .slice(0, 6)
                .map((task) => (
                  <li key={task.id} className="flex items-center gap-3 group rounded-lg px-2 py-2 hover:bg-[var(--surface-2)] transition-colors">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0 text-[var(--faint)] hover:text-[var(--text)] transition-colors">
                      <Circle style={{ width: 16, height: 16 }} />
                    </button>
                    <span className="flex-1 text-sm text-[var(--text)] truncate">{task.title}</span>
                    <PriorityBadge priority={task.priority} />
                  </li>
                ))}
              {todayTasks.length > 6 && (
                <li className="px-2 pt-1"><Link href="/tasks" className="text-xs text-[var(--muted)] hover:text-[var(--text)] font-medium">+{todayTasks.length - 6} more →</Link></li>
              )}
            </ul>
          )}
        </section>

        {/* Habits Panel */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle icon={<Repeat2 style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Today&apos;s Habits</SectionTitle>
            <Link href="/habits" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {data.habits.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">No habits yet.</p>
          ) : (
            <ul className="flex flex-col -mx-2">
              {data.habits.slice(0, 5).map((habit) => {
                const done = data.habitLogs.some((l) => l.habitId === habit.id && l.date === today && l.completed);
                const streak = calcStreak(data.habitLogs.filter((l) => l.habitId === habit.id));
                return (
                  <li key={habit.id} className="flex items-center gap-3 text-sm rounded-lg px-2 py-2 hover:bg-[var(--surface-2)] transition-colors">
                    <span className={cn("w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 transition-all",
                      done ? "bg-[var(--c-emerald)] border-[var(--c-emerald)]" : "border-[var(--border-2)]")} style={{ width: 18, height: 18 }}>
                      {done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--bg)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    <span className={cn("flex-1 truncate", done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{habit.name}</span>
                    {streak > 0 && <span className="text-[11px] text-[var(--faint)] tabular shrink-0">{streak}d</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── Active Projects ── */}
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={<FolderKanban style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Active Projects</SectionTitle>
        <Link href="/projects" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {activeProjects.slice(0, 7).map((proj) => {
          const taskCount = data.tasks.filter((t) => t.projectId === proj.id && !t.done).length;
          return (
            <Link key={proj.id} href={`/projects/${proj.id}`} className="group card card-hover p-4 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="w-9 h-9 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[15px] font-semibold text-[var(--text)]">
                  {proj.name.charAt(0).toUpperCase()}
                </span>
                {taskCount > 0 && <span className="text-[11px] font-medium text-[var(--muted)] tabular">{taskCount} open</span>}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">{proj.name}</p>
                <p className="text-[11px] text-[var(--muted)] mt-1 font-medium capitalize flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", COLOR_DOT[proj.color] ?? "bg-[var(--c-indigo)]")} />
                  {proj.category} · {proj.status}
                </p>
              </div>
            </Link>
          );
        })}
        {/* New Project tile */}
        <Link href="/projects" className="group card card-hover p-4 flex flex-col items-center justify-center gap-2 min-h-[112px] border-dashed text-[var(--faint)] hover:text-[var(--text)]">
          <Plus className="w-5 h-5" strokeWidth={1.8} />
          <span className="text-xs font-medium">New Project</span>
        </Link>
      </div>
    </div>
  );
}

// ── Section title: small outline icon + medium bold label ────────────────────
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--text)] tracking-tight">
      <span className="text-[var(--muted)]">{icon}</span>
      {children}
    </h2>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 tabular",
      priority === "P1" ? "bg-[color-mix(in_srgb,var(--c-rose)_16%,transparent)] text-[var(--c-rose)]"
      : priority === "P2" ? "bg-[var(--chip)] text-[var(--muted)]"
      : "bg-[var(--chip)] text-[var(--faint)]"
    )}>{priority}</span>
  );
}

// ── Lightweight inline sparkline (no chart lib) ──────────────────────────────
function Sparkline({ data, color, className }: { data: number[]; color: string; className?: string }) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2 || pts.every((n) => n === pts[0])) return null;
  const w = 88, h = 30, pad = 2;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const coords = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h} L${coords[0][0].toFixed(1)},${h} Z`;
  const gid = `sg-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({
  icon, iconColor, label, value, sub, delta, series, seriesColor, href, footer,
}: {
  icon: React.ReactNode; iconColor: string; label: string; value: string;
  sub?: string; delta?: { pct: number; up: boolean; note: string };
  series: number[]; seriesColor: string; href: string; footer?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group card card-hover p-4 relative overflow-hidden block min-h-[132px]">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <p className="text-[1.7rem] font-bold text-[var(--text)] tabular leading-none truncate">{value}</p>
      {delta ? (
        <p className="text-[11.5px] mt-2.5 font-medium tabular flex items-center gap-1" style={{ color: delta.up ? "var(--c-emerald)" : "var(--c-rose)" }}>
          {delta.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {Math.abs(delta.pct).toFixed(1)}% <span className="text-[var(--faint)]">· {delta.note}</span>
        </p>
      ) : sub ? (
        <p className="text-[11.5px] text-[var(--faint)] mt-2.5 font-medium">{sub}</p>
      ) : null}
      {footer}
      <div className="absolute bottom-3.5 right-3.5 w-[128px] h-[42px] opacity-90 pointer-events-none">
        <Sparkline data={series} color={seriesColor} className="w-full h-full" />
      </div>
    </Link>
  );
}

// Hourly AI news briefing, condensed for the dashboard.
function DashNewsBriefing() {
  const [state, setState] = useState<{ loading: boolean; summary?: string; error?: string }>({ loading: true });
  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    fetch("/api/news/summary")
      .then((r) => r.json())
      .then((j) => setState(j.ok ? { loading: false, summary: j.summary } : { loading: false, error: j.error || "Couldn't load the briefing." }))
      .catch((e) => setState({ loading: false, error: String(e) }));
  };
  useEffect(load, []);
  return (
    <section className="mb-3 card p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={<Newspaper style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>News briefing</SectionTitle>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={state.loading} title="Refresh" className="rounded p-1 text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-40"><RefreshCw className={cn("w-3.5 h-3.5", state.loading && "animate-spin")} /></button>
          <Link href="/news" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
        </div>
      </div>
      {state.loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--faint)]"><Loader2 className="w-4 h-4 animate-spin" /> Summarising the latest headlines…</div>
      ) : state.error ? (
        <p className="text-[13px] text-[var(--faint)]">{state.error}</p>
      ) : (
        <div className="nx-md text-[13px] max-h-[280px] overflow-y-auto pr-1" dangerouslySetInnerHTML={{ __html: mdToHtml(state.summary || "") }} />
      )}
    </section>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
