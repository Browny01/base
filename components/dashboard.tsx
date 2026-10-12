"use client";

import { loadNewsBriefing } from "@/lib/news-briefing";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";

import { BaseImage } from "@/lib/image";

import { apiFetch } from "@/lib/api-client";

import { useId, useRef, useState, useEffect, useMemo } from "react";
import { useBase } from "@/lib/hooks";
import { uid, formatCurrency, formatDate, getToday } from "@/lib/utils";
import { firstName } from "@/lib/profile";
import { TASK_TAGS, type Priority, type Task, type TaskTag, type BaseData, type Bookmark } from "@/lib/store";
import { PRIORITY_META, priorityLabel } from "@/lib/task-sort";
import { useConfirm } from "@/lib/confirm-context";
import { SlidersHorizontal, ChevronLeft, ChevronRight, CalendarDays, Plus, Circle, CheckSquare, Wallet, Newspaper, Loader2, RefreshCw, FolderKanban, ArrowRight, ArrowUpRight, ArrowDownRight, X, Timer, NotebookText, CreditCard, Pencil, Trash2, Globe, ImagePlus } from "lucide-react";
import Link from "@/lib/link";
import { cn } from "@/lib/utils";
import { mdToHtml } from "@/lib/markdown";
import { ProjectLogo } from "@/components/project-logo";
import { useQuickActions } from "@/lib/quick-actions";
import { DashboardTile } from "./ui/dashboard-tile";
import { PageHeading } from "./ui/page-heading";
import { useStoredPref, writeStored } from "@/lib/prefs";
import { readWidgetSizes, readDashboardWidgets, moveDashboardWidget, reorderDashboardWidget, DEFAULT_DASHBOARD_WIDGETS, type DashboardWidget } from "@/lib/dashboard-widgets";


const PRIORITIES = PRIORITY_META;
const TAGS = TASK_TAGS;
const PRIO_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };

type WidgetId = DashboardWidget;

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "tasks-metric", label: "Tasks left" },
  { id: "revenue-metric", label: "Revenue" },
  { id: "tasks", label: "Priority tasks" },
  { id: "calendar", label: "Calendar preview" },
  { id: "news", label: "News briefing" },
  { id: "projects", label: "Projects" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "focus", label: "Focus today" },
  { id: "notes", label: "Recent notes" },
  { id: "payments", label: "Upcoming payments" },
];

const COLOR_DOT: Record<string, string> = {
  indigo: "bg-[var(--c-indigo)]", cyan: "bg-[var(--c-cyan)]", emerald: "bg-[var(--c-emerald)]",
  yellow: "bg-[var(--c-amber)]",  red: "bg-[var(--c-rose)]",  purple: "bg-[var(--c-purple)]",
  orange: "bg-[var(--c-orange)]", pink: "bg-[var(--c-pink)]",
};

function taskCompletionDay(task: Task): string {
  return (task.completedAt ?? task.createdAt).slice(0, 10);
}

// ── local YYYY-MM-DD for the last `n` days, oldest → newest ──────────────────
function lastNDays(n: number, today?:string): string[] {
  const out: string[] = [];
  const d = today?new Date(`${today}T12:00:00`):new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}

// ── Bookmark helpers ────────────────────────────────────────────────────────
function isImageIcon(s?: string) {
  return !!s && (s.startsWith("data:") || /^https?:\/\//i.test(s));
}

function normalizeUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Shrink an uploaded image to a small square data-URL so it's cheap to store & sync.
async function fileToIcon(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read failed"));
    fr.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("decode failed"));
    img.src = dataUrl;
  });
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/webp", 0.8);
}

export function Dashboard() {
  const { data, mutate } = useBase();
  const quick=useQuickActions();
  const now = new Date();
  const today = getToday(data.profile?.timezone);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<Priority>("P2");
  const [quickTag, setQuickTag] = useState<TaskTag>("work");
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [revenuePeriod, setRevenuePeriod] = useState<"day" | "week" | "month">("day");
  const [customizing, setCustomizing] = useState(false);
  const rawSizes=useStoredPref("base_dashboard_sizes_v1","{}");
  const widgetSizes=useMemo(()=>readWidgetSizes(rawSizes),[rawSizes]);
  const storedWidgets = useStoredPref("base_dashboard_widgets_v1", JSON.stringify(DEFAULT_DASHBOARD_WIDGETS));
  const widgetIds = useMemo(()=>readDashboardWidgets(storedWidgets),[storedWidgets]);
  const saveWidgets = (widgets: WidgetId[]) => writeStored("base_dashboard_widgets_v1",JSON.stringify(widgets));

  // ── Stats ──────────────────────────────────────────────────────────────────
  const todayTasks = useMemo(()=>data.tasks.filter((t) => !t.done && (t.dueDate === today || !t.dueDate)),[data.tasks,today]);
  const doneTodayCount = data.tasks.filter((t) => t.done && taskCompletionDay(t) === today).length;
  const priorityTasks = useMemo(()=>data.tasks.filter((t) => !t.done).sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt)),[data.tasks]);

  const todayIncome = data.incomeEntries
    .filter((e) => e.date === today && e.type === "income")
    .reduce((s, e) => s + e.amount, 0);
  const progress = data.dailyRevenueTarget > 0
    ? Math.min((todayIncome / data.dailyRevenueTarget) * 100, 100)
    : 0;

  // Revenue over the selected window (day / rolling 7 days / calendar month).
  const monthPrefix = today.slice(0, 7);
  const weekStart = lastNDays(7,today)[0];
  const sumIncome = (pred: (date: string) => boolean) =>
    data.incomeEntries.filter((e) => e.type === "income" && pred(e.date)).reduce((s, e) => s + e.amount, 0);
  const revenueByPeriod: Record<"day" | "week" | "month", number> = {
    day: todayIncome,
    week: sumIncome((d) => d >= weekStart && d <= today),
    month: sumIncome((d) => d.startsWith(monthPrefix)),
  };

  // ── Real-data mini-series for the metric sparklines (no fabricated data) ─────
  const days14 = useMemo(()=>lastNDays(14,today),[today]);
  const tasksDoneSeries = useMemo(()=>{
    const counts=new Map<string,number>();for(const task of data.tasks)if(task.done){const day=taskCompletionDay(task);counts.set(day,(counts.get(day)??0)+1);}
    return days14.map(day=>counts.get(day)??0);
  },[data.tasks,days14]);
  const revenueSeries = useMemo(()=>{
    const totals=new Map<string,number>();for(const entry of data.incomeEntries)if(entry.type==="income")totals.set(entry.date,(totals.get(entry.date)??0)+entry.amount);
    return days14.map(day=>totals.get(day)??0);
  },[data.incomeEntries,days14]);

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

  const greetText = greeting(now, data.profile?.timezone);
  const greetName = firstName(data.profile);
  const overviewProjects = data.projects.filter((p) => !p.archived);
  const todayFocusSessions = data.focusSessions.filter((session) => session.date === today);
  const todayFocusMinutes = todayFocusSessions.reduce((sum, session) => sum + session.durationMins, 0);
  const recentNotes = (data.wikiPages ?? []).filter((page) => !page.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const upcomingPayments = data.subscriptions.filter((subscription) => subscription.active).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "calendar":
        return <WidgetPanel title="On the calendar" icon={<CalendarDays className="h-[15px] w-[15px]"/>} href="/calendar">
          {(data.calendarEvents ?? []).filter(event=>event.startDate>=today).sort((a,b)=>a.startDate.localeCompare(b.startDate)).slice(0,5).map(event=><Link key={event.id} href="/calendar" className="flex items-start gap-3 border-b border-[var(--border)] py-3 last:border-0"><span className="base-calendar-date"><span>{new Date(`${event.startDate}T12:00:00`).toLocaleDateString(undefined,{month:"short"})}</span><strong>{event.startDate.slice(-2)}</strong></span><span className="min-w-0"><span className="block truncate text-[13px] font-medium">{event.title}</span><span className="block mt-1 text-xs text-[var(--muted)]">{event.allDay?"All day":event.startTime||"Scheduled"}</span></span></Link>)}
          {!(data.calendarEvents ?? []).some(event=>event.startDate>=today)&&<WidgetEmpty>Your calendar has a little breathing room.</WidgetEmpty>}
        </WidgetPanel>;
      case "tasks-metric":
        return <MetricCard icon={<CheckSquare style={{ width: 16, height: 16 }} strokeWidth={1.9} />} iconColor="var(--muted)" label="Tasks Left" value={todayTasks.length.toString()} sub={`${doneTodayCount} done today`} series={tasksDoneSeries} seriesColor="var(--muted)" href="/tasks" />;
      case "revenue-metric":
        return (
          <MetricCard
            icon={<Wallet style={{ width: 16, height: 16 }} strokeWidth={1.9} />}
            iconColor="var(--c-emerald)"
            label="Revenue"
            value={formatCurrency(revenueByPeriod[revenuePeriod])}
            sub={revenuePeriod === "day" ? `of ${formatCurrency(data.dailyRevenueTarget)}` : revenuePeriod === "week" ? "past 7 days" : "this month"}
            series={revenueSeries}
            seriesColor="var(--c-emerald)"
            href="/finance"
            headerAction={
              <div className="flex gap-0.5 rounded-md bg-[var(--surface-2)] p-0.5">
                {(["day", "week", "month"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevenuePeriod(p); }}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors",
                      revenuePeriod === p ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--faint)] hover:text-[var(--text)]",
                    )}
                  >
                    {p === "day" ? "D" : p === "week" ? "W" : "M"}
                  </button>
                ))}
              </div>
            }
            footer={revenuePeriod === "day" ? <div className="w-full bg-[var(--surface-2)] rounded-full h-1 mt-2 overflow-hidden"><div className="h-1 rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--c-emerald)" : "var(--text)" }} /></div> : undefined}
          />
        );
      case "news":
        return <DashNewsBriefing />;
      case "tasks":
        return (
          <section className="card h-full p-5 flex flex-col gap-4 overflow-auto">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<CheckSquare style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Priority Tasks</SectionTitle>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowQuickForm((value) => !value)} className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors font-medium"><Plus className="w-3.5 h-3.5" /> Add</button>
                <Link href="/tasks" className="text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors font-medium inline-flex items-center gap-1">All <ArrowRight className="w-3 h-3" /></Link>
              </div>
            </div>
            {showQuickForm && (
              <div className="space-y-2">
                <input autoFocus className="field w-full px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]" placeholder="New task for today..." value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addQuickTask(); if (event.key === "Escape") setShowQuickForm(false); }} />
                <div className="flex gap-2 items-center">
                  <div className="flex gap-1">{PRIORITIES.map((p) => <button key={p.value} onClick={() => setQuickPriority(p.value)} className={cn("px-2 py-0.5 text-xs font-medium rounded-lg transition-colors", quickPriority === p.value ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--chip)] text-[var(--faint)] hover:text-[var(--text)]")}>{p.label}</button>)}</div>
                  <select className="field flex-1 px-2 py-1 text-xs text-[var(--text)]" value={quickTag} onChange={(event) => setQuickTag(event.target.value as TaskTag)}>{TAGS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}</select>
                  <button onClick={addQuickTask} className="btn-primary px-3 py-1 text-xs">Add</button>
                </div>
              </div>
            )}
            {priorityTasks.length === 0 ? <p className="text-sm text-[var(--faint)]">{showQuickForm ? "Add a task above." : "All clear — hit + to add tasks."}</p> : (
              <ul className="flex flex-col -mx-2">
                {priorityTasks.slice(0, 6).map((task) => (
                  <li key={task.id} className="flex items-start gap-3 group px-2 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors">
                    <button onClick={() => toggleTask(task.id)} className="shrink-0 mt-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Circle style={{ width: 16, height: 16 }} /></button>
                    <span className="flex-1 min-w-0 text-sm leading-snug text-[var(--text)] whitespace-normal break-words [overflow-wrap:anywhere]">{task.title}</span>
                    <div className="shrink-0 mt-0.5"><PriorityBadge priority={task.priority} /></div>
                  </li>
                ))}
                {priorityTasks.length > 6 && <li className="px-2 pt-2 border-t border-[var(--border)]"><Link href="/tasks" className="text-xs text-[var(--muted)] hover:text-[var(--text)] font-medium">+{priorityTasks.length - 6} more →</Link></li>}
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
      case "bookmarks":
        return <BookmarksWidget data={data} mutate={mutate} />;
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
              <div className="space-y-1">{recentNotes.slice(0, 7).map((page) => <Link key={page.id} href="/notes" onClick={() => localStorage.setItem("base_wiki_active", page.id)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-2)]"><span className="text-base shrink-0">{page.icon || "📄"}</span><span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text)] truncate">{page.title || "Untitled"}</span><span className="text-[10.5px] text-[var(--faint)] shrink-0">{new Date(page.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></Link>)}</div>
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
    <div className="base-page dashboard-page">
      <PageHeading title={`Good ${greetText}${greetName ? `, ${greetName}` : ""}.`} description={`${formatDate(now)} · A little clarity for your day.`}>
        <button className="base-button base-button-secondary" onClick={()=>setCustomizing(!customizing)} aria-expanded={customizing}><SlidersHorizontal className="h-3.5 w-3.5"/> Customize</button>
        <button onClick={quick.newTask} className="base-button base-button-primary"><Plus className="h-3.5 w-3.5"/> New task</button>
      </PageHeading>
      {customizing && <section className="base-dashboard-settings" aria-label="Dashboard widgets">
        <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold">Make this space yours</h2><button className="text-xs underline" onClick={()=>{saveWidgets([...DEFAULT_DASHBOARD_WIDGETS]);writeStored("base_dashboard_sizes_v1","{}");}}>Reset layout</button></div>
        <p className="mb-4 text-xs text-[var(--muted)]">Drag a widget’s top handle to move it and its bottom-right corner to resize. You can also focus either handle and use the arrow keys. Layout changes are saved on this device.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{WIDGETS.map(widget=><div key={widget.id} className="flex items-center gap-2 rounded-md border border-[var(--border)] p-2">
          <label className="flex flex-1 items-center gap-2 text-xs"><input type="checkbox" checked={widgetIds.includes(widget.id)} onChange={event=>saveWidgets(event.target.checked?[...widgetIds,widget.id]:widgetIds.filter(id=>id!==widget.id))}/>{widget.label}</label>
          <button aria-label={`Move ${widget.label} earlier`} disabled={widgetIds.indexOf(widget.id)<=0} onClick={()=>saveWidgets(moveDashboardWidget(widgetIds,widget.id,-1))} className="base-widget-nudge"><ChevronLeft className="h-3.5 w-3.5"/></button>
          <button aria-label={`Move ${widget.label} later`} disabled={!widgetIds.includes(widget.id)||widgetIds.indexOf(widget.id)===widgetIds.length-1} onClick={()=>saveWidgets(moveDashboardWidget(widgetIds,widget.id,1))} className="base-widget-nudge"><ChevronRight className="h-3.5 w-3.5"/></button>
        </div>)}</div>
      </section>}
      <div className="base-dashboard-grid">{widgetIds.map(id=><DashboardTile key={id} id={id} label={WIDGETS.find(widget=>widget.id===id)!.label} customizing={customizing} size={widgetSizes[id]} onMove={(source,target)=>saveWidgets(reorderDashboardWidget(widgetIds,source,target))} onResize={size=>writeStored("base_dashboard_sizes_v1",JSON.stringify({...widgetSizes,[id]:size}))}>{renderWidget(id)}</DashboardTile>)}</div>
      {!widgetIds.length && <div className="base-empty"><h2>Your dashboard, your call</h2><p>Use Customize to add the widgets you want to see.</p></div>}
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
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0",
      priority === "P1" ? "bg-[color-mix(in_srgb,var(--c-rose)_16%,transparent)] text-[var(--c-rose)]"
      : priority === "P2" ? "bg-[var(--chip)] text-[var(--muted)]"
      : "bg-[var(--chip)] text-[var(--faint)]"
    )}>{priorityLabel(priority)}</span>
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
  icon, iconColor, label, value, sub, delta, series, seriesColor, href, footer, headerAction,
}: {
  icon: React.ReactNode; iconColor: string; label: string; value: string;
  sub?: string; delta?: { pct: number; up: boolean; note: string };
  series: number[]; seriesColor: string; href: string; footer?: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group card card-hover p-4 relative overflow-hidden block h-full min-h-[132px]">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="eyebrow">{label}</span>
        {headerAction && <span className="ml-auto relative z-10">{headerAction}</span>}
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
  const { data } = useBase();
  const settings = data.aiSettings ?? DEFAULT_AI_SETTINGS;
  const [state, setState] = useState<{ loading: boolean; summary?: string; error?: string }>({ loading: true });
  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    void loadNewsBriefing(settings).then(setState);
  };
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.model, settings.briefingEnabled, settings.keyCipher, settings.keySalt]);
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

// ── Bookmarks widget ────────────────────────────────────────────────────────

interface BookmarkFormValues { title: string; url: string; icon: string }

function BookmarkFavicon({ bookmark, size = 40 }: { bookmark: Bookmark; size?: number }) {
  const box = { width: size, height: size };
  const base = "rounded-lg bg-[var(--surface)] border border-[var(--border)] grid place-items-center shrink-0 overflow-hidden";
  if (bookmark.icon && !isImageIcon(bookmark.icon)) {
    return <div style={box} className={cn(base, "text-lg leading-none")}>{bookmark.icon}</div>;
  }
  const src = bookmark.icon && isImageIcon(bookmark.icon) ? bookmark.icon : bookmark.icon ? undefined : bookmark.favicon;
  if (src) return <BaseImage src={src} alt="" style={box} className={cn(base, "object-cover")} />;
  return <div style={box} className={base}><Globe className="w-4 h-4 text-[var(--faint)]" /></div>;
}

function BookmarkForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial?: Partial<Bookmark>;
  submitLabel: string;
  onSubmit: (v: BookmarkFormValues) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit() {
    const cleanUrl = normalizeUrl(url);
    if (!cleanUrl) return;
    onSubmit({ title: title.trim() || hostOf(cleanUrl), url: cleanUrl, icon: icon.trim() });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    try {
      setIcon(await fileToIcon(file));
    } catch {
      setUploadError("Couldn't read that image.");
    }
  }

  const preview: Bookmark = { id: "preview", title: "", url: "", createdAt: "", icon, favicon: initial?.favicon };

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border-2)] rounded-[var(--radius)] p-4 mb-3 space-y-3">
      <div className="flex gap-2">
        <input
          autoFocus
          className="field flex-1 px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <input
        className="field w-full px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-[var(--surface)] border border-[var(--border)] grid place-items-center overflow-hidden">
          <BookmarkFavicon bookmark={preview} size={20} />
        </div>
        <input
          className="field flex-1 px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)]"
          placeholder="Emoji or image URL — blank fetches the favicon"
          value={isImageIcon(icon) ? "" : icon}
          onChange={(e) => setIcon(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="pill h-9 shrink-0"><ImagePlus className="w-3.5 h-3.5" /> Upload</button>
        {icon && <button type="button" onClick={() => setIcon("")} className="text-[var(--faint)] hover:text-[var(--text)] shrink-0" title="Clear icon"><X className="w-4 h-4" /></button>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
      {uploadError && <p className="text-[11px] text-[var(--c-rose)]">{uploadError}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">Cancel</button>
        <button onClick={submit} className="btn-primary px-4 py-1.5 text-xs">{submitLabel}</button>
      </div>
    </div>
  );
}

function BookmarksWidget({ data, mutate }: { data: BaseData; mutate: (updater: (d: BaseData) => BaseData) => void }) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const bookmarks = [...(data.bookmarks ?? [])].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt),
  );

  async function fetchFavicon(url: string): Promise<string | undefined> {
    try {
      const r = await apiFetch(`/api/favicon?url=${encodeURIComponent(url)}`);
      const j = await r.json();
      return j?.ok ? (j.dataUrl as string) : undefined;
    } catch {
      return undefined;
    }
  }

  async function addBookmark(v: BookmarkFormValues) {
    setAdding(false);
    const id = uid();
    setBusyId(id);
    const favicon = v.icon ? undefined : await fetchFavicon(v.url);
    mutate((d) => {
      const order = (d.bookmarks ?? []).reduce((m, b) => Math.max(m, b.order ?? -1), -1) + 1;
      return {
        ...d,
        bookmarks: [
          ...(d.bookmarks ?? []),
          { id, title: v.title, url: v.url, icon: v.icon || undefined, favicon, createdAt: new Date().toISOString(), order },
        ],
      };
    });
    setBusyId(null);
  }

  async function saveBookmark(id: string, v: BookmarkFormValues) {
    setEditingId(null);
    const existing = (data.bookmarks ?? []).find((b) => b.id === id);
    let favicon = existing?.favicon;
    if (!v.icon && (v.url !== existing?.url || !favicon)) {
      setBusyId(id);
      favicon = await fetchFavicon(v.url);
      setBusyId(null);
    }
    mutate((d) => ({
      ...d,
      bookmarks: (d.bookmarks ?? []).map((b) =>
        b.id === id ? { ...b, title: v.title, url: v.url, icon: v.icon || undefined, favicon } : b,
      ),
    }));
  }

  async function removeBookmark(id: string) {
    const b = (data.bookmarks ?? []).find((x) => x.id === id);
    if (!(await confirm({ message: `Delete "${b?.title || "this bookmark"}"?` }))) return;
    mutate((d) => ({ ...d, bookmarks: (d.bookmarks ?? []).filter((x) => x.id !== id) }));
  }

  const editing = editingId ? bookmarks.find((b) => b.id === editingId) : undefined;

  return (
    <section className="card h-full p-5 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle icon={<Globe style={{ width: 15, height: 15 }} strokeWidth={1.9} />}>Bookmarks</SectionTitle>
        {!adding && !editingId && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors font-medium">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {adding && <BookmarkForm submitLabel="Add link" onSubmit={addBookmark} onCancel={() => setAdding(false)} />}
      {editing && (
        <BookmarkForm
          key={editing.id}
          initial={editing}
          submitLabel="Save"
          onSubmit={(v) => saveBookmark(editing.id, v)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {bookmarks.length === 0 && !adding ? (
        <WidgetEmpty>No bookmarks yet — add the sites you reach for often.</WidgetEmpty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {bookmarks.map((b) => (
            <div key={b.id} className="group relative bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] p-4 hover:border-[var(--border-2)]">
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-3.5">
                <div className="flex items-center justify-between">
                  <BookmarkFavicon bookmark={b} />
                  {busyId === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--faint)]" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">{b.title}</p>
                  <p className="text-[11px] text-[var(--muted)] mt-1 font-medium truncate">{hostOf(b.url)}</p>
                </div>
              </a>
              <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(b.id); setAdding(false); }} className="w-6 h-6 rounded-md grid place-items-center text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface)]" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeBookmark(b.id)} className="w-6 h-6 rounded-md grid place-items-center text-[var(--faint)] hover:text-[var(--c-rose)] hover:bg-[var(--surface)]" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {!adding && !editingId && (
            <button onClick={() => setAdding(true)} className="group bg-[var(--surface-2)] border border-dashed border-[var(--border-2)] rounded-[var(--radius)] p-4 flex flex-col items-center justify-center gap-2 min-h-[112px] text-[var(--faint)] hover:text-[var(--text)]">
              <Plus className="w-5 h-5" strokeWidth={1.8} />
              <span className="text-xs font-medium">New Link</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function greeting(d: Date, timezone?: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone || "UTC" }).format(d),
  );
  if (Number.isNaN(hour) || hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
