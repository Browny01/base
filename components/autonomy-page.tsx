"use client";

import { useMemo, useState } from "react";
import {
  Activity, Bot, Check, CheckCircle2, ChevronRight, CirclePause,
  CirclePlay, FileCheck2, Gauge, ListChecks, Pause, Play, Search,
  Settings2, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/store";
import {
  DEFAULT_AUTONOMY_SETTINGS,
  autonomyState,
  buildAutonomySummary,
  eligibleAutonomyTasks,
  isAutonomyTask,
  reviewBucket,
  timelineForTask,
  type AutonomySettings,
  type AutonomyState,
  type AutonomyTaskClass,
} from "@/lib/autonomy";

const STATE_META: Record<AutonomyState, { label: string; tone: string; dot: string }> = {
  suggested: { label: "Suggested", tone: "text-[var(--muted)] bg-[var(--chip)]", dot: "bg-[var(--muted)]" },
  queued: { label: "Queued", tone: "text-[var(--c-cyan)] bg-[color-mix(in_srgb,var(--c-cyan)_10%,transparent)]", dot: "bg-[var(--c-cyan)]" },
  in_progress: { label: "Running", tone: "text-[var(--c-purple)] bg-[color-mix(in_srgb,var(--c-purple)_10%,transparent)]", dot: "bg-[var(--c-purple)]" },
  awaiting_review: { label: "Review", tone: "text-[var(--c-amber)] bg-[color-mix(in_srgb,var(--c-amber)_10%,transparent)]", dot: "bg-[var(--c-amber)]" },
  needs_input: { label: "Approval", tone: "text-[var(--c-orange)] bg-[color-mix(in_srgb,var(--c-orange)_10%,transparent)]", dot: "bg-[var(--c-orange)]" },
  blocked: { label: "Blocked", tone: "text-[var(--c-rose)] bg-[color-mix(in_srgb,var(--c-rose)_10%,transparent)]", dot: "bg-[var(--c-rose)]" },
  completed: { label: "Verified", tone: "text-[var(--c-emerald)] bg-[color-mix(in_srgb,var(--c-emerald)_10%,transparent)]", dot: "bg-[var(--c-emerald)]" },
  rejected: { label: "Rejected", tone: "text-[var(--c-rose)] bg-[color-mix(in_srgb,var(--c-rose)_10%,transparent)]", dot: "bg-[var(--c-rose)]" },
};

const WORKSPACES = ["Bridge", "Dropshipping", "Systemly", "ProductDeck", "StreamSpark"];
const TASK_CLASSES: { id: AutonomyTaskClass; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "planning", label: "Planning" },
  { id: "implementation", label: "Implementation" },
  { id: "review", label: "Review" },
  { id: "operations", label: "Operations" },
];

type Tab = "overview" | "review" | "activity" | "controls";

export function AutonomyPage() {
  const { data, mutate, loaded } = useBridge();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<Task | null>(null);
  const [query, setQuery] = useState("");

  const settings = useMemo(() => ({ ...DEFAULT_AUTONOMY_SETTINGS, ...(data.autonomySettings ?? {}) }), [data.autonomySettings]);
  const tasks = useMemo(() => data.tasks.filter(isAutonomyTask), [data.tasks]);
  const summary = useMemo(() => buildAutonomySummary(tasks), [tasks]);
  const eligible = useMemo(() => eligibleAutonomyTasks(data.tasks, settings), [data.tasks, settings]);
  const projectNames = useMemo(() => new Map(data.projects.map((project) => [project.id, project.name])), [data.projects]);

  const updateSettings = async (patch: Partial<AutonomySettings>) => {
    try {
      const response = await fetch("/api/autonomy/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json() as { ok?: boolean; error?: string; settings?: AutonomySettings };
      if (!response.ok || !result.ok || !result.settings) {
        toast(result.error ?? "Unable to update autonomy controls.");
        return;
      }
      const persistedSettings = result.settings;
      mutate((current) => ({ ...current, autonomySettings: persistedSettings }));
    } catch {
      toast("Unable to update autonomy controls.");
    }
  };

  const reviewTask = async (id: string, decision: "approve" | "verify" | "requeue" | "reject") => {
    try {
      const response = await fetch("/api/autonomy/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id, decision }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; task?: Task };
      if (result.task) {
        const reviewed = result.task;
        mutate((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? reviewed : task) }));
        setSelected((current) => current?.id === id ? reviewed : current);
      }
      if (!response.ok || !result.ok || !result.task) {
        toast(result.error ?? "Unable to update this task.");
        return;
      }
    } catch {
      toast("Unable to update this task.");
    }
  };

  const filteredTasks = tasks.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));

  if (!loaded) return <div className="p-8 text-sm text-[var(--muted)]">Loading autonomous work…</div>;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-6 pb-28">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("w-2 h-2 rounded-full", settings.enabled ? "bg-[var(--c-emerald)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--c-emerald)_12%,transparent)]" : "bg-[var(--muted)]")} />
            <span className="eyebrow">{settings.enabled ? "Autonomy online" : "Autonomy paused"}</span>
          </div>
          <h1 className="text-[2rem] sm:text-[2.6rem] leading-none font-bold tracking-tight text-[var(--text)]">Autonomy Centre</h1>
          <p className="text-sm text-[var(--muted)] mt-3 max-w-xl">One place to see what agents are doing, inspect their evidence, and control what can run.</p>
        </div>
        <button
          onClick={() => updateSettings({ enabled: !settings.enabled })}
          className={cn("inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors", settings.enabled ? "border-[var(--border-2)] text-[var(--text)] hover:bg-[var(--surface-2)]" : "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]")}
        >
          {settings.enabled ? <><Pause className="w-4 h-4" /> Pause all</> : <><Play className="w-4 h-4" /> Resume autonomy</>}
        </button>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] mb-6">
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--text)]" />
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[var(--border)]">
          <RailStat label="Eligible now" value={eligible.length} detail={`${summary.queued} queued`} icon={<Sparkles />} />
          <RailStat label="Workers" value={`${summary.running}/${settings.maxConcurrentWorkers}`} detail="active capacity" icon={<Bot />} />
          <RailStat label="Needs you" value={summary.needsApproval + summary.awaitingReview} detail="review or approve" icon={<ListChecks />} />
          <RailStat label="Verified" value={summary.verified} detail="completed with evidence" icon={<ShieldCheck />} />
        </div>
      </section>

      <nav className="flex gap-0 sm:gap-1 border-b border-[var(--border)] mb-6" aria-label="Autonomy sections">
        {([
          ["overview", "Overview", Gauge], ["review", "Review", FileCheck2],
          ["activity", "Activity", Activity], ["controls", "Controls", Settings2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("relative flex flex-1 sm:flex-none items-center justify-center gap-1.5 sm:gap-2 px-1.5 sm:px-3.5 py-3 text-[11px] sm:text-sm font-medium whitespace-nowrap", tab === id ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
            <Icon className="w-4 h-4" />{label}
            {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--text)]" />}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview tasks={filteredTasks} summary={summary} projects={projectNames} query={query} setQuery={setQuery} onSelect={setSelected} />}
      {tab === "review" && <ReviewInbox tasks={filteredTasks} projects={projectNames} onSelect={setSelected} onReview={reviewTask} />}
      {tab === "activity" && <ActivityFeed tasks={tasks} projects={projectNames} onSelect={setSelected} />}
      {tab === "controls" && <Controls settings={settings} onChange={updateSettings} />}

      {selected && <TaskDrawer task={selected} projectName={workspaceFor(selected, projectNames)} onClose={() => setSelected(null)} onReview={reviewTask} />}
    </div>
  );
}

function RailStat({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: React.ReactElement }) {
  return <div className="p-4 sm:p-5 min-h-28 flex flex-col justify-between"><div className="flex items-center justify-between text-[var(--faint)]"><span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</span><span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span></div><div><p className="text-2xl font-bold tracking-tight text-[var(--text)] tabular">{value}</p><p className="text-[11px] text-[var(--muted)] mt-0.5">{detail}</p></div></div>;
}

function Overview({ tasks, summary, projects, query, setQuery, onSelect }: { tasks: Task[]; summary: ReturnType<typeof buildAutonomySummary>; projects: Map<string, string>; query: string; setQuery: (value: string) => void; onSelect: (task: Task) => void }) {
  const lanes: { state: AutonomyState; title: string; tasks: Task[] }[] = [
    { state: "queued", title: "Queued", tasks: tasks.filter((task) => ["queued", "suggested"].includes(autonomyState(task) ?? "")) },
    { state: "in_progress", title: "Running", tasks: tasks.filter((task) => autonomyState(task) === "in_progress") },
    { state: "awaiting_review", title: "Review", tasks: tasks.filter((task) => ["awaiting_review", "needs_input"].includes(autonomyState(task) ?? "")) },
    { state: "blocked", title: "Blocked", tasks: tasks.filter((task) => ["blocked", "rejected"].includes(autonomyState(task) ?? "")) },
  ];
  return <div>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div><h2 className="text-lg font-semibold text-[var(--text)]">Work queue</h2><p className="text-xs text-[var(--muted)] mt-1">{summary.total} autonomous tasks tracked</p></div>
      <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--faint)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find autonomous work" className="field w-full pl-9 pr-3 py-2 text-sm" /></label>
    </div>
    <div className="grid xl:grid-cols-4 md:grid-cols-2 gap-4">
      {lanes.map((lane) => <div key={lane.state} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 min-h-52">
        <div className="flex items-center justify-between px-1 py-1 mb-2"><div className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", STATE_META[lane.state].dot)} /><h3 className="text-sm font-semibold text-[var(--text)]">{lane.title}</h3></div><span className="text-xs tabular text-[var(--faint)]">{lane.tasks.length}</span></div>
        <div className="space-y-2">{lane.tasks.length === 0 ? <EmptyLane /> : lane.tasks.slice(0, 8).map((task) => <TaskCard key={task.id} task={task} workspace={workspaceFor(task, projects)} onClick={() => onSelect(task)} />)}</div>
      </div>)}
    </div>
  </div>;
}

function ReviewInbox({ tasks, projects, onSelect, onReview }: { tasks: Task[]; projects: Map<string, string>; onSelect: (task: Task) => void; onReview: (id: string, decision: "approve" | "verify" | "requeue" | "reject") => void }) {
  const reviewTasks = tasks.filter((task) => reviewBucket(task) && reviewBucket(task) !== "verified");
  return <section><div className="mb-5"><h2 className="text-lg font-semibold text-[var(--text)]">Review inbox</h2><p className="text-xs text-[var(--muted)] mt-1">Only work that needs judgement, correction, or approval appears here.</p></div>
    {reviewTasks.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="Nothing needs your attention" body="Verified work stays in Activity; new decisions will appear here." /> : <div className="space-y-3">{reviewTasks.map((task) => {
      const bucket = reviewBucket(task);
      return <article key={task.id} className="card p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        <button onClick={() => onSelect(task)} className="flex-1 min-w-0 text-left"><div className="flex items-center gap-2 mb-1.5"><StateBadge task={task} /><span className="text-[11px] text-[var(--faint)]">{workspaceFor(task, projects)}</span></div><h3 className="text-sm font-semibold text-[var(--text)]">{task.title}</h3><p className="text-xs text-[var(--muted)] mt-1.5 line-clamp-2">{task.resultSummary || task.executionNote || task.autonomyBrief || "Open the task to inspect its evidence."}</p></button>
        <div className="flex items-center gap-2 shrink-0">{bucket === "review" && <><button onClick={() => onReview(task.id, "requeue")} className="btn-secondary px-3 py-2 text-xs">Return</button><button onClick={() => onReview(task.id, "verify")} className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Verify</button></>}{bucket === "approval" && <button onClick={() => onReview(task.id, "approve")} className="btn-primary px-3 py-2 text-xs">Approve task</button>}{bucket === "blocked" && autonomyState(task) === "blocked" && <button onClick={() => onReview(task.id, "requeue")} className="btn-secondary px-3 py-2 text-xs">Requeue</button>}<button onClick={() => onSelect(task)} className="p-2 text-[var(--faint)] hover:text-[var(--text)]"><ChevronRight className="w-4 h-4" /></button></div>
      </article>;
    })}</div>}
  </section>;
}

function ActivityFeed({ tasks, projects, onSelect }: { tasks: Task[]; projects: Map<string, string>; onSelect: (task: Task) => void }) {
  const ordered = [...tasks].sort((a, b) => eventTime(b).localeCompare(eventTime(a)));
  return <section><div className="mb-5"><h2 className="text-lg font-semibold text-[var(--text)]">Execution activity</h2><p className="text-xs text-[var(--muted)] mt-1">An evidence-led record. Missing timestamps are shown as unknown, never inferred.</p></div>
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">{ordered.length === 0 ? <div className="p-6"><EmptyLane /></div> : ordered.map((task) => <button key={task.id} onClick={() => onSelect(task)} className="w-full text-left grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 px-4 py-3.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)]">
      <span className={cn("mt-1 w-2.5 h-2.5 rounded-full", STATE_META[autonomyState(task) ?? "queued"].dot)} /><span className="min-w-0"><span className="block text-sm font-medium text-[var(--text)] truncate">{task.title}</span><span className="block text-[11px] text-[var(--muted)] mt-1 truncate">{workspaceFor(task, projects)} · {task.executionAgent || task.workerModel || "Worker not recorded"}</span></span><span className="text-[11px] text-[var(--faint)] whitespace-nowrap">{formatWhen(eventTime(task))}</span>
    </button>)}</div>
  </section>;
}

function Controls({ settings, onChange }: { settings: AutonomySettings; onChange: (patch: Partial<AutonomySettings>) => void }) {
  return <section className="grid lg:grid-cols-[1fr_320px] gap-5">
    <div className="space-y-5"><ControlPanel title="Capacity" description="Start conservatively. Bridge never allows more than three simultaneous workers.">
      <ControlRow label="Maximum workers" hint={`${settings.maxConcurrentWorkers} concurrent`}><input aria-label="Maximum workers" type="range" min={1} max={3} value={settings.maxConcurrentWorkers} onChange={(event) => onChange({ maxConcurrentWorkers: Number(event.target.value) })} className="w-36 accent-[var(--text)]" /></ControlRow>
      <ControlRow label="Daily run limit" hint="Hard ceiling per day"><input aria-label="Daily run limit" type="number" min={1} max={24} value={settings.dailyRunLimit} onChange={(event) => onChange({ dailyRunLimit: Math.max(1, Math.min(24, Number(event.target.value) || 1)) })} className="field w-20 px-2 py-1.5 text-sm text-right" /></ControlRow>
      <ControlRow label="Correction attempts" hint="Never loops indefinitely"><input aria-label="Correction attempts" type="number" min={0} max={1} value={settings.maxCorrectionAttempts} onChange={(event) => onChange({ maxCorrectionAttempts: Math.max(0, Math.min(1, Number(event.target.value) || 0)) })} className="field w-20 px-2 py-1.5 text-sm text-right" /></ControlRow>
      <ControlRow label="Working window" hint="AWST · enforced at claim time"><div className="flex items-center gap-2"><input aria-label="Start time" type="time" value={settings.workingHoursStart} onChange={(event) => onChange({ workingHoursStart: event.target.value })} className="field px-2 py-1.5 text-xs" /><span className="text-[var(--faint)]">–</span><input aria-label="End time" type="time" value={settings.workingHoursEnd} onChange={(event) => onChange({ workingHoursEnd: event.target.value })} className="field px-2 py-1.5 text-xs" /></div></ControlRow>
    </ControlPanel>
    <ControlPanel title="Allowed work" description="Workers receive one workspace and one bounded task class.">
      <div className="pb-4 mb-4 border-b border-[var(--border)]"><p className="text-xs font-semibold text-[var(--text)] mb-2.5">Workspaces</p><div className="flex flex-wrap gap-2">{WORKSPACES.map((workspace) => <ChipToggle key={workspace} active={settings.allowedWorkspaces.includes(workspace)} label={workspace} onClick={() => onChange({ allowedWorkspaces: toggleValue(settings.allowedWorkspaces, workspace) })} />)}</div></div>
      <div><p className="text-xs font-semibold text-[var(--text)] mb-2.5">Task classes</p><div className="flex flex-wrap gap-2">{TASK_CLASSES.map(({ id, label }) => <ChipToggle key={id} active={settings.allowedTaskClasses.includes(id)} label={label} onClick={() => onChange({ allowedTaskClasses: toggleValue(settings.allowedTaskClasses, id) })} />)}</div></div>
    </ControlPanel>
    <ControlPanel title="Approval gate" description="Consequential actions remain outside autonomous authority."><ControlRow label="Implementation needs approval" hint="Research and planning can continue"><Switch checked={settings.requireApprovalForImplementation} onChange={(checked) => onChange({ requireApprovalForImplementation: checked })} /></ControlRow></ControlPanel></div>
    <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 h-fit"><div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] mb-4"><ShieldCheck className="w-5 h-5" /></div><h3 className="text-sm font-semibold text-[var(--text)]">Always approval-only</h3><p className="text-xs leading-relaxed text-[var(--muted)] mt-2">External messages, publishing, spending, deployment, security changes, credentials, customer data, deletion, commits, pushes, and merges.</p><div className="mt-5 pt-4 border-t border-[var(--border)] flex items-center gap-2 text-[11px] text-[var(--faint)]">{settings.enabled ? <CirclePlay className="w-3.5 h-3.5 text-[var(--c-emerald)]" /> : <CirclePause className="w-3.5 h-3.5" />}{settings.enabled ? "Eligible work may be claimed" : "All new claims are paused"}</div></aside>
  </section>;
}

function TaskCard({ task, workspace, onClick }: { task: Task; workspace: string; onClick: () => void }) {
  return <button onClick={onClick} className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 hover:border-[var(--border-2)]"><div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium leading-snug text-[var(--text)] line-clamp-2">{task.title}</p><ChevronRight className="w-3.5 h-3.5 text-[var(--faint)] shrink-0 mt-0.5" /></div><div className="flex items-center justify-between gap-2 mt-3"><span className="text-[10.5px] text-[var(--faint)] truncate">{workspace}</span><span className="text-[10px] font-bold text-[var(--muted)]">{task.priority}</span></div></button>;
}

function TaskDrawer({ task, projectName, onClose, onReview }: { task: Task; projectName: string; onClose: () => void; onReview: (id: string, decision: "approve" | "verify" | "requeue" | "reject") => void }) {
  const state = autonomyState(task) ?? "queued";
  const timeline = timelineForTask(task);
  return <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label={`Autonomy task: ${task.title}`}><button className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} aria-label="Close task details" /><aside className="relative w-full max-w-xl h-full bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl overflow-y-auto p-5 sm:p-7 nx-slide-up"><div className="flex items-start justify-between gap-4"><div><StateBadge task={task} /><h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)] mt-3">{task.title}</h2><p className="text-xs text-[var(--muted)] mt-2">{projectName} · {task.taskClass || "Unclassified"} · {task.priority}</p></div><button onClick={onClose} className="p-2 rounded-lg text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"><X className="w-4 h-4" /></button></div>
    <div className="grid sm:grid-cols-2 gap-3 my-6"><EvidenceCard label="Worker" value={task.executionAgent || task.workerModel || "Not recorded"} /><EvidenceCard label="Result note" value={task.resultNoteId || "Not linked"} /></div>
    {task.autonomyBrief && <DetailSection title="Task brief"><p>{task.autonomyBrief}</p></DetailSection>}
    {(task.resultSummary || task.executionNote || task.blockedReason) && <DetailSection title={state === "completed" ? "Verified result" : state === "blocked" ? "Blocker" : "Latest report"}><p>{task.resultSummary || task.blockedReason || task.executionNote}</p></DetailSection>}
    {task.executionEvidence && task.executionEvidence.length > 0 && <DetailSection title="Execution evidence"><ul className="space-y-2">{task.executionEvidence.map((item, index) => <li key={index} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs break-words">{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul></DetailSection>}
    <DetailSection title="Evidence timeline"><div className="space-y-0">{timeline.map((event, index) => <div key={`${event.label}-${index}`} className="grid grid-cols-[16px_1fr] gap-3"><div className="flex flex-col items-center"><span className={cn("w-2.5 h-2.5 rounded-full mt-1", event.tone === "success" ? "bg-[var(--c-emerald)]" : event.tone === "warning" ? "bg-[var(--c-rose)]" : event.tone === "active" ? "bg-[var(--c-purple)]" : "bg-[var(--muted)]")} />{index < timeline.length - 1 && <span className="w-px flex-1 min-h-10 bg-[var(--border)]" />}</div><div className="pb-5"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--text)]">{event.label}</span><span className="text-[10.5px] text-[var(--faint)]">{formatWhen(event.at || "")}</span></div>{event.detail && <p className="text-xs leading-relaxed text-[var(--muted)] mt-1">{event.detail}</p>}</div></div>)}</div></DetailSection>
    <div className="sticky bottom-0 mt-8 -mx-5 sm:-mx-7 px-5 sm:px-7 py-4 bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur border-t border-[var(--border)] flex justify-end gap-2">{state === "awaiting_review" && <><button onClick={() => onReview(task.id, "requeue")} className="btn-secondary px-3 py-2 text-xs">Return</button><button onClick={() => onReview(task.id, "verify")} className="btn-primary px-3 py-2 text-xs">Mark verified</button></>}{state === "needs_input" && <button onClick={() => onReview(task.id, "approve")} className="btn-primary px-3 py-2 text-xs">Approve task</button>}{state === "blocked" && <button onClick={() => onReview(task.id, "requeue")} className="btn-secondary px-3 py-2 text-xs">Requeue</button>}</div>
  </aside></div>;
}

function StateBadge({ task }: { task: Task }) { const state = autonomyState(task) ?? "queued"; const meta = STATE_META[state]; return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] font-semibold", meta.tone)}><span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />{meta.label}</span>; }
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="py-5 border-t border-[var(--border)]"><h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--faint)] mb-3">{title}</h3><div className="text-sm leading-relaxed text-[var(--muted)] whitespace-pre-wrap">{children}</div></section>; }
function EvidenceCard({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-3"><p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--faint)]">{label}</p><p className="text-xs text-[var(--text)] mt-1.5 break-all">{value}</p></div>; }
function EmptyLane() { return <div className="rounded-xl border border-dashed border-[var(--border)] min-h-28 flex items-center justify-center text-center p-4"><p className="text-xs text-[var(--faint)]">No work in this state.</p></div>; }
function EmptyState({ icon, title, body }: { icon: React.ReactElement; title: string; body: string }) { return <div className="rounded-2xl border border-dashed border-[var(--border-2)] py-14 px-6 text-center"><div className="mx-auto w-11 h-11 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)] [&>svg]:w-5 [&>svg]:h-5">{icon}</div><h3 className="text-sm font-semibold text-[var(--text)] mt-4">{title}</h3><p className="text-xs text-[var(--muted)] mt-1.5">{body}</p></div>; }
function ControlPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3><p className="text-xs text-[var(--muted)] mt-1 mb-5">{description}</p><div className="divide-y divide-[var(--border)]">{children}</div></div>; }
function ControlRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-xs font-semibold text-[var(--text)]">{label}</p><p className="text-[10.5px] text-[var(--faint)] mt-0.5">{hint}</p></div><div className="shrink-0">{children}</div></div>; }
function ChipToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) { return <button onClick={onClick} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium", active ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "bg-[var(--bg)] text-[var(--muted)] border-[var(--border)] hover:border-[var(--border-2)]")}>{label}</button>; }
function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) { return <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative w-10 h-6 rounded-full transition-colors", checked ? "bg-[var(--text)]" : "bg-[var(--border-2)]")}><span className={cn("absolute left-1 top-1 w-4 h-4 rounded-full bg-[var(--bg)] transition-transform", checked ? "translate-x-4" : "translate-x-0")} /></button>; }
function toggleValue<T>(values: T[], value: T): T[] { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function workspaceFor(task: Task, projects: Map<string, string>): string { return task.workspace || (task.projectId ? projects.get(task.projectId) : undefined) || task.tag?.replace(/^@/, "") || "Unassigned"; }
function eventTime(task: Task): string { return task.verifiedAt || task.completedAt || task.nightExecutedAt || task.executionStartedAt || task.createdAt || ""; }
function formatWhen(value: string): string { if (!value) return "Unknown"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "Unknown"; return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
