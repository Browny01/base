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
      {/* ── Hero — polished graphite, same material as the app icon ── */}
      <div className="lg-hero mb-5 px-6 py-9 sm:px-10 sm:py-12">
        {/* ghosted metallic bridge mark */}
        <img
          src="/bridge-mark.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -right-8 top-1/2 -translate-y-1/2 w-44 sm:w-64 opacity-[0.16] rotate-[8deg]"
          style={{ maskImage: "linear-gradient(100deg, transparent 0%, #000 45%)", WebkitMaskImage: "linear-gradient(100deg, transparent 0%, #000 45%)" }}
        />
        <div className="relative text-center">
          <p className="inline-block lg-pill rounded-full px-3 py-1 text-[10px] font-semibold text-white/65 uppercase tracking-[0.2em] mb-4">{formatDate(now)}</p>
          <h1 className="text-[2.1rem] sm:text-[2.75rem] font-bold leading-none tracking-tight">
            <span className="metal-text metal-shine">Good {greetText}, Lucas.</span>
          </h1>
          {/* AI ask bar — model, files, Data + Web toggles, hands off to Chat */}
          <DashAskBar />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard icon={<CheckSquare style={{ width: 15, height: 15 }} />} label="Tasks Left" value={todayTasks.length.toString()} sub={`${doneTodayCount} done today`} />
        <StatCard icon={<Repeat2 style={{ width: 15, height: 15 }} />} label="Habits" value={`${completedHabitsToday}/${data.habits.length}`} sub="done today" />
        <StatCard icon={<TrendingUp style={{ width: 15, height: 15 }} />} label="Streak" value={`${overallStreak}d`} sub="best in a row" />
        {/* Portfolio — up/down keeps its semantic colour */}
        <Link href="/finance" className="lg-card p-4 block">
          <div className="flex items-center gap-2 mb-3">
            <div className="lg-icon w-7 h-7" style={{ color: portfolioUp ? "var(--c-emerald)" : "var(--c-rose)" }}>{portfolioUp ? <TrendingUp style={{ width: 15, height: 15 }} /> : <TrendingDown style={{ width: 15, height: 15 }} />}</div>
            <span className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold leading-tight">Portfolio</span>
          </div>
          <p className="text-[1.35rem] font-bold text-[var(--text)] tabular leading-none truncate">{currentPortfolio !== null ? formatAUD(currentPortfolio) : "—"}</p>
          <p className="text-[11px] mt-1.5 font-medium tabular" style={{ color: portfolioPct == null ? "var(--faint)" : portfolioUp ? "var(--c-emerald)" : "var(--c-rose)" }}>{portfolioPct == null ? "add wallets" : `${portfolioPct >= 0 ? "+" : ""}${portfolioPct.toFixed(1)}% · 14d`}</p>
        </Link>
        {/* Revenue — brushed-steel progress */}
        <Link href="/finance" className="lg-card p-4 block">
          <div className="flex items-center gap-2 mb-3">
            <div className="lg-icon w-7 h-7"><DollarSign style={{ width: 15, height: 15 }} /></div>
            <span className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold leading-tight">Revenue</span>
          </div>
          <p className="text-[1.35rem] font-bold text-[var(--text)] tabular leading-none truncate">{formatCurrency(todayIncome)}</p>
          <div className="w-full bg-[var(--chip-2)] rounded-full h-1.5 my-1.5 overflow-hidden">
            <div className={cn("h-1.5 rounded-full transition-all duration-700", progress < 100 && "metal-fill")} style={{ width: `${progress}%`, background: progress >= 100 ? "var(--c-emerald)" : undefined }} />
          </div>
          <p className="text-[11px] text-[var(--faint)] font-medium tabular">of {formatCurrency(data.dailyRevenueTarget)}</p>
        </Link>
      </div>

      {/* ── Hourly news briefing ── */}
      <DashNewsBriefing />

      {/* ── Main grid: Tasks + Habits/Projects ── */}
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        {/* Tasks Panel */}
        <div className="lg-card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="metal-bar" />
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
          <div className="lg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="metal-bar" />
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
                        done ? "bg-[var(--text)] border-[var(--border-2)] shadow-none" : "border-[var(--border-2)]"
                      )}>
                        {done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--bg)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
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
            <div className="flex items-center gap-2.5">
              <div className="metal-bar" />
              <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Active Projects</h2>
            </div>
            <Link href="/projects" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium">All →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {data.projects.filter((p) => p.status === "active").slice(0, 8).map((proj) => {
              const taskCount = data.tasks.filter((t) => t.projectId === proj.id && !t.done).length;
              return (
                <Link key={proj.id} href={`/projects/${proj.id}`}
                  className="group lg-card p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="lg-icon w-9 h-9">
                      <FolderKanban className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    {taskCount > 0 && <span className="text-[11px] font-semibold text-[var(--muted)] bg-[var(--chip)] rounded-full px-2 py-0.5 tabular">{taskCount} open</span>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">{proj.name}</p>
                    <p className="text-[11px] text-[var(--faint)] mt-0.5 font-medium capitalize flex items-center gap-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", COLOR_DOT[proj.color] ?? "bg-[var(--c-indigo)]")} />
                      {proj.category} · {proj.status}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ── Quick access ── */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="metal-bar" />
        <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight">Quick access</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickTile href="/focus"   icon={<Zap style={{ width: 18, height: 18 }} strokeWidth={2} />}          label="Deep Work"    sub="Start a session" />
        <QuickTile href="/chat"    icon={<Sparkles style={{ width: 18, height: 18 }} strokeWidth={2} />}     label="AI Chat"      sub="Ask anything" />
        <QuickTile href="/gym"     icon={<Dumbbell style={{ width: 18, height: 18 }} strokeWidth={2} />}     label="Gym"          sub="Track workouts" />
        <QuickTile href="/learn"   icon={<Lightbulb style={{ width: 18, height: 18 }} strokeWidth={2} />}    label="Learn"        sub="Build a course" />
        <QuickTile href="/vision"  icon={<LayoutGrid style={{ width: 18, height: 18 }} strokeWidth={2} />}   label="Vision Board" sub="Photos & notes" />
        <QuickTile href="/notes"   icon={<NotebookText style={{ width: 18, height: 18 }} strokeWidth={2} />} label="Notes"        sub="Pages & graph" />
        <QuickTile href="/finance" icon={<DollarSign style={{ width: 18, height: 18 }} strokeWidth={2} />}   label="Finance"      sub="Money & crypto" />
        <QuickTile href="/news"    icon={<Newspaper style={{ width: 18, height: 18 }} strokeWidth={2} />}    label="News"         sub="Markets & feeds" />
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
    <div className="mb-4 lg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="metal-bar" />
          <h2 className="font-semibold text-[var(--text)] text-sm tracking-tight flex items-center gap-1.5"><Newspaper className="w-3.5 h-3.5 text-[var(--muted)]" /> News briefing</h2>
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

function QuickTile({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group lg-card p-4 flex flex-col gap-3"
    >
      <div className="lg-icon w-10 h-10">
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
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="lg-card lg-card-int p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="lg-icon w-7 h-7">{icon}</div>
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
