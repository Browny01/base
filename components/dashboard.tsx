"use client";

import { useId, useState, useEffect, useRef } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, formatCurrency, formatDate, getToday } from "@/lib/utils";
import type { Priority, Task, TaskTag } from "@/lib/store";
import { Plus, Circle, CheckSquare, Wallet, Newspaper, Loader2, RefreshCw, FolderKanban, ArrowRight, ArrowUpRight, ArrowDownRight, Grip, SlidersHorizontal, RotateCcw, X, Check, Timer, NotebookText, CreditCard } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { mdToHtml } from "@/lib/markdown";
import { ProjectLogo } from "@/components/project-logo";
import { Responsive, noCompactor, useContainerWidth, type Layout, type ResponsiveLayouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const PRIORITIES: Priority[] = ["P1", "P2", "P3"];
const TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];

type DashboardBreakpoint = "lg" | "md" | "sm" | "xs" | "xxs";
type WidgetId = "tasks-metric" | "revenue-metric" | "news" | "tasks" | "projects" | "focus" | "notes" | "payments";

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "tasks-metric", label: "Tasks left" },
  { id: "revenue-metric", label: "Revenue" },
  { id: "news", label: "News briefing" },
  { id: "tasks", label: "Today's tasks" },
  { id: "projects", label: "Projects" },
  { id: "focus", label: "Focus today" },
  { id: "notes", label: "Recent notes" },
  { id: "payments", label: "Upcoming payments" },
];

const DEFAULT_WIDGET_IDS: WidgetId[] = ["tasks-metric", "revenue-metric", "news", "tasks", "projects"];

const BREAKPOINTS: Record<DashboardBreakpoint, number> = { lg: 1180, md: 900, sm: 680, xs: 420, xxs: 0 };
const GRID_COLUMNS: Record<DashboardBreakpoint, number> = { lg: 12, md: 8, sm: 6, xs: 4, xxs: 2 };
const DASHBOARD_LAYOUT_KEY = "bridge_dashboard_layout_v1";
const DASHBOARD_LAYOUT_VERSION = 2;

const DEFAULT_LAYOUTS: ResponsiveLayouts<DashboardBreakpoint> = {
  lg: [
    { i: "tasks-metric", x: 0, y: 0, w: 3, h: 4, minW: 2, minH: 4 },
    { i: "revenue-metric", x: 3, y: 0, w: 3, h: 4, minW: 2, minH: 4 },
    { i: "news", x: 0, y: 4, w: 12, h: 6, minW: 4, minH: 4 },
    { i: "tasks", x: 0, y: 10, w: 6, h: 11, minW: 3, minH: 6 },
    { i: "projects", x: 0, y: 21, w: 12, h: 9, minW: 4, minH: 6 },
    { i: "focus", x: 0, y: 30, w: 4, h: 8, minW: 3, minH: 6 },
    { i: "notes", x: 4, y: 30, w: 4, h: 8, minW: 3, minH: 6 },
    { i: "payments", x: 8, y: 30, w: 4, h: 8, minW: 3, minH: 6 },
  ],
  md: [
    { i: "tasks-metric", x: 0, y: 0, w: 2, h: 4, minW: 2, minH: 4 },
    { i: "revenue-metric", x: 2, y: 0, w: 2, h: 4, minW: 2, minH: 4 },
    { i: "news", x: 0, y: 4, w: 8, h: 6, minW: 4, minH: 4 },
    { i: "tasks", x: 0, y: 10, w: 4, h: 11, minW: 3, minH: 6 },
    { i: "projects", x: 0, y: 21, w: 8, h: 9, minW: 4, minH: 6 },
    { i: "focus", x: 0, y: 30, w: 4, h: 8, minW: 3, minH: 6 },
    { i: "notes", x: 4, y: 30, w: 4, h: 8, minW: 3, minH: 6 },
    { i: "payments", x: 0, y: 38, w: 4, h: 8, minW: 3, minH: 6 },
  ],
  sm: [], xs: [], xxs: [],
};

function stackedLayout(cols: number): Layout {
  const metricWidth = cols >= 4 ? Math.floor(cols / 2) : cols;
  const metricsPerRow = Math.max(1, Math.floor(cols / metricWidth));
  const contentStart = Math.ceil(4 / metricsPerRow) * 4;
  let contentY = contentStart;
  return WIDGETS.map(({ id }, index) => {
    const isMetric = id.endsWith("metric");
    const metricIndex = WIDGETS.slice(0, index).filter((widget) => widget.id.endsWith("metric")).length;
    const height = isMetric ? 4 : id === "news" ? 6 : id === "tasks" || id === "projects" ? 11 : 8;
    const y = isMetric ? Math.floor(metricIndex / metricsPerRow) * 4 : contentY;
    if (!isMetric) contentY += height;
    return {
      i: id,
      x: isMetric ? (metricIndex % metricsPerRow) * metricWidth : 0,
      y,
      w: isMetric ? metricWidth : cols,
      h: height,
      minW: isMetric ? Math.min(2, cols) : Math.min(3, cols),
      minH: isMetric ? 4 : 6,
    };
  });
}

DEFAULT_LAYOUTS.sm = stackedLayout(GRID_COLUMNS.sm);
DEFAULT_LAYOUTS.xs = stackedLayout(GRID_COLUMNS.xs);
DEFAULT_LAYOUTS.xxs = stackedLayout(GRID_COLUMNS.xxs);

function migrateDashboardPreferences(saved: {
  version?: number;
  layouts?: ResponsiveLayouts<DashboardBreakpoint>;
  visibleWidgets?: WidgetId[];
}) {
  if ((saved.version ?? 1) >= DASHBOARD_LAYOUT_VERSION) return saved;

  const visible = (saved.visibleWidgets ?? DEFAULT_WIDGET_IDS).filter((id) => WIDGETS.some((widget) => widget.id === id));

  const sourceLayouts = saved.layouts ?? DEFAULT_LAYOUTS;
  const migratedLayouts = Object.fromEntries(
    (Object.keys(GRID_COLUMNS) as DashboardBreakpoint[]).map((breakpoint) => {
      const layout = [...(sourceLayouts[breakpoint] ?? DEFAULT_LAYOUTS[breakpoint] ?? [])];
      return [breakpoint, layout];
    }),
  ) as ResponsiveLayouts<DashboardBreakpoint>;

  return { version: DASHBOARD_LAYOUT_VERSION, layouts: migratedLayouts, visibleWidgets: visible };
}

const COLOR_DOT: Record<string, string> = {
  indigo: "bg-[var(--c-indigo)]", cyan: "bg-[var(--c-cyan)]", emerald: "bg-[var(--c-emerald)]",
  yellow: "bg-[var(--c-amber)]",  red: "bg-[var(--c-rose)]",  purple: "bg-[var(--c-purple)]",
  orange: "bg-[var(--c-orange)]", pink: "bg-[var(--c-pink)]",
};

function taskCompletionDay(task: Task): string {
  return (task.completedAt ?? task.createdAt).slice(0, 10);
}

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
  const [editing, setEditing] = useState(false);
  const [layouts, setLayouts] = useState<ResponsiveLayouts<DashboardBreakpoint>>(DEFAULT_LAYOUTS);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(DEFAULT_WIDGET_IDS);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const layoutLoaded = useRef(false);
  const { width: gridWidth, containerRef: gridContainerRef, mounted: gridMounted } = useContainerWidth({ measureBeforeMount: true });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_KEY) || "null") as {
          version?: number;
          layouts?: ResponsiveLayouts<DashboardBreakpoint>;
          visibleWidgets?: WidgetId[];
        } | null;
        const preferences = saved ? migrateDashboardPreferences(saved) : null;
        if (preferences?.layouts) setLayouts(preferences.layouts);
        if (preferences?.visibleWidgets) {
          const valid = preferences.visibleWidgets.filter((id) => WIDGETS.some((widget) => widget.id === id));
          setVisibleWidgets(valid);
        }
        if (preferences && preferences.version !== saved?.version) {
          localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(preferences));
        }
      } catch {
        // Ignore malformed local preferences and use the polished default layout.
      }
      layoutLoaded.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditing(false);
        setShowWidgetPicker(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing]);

  function persistDashboard(nextLayouts: ResponsiveLayouts<DashboardBreakpoint>, nextVisible = visibleWidgets) {
    if (!layoutLoaded.current) return;
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify({ version: DASHBOARD_LAYOUT_VERSION, layouts: nextLayouts, visibleWidgets: nextVisible }));
  }

  function removeWidget(id: WidgetId) {
    const nextVisible = visibleWidgets.filter((widgetId) => widgetId !== id);
    setVisibleWidgets(nextVisible);
    persistDashboard(layouts, nextVisible);
  }

  function addWidget(id: WidgetId) {
    if (visibleWidgets.includes(id)) return;
    const nextVisible = [...visibleWidgets, id];
    const nextLayouts = Object.fromEntries(
      (Object.keys(GRID_COLUMNS) as DashboardBreakpoint[]).map((breakpoint) => {
        const existing = [...(layouts[breakpoint] || [])];
        if (!existing.some((item) => item.i === id)) {
          const source = DEFAULT_LAYOUTS[breakpoint]?.find((item) => item.i === id);
          const bottom = existing.reduce((max, item) => Math.max(max, item.y + item.h), 0);
          existing.push({ ...(source || { i: id, x: 0, y: bottom, w: GRID_COLUMNS[breakpoint], h: 6 }), y: bottom });
        }
        return [breakpoint, existing];
      }),
    ) as ResponsiveLayouts<DashboardBreakpoint>;
    setVisibleWidgets(nextVisible);
    setLayouts(nextLayouts);
    persistDashboard(nextLayouts, nextVisible);
  }

  function resetDashboard() {
    const nextVisible = DEFAULT_WIDGET_IDS;
    setLayouts(DEFAULT_LAYOUTS);
    setVisibleWidgets(nextVisible);
    persistDashboard(DEFAULT_LAYOUTS, nextVisible);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const todayTasks = data.tasks.filter((t) => !t.done && (t.dueDate === today || !t.dueDate));
  const doneTodayCount = data.tasks.filter((t) => t.done && taskCompletionDay(t) === today).length;
  const todayIncome = data.incomeEntries
    .filter((e) => e.date === today && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);
  const progress = data.dailyRevenueTarget > 0
    ? Math.min((todayIncome / data.dailyRevenueTarget) * 100, 100)
    : 0;

  // ── Real-data mini-series for the metric sparklines (no fabricated data) ─────
  const days14 = lastNDays(14);
  const tasksDoneSeries = days14.map((d) => data.tasks.filter((t) => t.done && taskCompletionDay(t) === d).length);
  const revenueSeries = days14.map((d) =>
    data.incomeEntries.filter((e) => e.date === d && e.type === "income").reduce((s, e) => s + e.amount, 0),
  );

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
    mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        return { ...t, done, completedAt: done ? new Date().toISOString() : null };
      }),
    }));
  }

  const greetText = greeting(now);
  const overviewProjects = data.projects.filter((p) => !p.archived);
  const todayFocusSessions = data.focusSessions.filter((session) => session.date === today);
  const todayFocusMinutes = todayFocusSessions.reduce((sum, session) => sum + session.durationMins, 0);
  const recentNotes = (data.wikiPages ?? []).filter((page) => !page.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const upcomingPayments = data.subscriptions.filter((subscription) => subscription.active).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "tasks-metric":
        return <MetricCard icon={<CheckSquare style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--muted)" label="Tasks Left" value={todayTasks.length.toString()} sub={`${doneTodayCount} done today`} series={tasksDoneSeries} seriesColor="var(--muted)" href="/tasks" />;
      case "revenue-metric":
        return (
          <MetricCard
            icon={<Wallet style={{ width: 16, height: 16 }} strokeWidth={1.9} />}
            iconColor="var(--c-emerald)"
            label="Revenue"
            value={formatCurrency(todayIncome)}
            sub={`of ${formatCurrency(data.dailyRevenueTarget)}`}
            series={revenueSeries}
            seriesColor="var(--c-emerald)"
            href="/finance"
            footer={<div className="w-full bg-[var(--surface-2)] rounded-full h-1 mt-2 overflow-hidden"><div className="h-1 rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--c-emerald)" : "var(--text)" }} /></div>}
          />
        );
      case "news":
        return <DashNewsBriefing />;
      case "tasks":
        return (
          <section className="card h-full p-5 flex flex-col gap-4 overflow-auto">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<CheckSquare style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Today&apos;s Tasks</SectionTitle>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowQuickForm((value) => !value)} className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors font-medium"><Plus className="w-3.5 h-3.5" /> Add</button>
                <Link href="/tasks" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
              </div>
            </div>
            {showQuickForm && (
              <div className="space-y-2">
                <input autoFocus className="field w-full px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]" placeholder="New task for today..." value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addQuickTask(); if (event.key === "Escape") setShowQuickForm(false); }} />
                <div className="flex gap-2 items-center">
                  <div className="flex gap-1">{PRIORITIES.map((priority) => <button key={priority} onClick={() => setQuickPriority(priority)} className={cn("px-2 py-0.5 text-xs font-bold rounded-lg transition-colors", quickPriority === priority ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--chip)] text-[var(--faint)] hover:text-[var(--text)]")}>{priority}</button>)}</div>
                  <select className="field flex-1 px-2 py-1 text-xs text-[var(--text)]" value={quickTag} onChange={(event) => setQuickTag(event.target.value as TaskTag)}>{TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
                  <button onClick={addQuickTask} className="btn-primary px-3 py-1 text-xs">Add</button>
                </div>
              </div>
            )}
            {todayTasks.length === 0 ? <p className="text-sm text-[var(--faint)]">{showQuickForm ? "Add a task above." : "All clear — hit + to add tasks."}</p> : (
              <ul className="flex flex-col -mx-2">
                {todayTasks.sort((a, b) => ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[a.priority] - ({ P1: 0, P2: 1, P3: 2 } as Record<Priority, number>)[b.priority]).slice(0, 6).map((task) => (
                  <li key={task.id} className="flex items-start gap-3 group px-2 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0 mt-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Circle style={{ width: 16, height: 16 }} /></button>
                    <span className="flex-1 min-w-0 text-sm leading-snug text-[var(--text)] whitespace-normal break-words [overflow-wrap:anywhere]">{task.title}</span>
                    <div className="shrink-0 mt-0.5"><PriorityBadge priority={task.priority} /></div>
                  </li>
                ))}
                {todayTasks.length > 6 && <li className="px-2 pt-2 border-t border-[var(--border)]"><Link href="/tasks" className="text-xs text-[var(--muted)] hover:text-[var(--text)] font-medium">+{todayTasks.length - 6} more →</Link></li>}
              </ul>
            )}
          </section>
        );
      case "projects":
        return (
          <section className="card h-full p-5 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <SectionTitle icon={<FolderKanban style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Projects</SectionTitle>
              <Link href="/projects" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
              {overviewProjects.slice(0, 7).map((project) => {
                const taskCount = data.tasks.filter((task) => task.projectId === project.id && !task.done).length;
                return (
                  <Link key={project.id} href={`/projects/${project.id}`} className="group bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] p-4 flex flex-col gap-3.5 hover:border-[var(--border-2)]">
                    <div className="flex items-center justify-between"><ProjectLogo src={project.logoUrl} color={project.color} name={project.name} />{taskCount > 0 && <span className="text-[11px] font-medium text-[var(--muted)] tabular">{taskCount} open</span>}</div>
                    <div><p className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">{project.name}</p><p className="text-[11px] text-[var(--muted)] mt-1 font-medium capitalize flex items-center gap-1.5"><span className={cn("w-1.5 h-1.5 rounded-full shrink-0", COLOR_DOT[project.color] ?? "bg-[var(--c-indigo)]")} />{project.category}</p></div>
                  </Link>
                );
              })}
              <Link href="/projects" className="group bg-[var(--surface-2)] border border-dashed border-[var(--border-2)] rounded-[var(--radius)] p-4 flex flex-col items-center justify-center gap-2 min-h-[112px] text-[var(--faint)] hover:text-[var(--text)]"><Plus className="w-5 h-5" strokeWidth={1.8} /><span className="text-xs font-medium">New Project</span></Link>
            </div>
          </section>
        );
      case "focus":
        return (
          <WidgetPanel title="Focus today" icon={<Timer className="w-[15px] h-[15px]" />} href="/focus">
            <div className="flex items-end gap-2 mb-4"><span className="text-3xl font-bold text-[var(--text)] tabular leading-none">{todayFocusMinutes}</span><span className="text-xs font-medium text-[var(--faint)] pb-0.5">minutes</span></div>
            {todayFocusSessions.length === 0 ? <WidgetEmpty>No focus sessions logged today.</WidgetEmpty> : (
              <div className="space-y-2">{todayFocusSessions.slice(-5).reverse().map((session) => <div key={session.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs"><span className="text-[var(--muted)] truncate pr-3">{session.notes || session.tag}</span><span className="font-semibold text-[var(--text)] tabular shrink-0">{session.durationMins}m</span></div>)}</div>
            )}
          </WidgetPanel>
        );
      case "notes":
        return (
          <WidgetPanel title="Recent notes" icon={<NotebookText className="w-[15px] h-[15px]" />} href="/notes">
            {recentNotes.length === 0 ? <WidgetEmpty>Your recently edited notes will appear here.</WidgetEmpty> : (
              <div className="space-y-1">{recentNotes.slice(0, 7).map((page) => <Link key={page.id} href="/notes" onClick={() => localStorage.setItem("bridge_wiki_active", page.id)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-2)]"><span className="text-base shrink-0">{page.icon || "📄"}</span><span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text)] truncate">{page.title || "Untitled"}</span><span className="text-[10.5px] text-[var(--faint)] shrink-0">{new Date(page.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></Link>)}</div>
            )}
          </WidgetPanel>
        );
      case "payments":
        return (
          <WidgetPanel title="Upcoming payments" icon={<CreditCard className="w-[15px] h-[15px]" />} href="/money">
            {upcomingPayments.length === 0 ? <WidgetEmpty>No active subscriptions.</WidgetEmpty> : (
              <div className="space-y-1">{upcomingPayments.slice(0, 7).map((payment) => <div key={payment.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-2)]"><div className="w-8 h-8 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)] shrink-0"><CreditCard className="w-3.5 h-3.5" /></div><div className="flex-1 min-w-0"><p className="text-[13px] font-medium text-[var(--text)] truncate">{payment.name}</p><p className="text-[10.5px] text-[var(--faint)]">Due {new Date(`${payment.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></div><span className="text-xs font-semibold text-[var(--text)] tabular shrink-0">{formatCurrency(payment.amount)}</span></div>)}</div>
            )}
          </WidgetPanel>
        );
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6">
      {/* ── Greeting — sits directly on the canvas, subtle watermark on the right ── */}
      <header className="relative mb-6">
        <img
          src="/base-mark.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute right-0 -top-2 w-40 sm:w-56 opacity-[0.045] dark:opacity-[0.06]"
        />
        <p className="text-[13px] text-[var(--muted)] font-medium mb-1.5">{formatDate(now)}</p>
        <h1 className="text-[2rem] sm:text-[2.6rem] font-bold text-[var(--text)] leading-[1.05] tracking-tight">
          Good {greetText}, Lucas.
        </h1>
      </header>

      <div ref={gridContainerRef} className={cn("dashboard-grid -mx-3", editing && "is-editing")}>
        {gridMounted && (
          <Responsive<DashboardBreakpoint>
            width={gridWidth}
            layouts={layouts}
            breakpoints={BREAKPOINTS}
            cols={GRID_COLUMNS}
            rowHeight={24}
            margin={[12, 12]}
            containerPadding={[12, 0]}
            compactor={noCompactor}
            dragConfig={{ enabled: editing, handle: ".dashboard-drag-handle", bounded: true }}
            resizeConfig={{ enabled: editing, handles: ["n", "s", "e", "w", "ne", "nw", "se", "sw"] }}
            onLayoutChange={(_current, nextLayouts) => {
              const normalized = nextLayouts as ResponsiveLayouts<DashboardBreakpoint>;
              setLayouts(normalized);
              persistDashboard(normalized);
            }}
          >
            {visibleWidgets.map((id) => {
              const widget = WIDGETS.find((item) => item.id === id)!;
              return (
                <div key={id} className="dashboard-widget">
                  {editing && (
                    <div className="dashboard-widget-controls">
                      <button className="dashboard-drag-handle" aria-label={`Move ${widget.label}`} title="Drag to move"><Grip className="w-3.5 h-3.5" /><span>{widget.label}</span></button>
                      <button onClick={() => removeWidget(id)} aria-label={`Remove ${widget.label}`} title="Remove widget" className="dashboard-remove-widget"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <div className="dashboard-widget-content">{renderWidget(id)}</div>
                </div>
              );
            })}
          </Responsive>
        )}
        {editing && <div className="dashboard-edit-runway" aria-hidden="true"><span>Keep resizing — the canvas extends with you</span></div>}
      </div>

      <div className={cn("dashboard-editor-toolbar relative mt-8 mb-4 flex justify-center", editing && "is-editing")}>
        {editing && showWidgetPicker && (
          <div className="absolute bottom-full mb-3 w-[min(440px,calc(100vw-2rem))] max-h-[min(70vh,560px)] overflow-y-auto elevated card p-4 nx-pop z-40">
            <div className="flex items-center justify-between mb-3">
              <div><p className="text-sm font-semibold text-[var(--text)]">Widget library</p><p className="text-[11.5px] text-[var(--faint)] mt-0.5">Build the dashboard around what matters today.</p></div>
              <button onClick={() => setShowWidgetPicker(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {WIDGETS.map((widget) => {
                const added = visibleWidgets.includes(widget.id);
                return <button key={widget.id} disabled={added} onClick={() => addWidget(widget.id)} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left text-xs font-medium text-[var(--text)] hover:border-[var(--border-2)] disabled:opacity-45"><span>{widget.label}</span>{added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}</button>;
              })}
            </div>
          </div>
        )}

        <div className="glass glass-edge flex items-center gap-1.5 rounded-full border border-[var(--border)] p-1.5">
          {editing && <button onClick={() => setShowWidgetPicker((value) => !value)} className="pill h-9 border-0 bg-transparent"><Plus className="w-3.5 h-3.5" /> Add widget</button>}
          {editing && <button onClick={resetDashboard} className="pill h-9 border-0 bg-transparent"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>}
          <button onClick={() => { setEditing((value) => !value); setShowWidgetPicker(false); }} className={cn("h-9 rounded-full px-4 inline-flex items-center gap-2 text-xs font-semibold transition-colors", editing ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]")}>
            {editing ? <Check className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}{editing ? "Done" : "Edit dashboard"}
          </button>
        </div>
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

function WidgetPanel({ title, icon, href, children }: { title: string; icon: React.ReactNode; href: string; children: React.ReactNode }) {
  return (
    <section className="card h-full p-5 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle icon={icon}>{title}</SectionTitle>
        <Link href={href} className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">Open <ArrowRight className="w-3 h-3" /></Link>
      </div>
      {children}
    </section>
  );
}

function WidgetEmpty({ children }: { children: React.ReactNode }) {
  return <div className="h-[calc(100%-2rem)] min-h-20 flex items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 text-center text-xs text-[var(--faint)]">{children}</div>;
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
  const gid = `sg-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
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
    <Link href={href} className="group card card-hover p-4 relative overflow-hidden block h-full min-h-[132px]">
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
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <section className="card h-full p-5 overflow-auto">
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
