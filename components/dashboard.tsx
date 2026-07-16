"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, formatAUD, formatCurrency, formatDate, getToday, calcStreak } from "@/lib/utils";
import type { Priority, TaskTag } from "@/lib/store";
import { Repeat2, DollarSign, TrendingUp, TrendingDown, Zap, Plus, Circle, CheckSquare, LayoutGrid, NotebookText, Sparkles, Dumbbell, Lightbulb, Newspaper, Loader2, RefreshCw, FolderKanban } from "lucide-react";
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

  // ── Portfolio ────────────────────────────────────────────────────────────────
  const snapshots = data.portfolioSnapshots ?? [];
  const last14 = snapshots.slice(-14);
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

  return (
    <div className="p-4 sm:p-6 max-w-none">
      {/* ── Header (image hero + AI ask bar) ── */}
      <div className="relative mb-5 overflow-hidden rounded-3xl border border-[var(--border)] px-6 py-9 sm:px-10 sm:py-11 bg-cover bg-center" style={{ backgroundImage: "url('/dashboard-bg.jpg')" }}>
        {/* scrim for text legibility over the photo */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/55" aria-hidden="true" />
        <div className="relative text-center">
          <p className="text-[11px] font-semibold text-white/70 uppercase tracking-[0.18em] mb-2">{formatDate(now)}</p>
          <h1 className="text-[2rem] sm:text-[2.5rem] font-bold text-white leading-none tracking-tight drop-shadow-sm">
            Good {greetText}, Lucas<span className="text-[var(--accent)]">.</span>
          </h1>
          {/* AI ask bar — model, files, Data + Web toggles, hands off to Chat */}
          <DashAskBar />
        </div>
      </div>

      {/* ── Stat cards (Portfolio + Revenue relocated here, compact) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard accent="indigo" icon={<CheckSquare style={{ width: 15, height: 15 }} />} label="Tasks Left" value={todayTasks.length.toString()} sub={`${doneTodayCount} done today`} />
        <StatCard accent="yellow" icon={<Repeat2 style={{ width: 15, height: 15 }} />} label="Habits" value={`${completedHabitsToday}/${data.habits.length}`} sub="done today" />
        <StatCard accent="emerald" icon={<TrendingUp style={{ width: 15, height: 15 }} />} label="Streak" value={`${overallStreak}d`} sub="best in a row" />
        {/* Portfolio — compact */}
        <Link href="/finance" className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border-2)] transition-all relative overflow-hidden block">
          <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: portfolioUp ? "var(--c-emerald)" : "var(--c-rose)" }} />
          <div className="flex items-center gap-2 mb-3 mt-1">
            <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${portfolioUp ? "var(--c-emerald)" : "var(--c-rose)"} 15%, transparent)`, color: portfolioUp ? "var(--c-emerald)" : "var(--c-rose)" }}>{portfolioUp ? <TrendingUp style={{ width: 15, height: 15 }} /> : <TrendingDown style={{ width: 15, height: 15 }} />}</div>
            <span className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold leading-tight">Portfolio</span>
          </div>
          <p className="text-[1.35rem] font-bold text-[var(--text)] tabular leading-none truncate">{currentPortfolio !== null ? formatAUD(currentPortfolio) : "—"}</p>
          <p className="text-[11px] mt-1.5 font-medium tabular" style={{ color: portfolioPct == null ? "var(--faint)" : portfolioUp ? "var(--c-emerald)" : "var(--c-rose)" }}>{portfolioPct == null ? "add wallets" : `${portfolioPct >= 0 ? "+" : ""}${portfolioPct.toFixed(1)}% · 14d`}</p>
        </Link>
        {/* Revenue — compact with mini progress */}
        <Link href="/finance" className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border-2)] transition-all relative overflow-hidden block">
          <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: "var(--accent)" }} />
          <div className="flex items-center gap-2 mb-3 mt-1">
            <div className="p-1.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}><DollarSign style={{ width: 15, height: 15 }} /></div>
            <span className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold leading-tight">Revenue</span>
          </div>
          <p className="text-[1.35rem] font-bold text-[var(--text)] tabular leading-none truncate">{formatCurrency(todayIncome)}</p>
          <div className="w-full bg-[var(--chip)] rounded-full h-1 my-1.5 overflow-hidden"><div className="h-1 rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--c-emerald)" : "var(--accent)" }} /></div>
          <p className="text-[11px] text-[var(--faint)] font-medium tabular">of {formatCurrency(data.dailyRevenueTarget)}</p>
        </Link>
      </div>

      {/* ── Hourly news briefing ── */}
      <DashNewsBriefing />

      {/* ── Main grid: Tasks + Habits/Projects ── */}
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {/* Tasks Panel */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-4 hover:border-[var(--border)] transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-[var(--accent)]" />
              <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Today&apos;s Tasks</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowQuickForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
              <Link href="/tasks" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium">All →</Link>
            </div>
          </div>

          {showQuickForm && (
            <div className="space-y-2">
              <input
                autoFocus
                className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
                placeholder="New task for today..."
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addQuickTask();
                  if (e.key === "Escape") setShowQuickForm(false);
                }}
              />
              <div className="flex gap-2 items-center">
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button key={p} onClick={() => setQuickPriority(p)}
                      className={cn("px-2 py-0.5 text-xs font-bold rounded-lg transition-colors",
                        quickPriority === p
                          ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text)]"
                          : "bg-[var(--chip)] text-[var(--faint)] hover:bg-[var(--chip)]"
                      )}
                    >{p}</button>
                  ))}
                </div>
                <select
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-0.5 text-xs text-[var(--text)] focus:outline-none"
                  value={quickTag}
                  onChange={(e) => setQuickTag(e.target.value as TaskTag)}
                >
                  {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={addQuickTask} className="px-3 py-0.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs rounded-lg transition-colors font-medium">Add</button>
              </div>
            </div>
          )}

          {todayTasks.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">{showQuickForm ? "Add a task above." : "All clear — hit + to add tasks."}</p>
          ) : (
            <ul className="space-y-2">
              {todayTasks
                .sort((a, b) => ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[a.priority] - ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[b.priority])
                .slice(0, 8)
                .map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 group">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0 text-[var(--faint)] hover:text-[var(--text)] transition-colors">
                      <Circle style={{ width: 15, height: 15 }} />
                    </button>
                    <span className="flex-1 text-sm text-[var(--text)] truncate font-medium">{task.title}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                      task.priority === "P1" ? "bg-[var(--chip)] text-[var(--text)]"
                      : task.priority === "P2" ? "bg-[var(--chip)] text-[var(--text)]"
                      : "bg-[var(--chip)] text-[var(--faint)]"
                    )}>{task.priority}</span>
                  </li>
                ))}
              {todayTasks.length > 8 && (
                <li><Link href="/tasks" className="text-xs text-[var(--text)] hover:text-[var(--text)] font-medium">+{todayTasks.length - 8} more →</Link></li>
              )}
            </ul>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-3">
          {/* Habits */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--border)] transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 rounded-full bg-[var(--accent)]" />
                <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Today&apos;s Habits</h2>
              </div>
              <Link href="/habits" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium">All →</Link>
            </div>
            {data.habits.length === 0 ? (
              <p className="text-sm text-[var(--faint)]">No habits yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.habits.slice(0, 4).map((habit) => {
                  const done = data.habitLogs.some((l) => l.habitId === habit.id && l.date === today && l.completed);
                  return (
                    <li key={habit.id} className="flex items-center gap-2.5 text-sm">
                      <span className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all",
                        done ? "bg-[var(--text)] border-[var(--border-2)] shadow-none" : "border-[var(--border)]"
                      )}>
                        {done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className={cn("font-medium", done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{habit.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Projects (big tiles) ── */}
      {data.projects.filter((p) => p.status === "active").length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 rounded-full bg-[var(--accent)]" />
              <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Active Projects</h2>
            </div>
            <Link href="/projects" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium">All →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {data.projects.filter((p) => p.status === "active").slice(0, 8).map((proj) => {
              const taskCount = data.tasks.filter((t) => t.projectId === proj.id && !t.done).length;
              return (
                <Link key={proj.id} href={`/projects/${proj.id}`}
                  className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border-2)] transition-all flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center", COLOR_DOT[proj.color] ?? "bg-[var(--c-indigo)]")}>
                      <FolderKanban className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                    </span>
                    {taskCount > 0 && <span className="text-[11px] font-semibold text-[var(--muted)] bg-[var(--chip)] rounded-full px-2 py-0.5 tabular">{taskCount} open</span>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">{proj.name}</p>
                    <p className="text-[11px] text-[var(--faint)] mt-0.5 font-medium capitalize">{proj.category} · {proj.status}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ── Quick access ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-5 rounded-full bg-[var(--accent)]" />
        <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Quick access</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickTile href="/focus"   hue="var(--c-amber)"   icon={<Zap style={{ width: 18, height: 18 }} strokeWidth={2} />}          label="Deep Work"    sub="Start a session" />
        <QuickTile href="/chat"    hue="var(--c-indigo)"  icon={<Sparkles style={{ width: 18, height: 18 }} strokeWidth={2} />}     label="AI Chat"      sub="Ask anything" />
        <QuickTile href="/gym"     hue="var(--c-rose)"    icon={<Dumbbell style={{ width: 18, height: 18 }} strokeWidth={2} />}     label="Gym"          sub="Track workouts" />
        <QuickTile href="/learn"   hue="var(--c-purple)"  icon={<Lightbulb style={{ width: 18, height: 18 }} strokeWidth={2} />}    label="Learn"        sub="Build a course" />
        <QuickTile href="/vision"  hue="var(--c-pink)"    icon={<LayoutGrid style={{ width: 18, height: 18 }} strokeWidth={2} />}   label="Vision Board" sub="Photos & notes" />
        <QuickTile href="/notes"   hue="var(--c-cyan)"    icon={<NotebookText style={{ width: 18, height: 18 }} strokeWidth={2} />} label="Notes"        sub="Pages & graph" />
        <QuickTile href="/finance" hue="var(--c-emerald)" icon={<DollarSign style={{ width: 18, height: 18 }} strokeWidth={2} />}   label="Finance"      sub="Money & crypto" />
        <QuickTile href="/news"    hue="var(--c-blue)"    icon={<Newspaper style={{ width: 18, height: 18 }} strokeWidth={2} />}    label="News"         sub="Markets & feeds" />
      </div>
    </div>
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
    <div className="mb-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-[var(--accent)]" />
          <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight flex items-center gap-1.5"><Newspaper className="w-3.5 h-3.5 text-[var(--c-blue)]" /> News briefing</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={state.loading} title="Refresh" className="rounded p-1 text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-40"><RefreshCw className={cn("w-3.5 h-3.5", state.loading && "animate-spin")} /></button>
          <Link href="/news" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium">All →</Link>
        </div>
      </div>
      {state.loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--faint)]"><Loader2 className="w-4 h-4 animate-spin" /> Summarising the latest headlines…</div>
      ) : state.error ? (
        <p className="text-[13px] text-[var(--faint)]">{state.error}</p>
      ) : (
        <div className="nx-md text-[13px] max-h-[280px] overflow-y-auto pr-1" dangerouslySetInnerHTML={{ __html: mdToHtml(state.summary || "") }} />
      )}
    </div>
  );
}

function QuickTile({ href, icon, label, sub, hue }: { href: string; icon: React.ReactNode; label: string; sub: string; hue?: string }) {
  return (
    <Link
      href={href}
      className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border-2)] transition-all flex flex-col gap-3"
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={hue ? { background: `color-mix(in srgb, ${hue} 15%, transparent)`, color: hue } : undefined}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text)] tracking-tight">{label}</p>
        <p className="text-[11px] text-[var(--faint)] mt-0.5 font-medium">{sub}</p>
      </div>
    </Link>
  );
}

function StatCard({
  accent, icon, label, value, sub,
}: {
  accent: "indigo" | "cyan" | "yellow" | "emerald";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  const hue = { indigo: "var(--c-indigo)", cyan: "var(--c-cyan)", yellow: "var(--c-amber)", emerald: "var(--c-emerald)" }[accent];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--border-2)] transition-all relative overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: hue }} />
      <div className="flex items-center gap-2 mb-3 mt-1">
        <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${hue} 15%, transparent)`, color: hue }}>{icon}</div>
        <span className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold leading-tight">{label}</span>
      </div>
      <p className="text-[1.6rem] font-bold text-[var(--text)] tabular leading-none">{value}</p>
      <p className="text-[11px] text-[var(--faint)] mt-1.5 font-medium">{sub}</p>
    </div>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
