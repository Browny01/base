"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { uid, getToday } from "@/lib/utils";
import type { Task, Priority, TaskTag, RecurringFreq } from "@/lib/store";
import { Plus, Trash2, RotateCcw, LayoutList, Columns3, Pencil, Check, X, ChevronDown, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITIES: Priority[] = ["P1", "P2", "P3"];
const TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];
const RECURRING: { value: RecurringFreq; label: string }[] = [
  { value: null, label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const PRIORITY_STYLE: Record<Priority, { badge: string; col: string; label: string }> = {
  P1: { badge: "bg-[var(--chip)] text-[var(--text)]",    col: "border-[var(--border-2)]",    label: "Urgent" },
  P2: { badge: "bg-[var(--chip)] text-[var(--text)]", col: "border-[var(--border-2)]", label: "Normal" },
  P3: { badge: "bg-[var(--chip)] text-[var(--muted)]",   col: "border-[var(--border)]",  label: "Later"  },
};

export function TasksPage() {
  const { data, mutate } = useBridge();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "today" | TaskTag>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    title: string; priority: Priority; tag: TaskTag; dueDate: string; recurring: RecurringFreq;
  }>({ title: "", priority: "P2", tag: "@work", dueDate: "", recurring: null });

  const today = getToday();

  // ⌘K → "New task" opens the form on arrival
  useEffect(() => { try { if (localStorage.getItem("bridge_open_new_task")) { localStorage.removeItem("bridge_open_new_task"); setShowForm(true); } } catch {} }, []);

  const filtered = data.tasks.filter((t) => {
    if (filter === "today") return t.dueDate === today && !t.done;
    if (filter === "all") return !t.done;
    return t.tag === filter && !t.done;
  });
  const doneTasks = data.tasks.filter((t) => t.done);

  function addTask() {
    if (!form.title.trim()) return;
    mutate((d) => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), title: form.title.trim(), priority: form.priority, tag: form.tag, dueDate: form.dueDate || null, recurring: form.recurring, done: false, createdAt: new Date().toISOString() }],
    }));
    setForm({ title: "", priority: "P2", tag: "@work", dueDate: "", recurring: null });
    setShowForm(false);
  }

  function toggleTask(id: string) {
    mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        if (done && t.recurring) setTimeout(() => resetRecurring(t), 0);
        return { ...t, done, completedAt: done ? new Date().toISOString() : null };
      }),
    }));
  }

  function resetRecurring(task: Task) {
    const nextDue = computeNextDue(task.dueDate, task.recurring!);
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === task.id ? { ...t, done: false, completedAt: null, dueDate: nextDue } : t) }));
  }

  function deleteTask(id: string) {
    const removed = data.tasks.find((t) => t.id === id);
    mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    if (removed) toast("Task deleted", { action: { label: "Undo", onClick: () => mutate((d) => ({ ...d, tasks: [...d.tasks, removed] })) } });
  }

  function editTask(id: string, updates: Partial<Task>) {
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? { ...t, ...updates } : t) }));
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Tasks</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
            <button onClick={() => setView("list")} className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setView("kanban")} className={cn("p-1.5 rounded-md transition-colors", view === "kanban" ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 mb-6 space-y-3">
          <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="Task title..." value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addTask()} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Priority</label>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <button key={p} onClick={() => setForm((f) => ({ ...f, priority: p }))} className={cn("flex-1 py-1 text-xs font-bold rounded transition-colors", form.priority === p ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--chip)] text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--chip)]")}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Tag</label>
              <select className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
                {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Due Date</label>
              <input type="date" className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Recurring</label>
              <select className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={form.recurring ?? ""} onChange={(e) => setForm((f) => ({ ...f, recurring: (e.target.value || null) as RecurringFreq }))}>
                {RECURRING.map((r) => <option key={String(r.value)} value={r.value ?? ""}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={addTask} className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors">Add Task</button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-5 bg-[var(--surface)] p-1 rounded-lg w-fit border border-[var(--border)]">
        {(["all", "today", ...TAGS] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", filter === f ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
            {f === "all" ? "All" : f === "today" ? "Today" : f}
          </button>
        ))}
      </div>

      {/* ── List View ── */}
      {view === "list" && (
        <>
          <div className="space-y-2 mb-8">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--muted)] py-4 text-center">No tasks here. You&apos;re clear!</p>
            ) : (
              filtered
                .sort((a, b) => ({ P1: 0, P2: 1, P3: 2 }[a.priority] - { P1: 0, P2: 1, P3: 2 }[b.priority]))
                .map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} onEdit={editTask} />)
            )}
          </div>
          {doneTasks.length > 0 && (
            <div>
              <h2 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Completed ({doneTasks.length})</h2>
              <div className="space-y-2">
                {doneTasks.slice(0, 10).map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} onEdit={editTask} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Kanban View ── */}
      {view === "kanban" && (
        <KanbanBoard
          filtered={filtered}
          doneTasks={doneTasks.slice(0, 20)}
          today={today}
          onToggle={toggleTask}
          onDelete={deleteTask}
          onEdit={editTask}
        />
      )}
    </div>
  );
}

// ── Kanban Board ────────────────────────────────────────────────────────────────

function KanbanBoard({ filtered, doneTasks, today, onToggle, onDelete, onEdit }: {
  filtered: Task[]; doneTasks: Task[]; today: string;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
}) {
  const columns: { priority: Priority | "done"; label: string; tasks: Task[] }[] = [
    { priority: "P1", label: "Urgent", tasks: filtered.filter((t) => t.priority === "P1") },
    { priority: "P2", label: "Normal", tasks: filtered.filter((t) => t.priority === "P2") },
    { priority: "P3", label: "Later",  tasks: filtered.filter((t) => t.priority === "P3") },
    { priority: "done", label: "Done", tasks: doneTasks },
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
      {columns.map(({ priority, label, tasks }) => {
        const style = priority === "done"
          ? { header: "text-[var(--text)]", border: "border-[var(--border-2)]", colBg: "bg-[var(--chip)]" }
          : { header: `${PRIORITY_STYLE[priority as Priority].badge.split(" ")[1]}`, border: PRIORITY_STYLE[priority as Priority].col, colBg: "bg-[var(--chip)]" };

        return (
          <div key={priority} className={cn("flex flex-col w-72 shrink-0 rounded-xl border p-3", style.border, style.colBg)}>
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={cn("text-sm font-semibold", priority === "done" ? "text-[var(--text)]" : priority === "P1" ? "text-[var(--text)]" : priority === "P2" ? "text-[var(--text)]" : "text-[var(--muted)]")}>{label}</span>
              <span className="text-xs text-[var(--faint)] bg-[var(--chip)] px-2 py-0.5 rounded-full">{tasks.length}</span>
            </div>

            {/* Cards */}
            <div className="space-y-2 flex-1">
              {tasks.length === 0 ? (
                <div className="border border-dashed border-[var(--border)] rounded-lg py-8 text-center text-[var(--faint)] text-xs">Empty</div>
              ) : (
                tasks.map((task) => (
                  <KanbanCard key={task.id} task={task} today={today} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ task, today, onToggle, onDelete, onEdit }: {
  task: Task; today: string;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: task.title, priority: task.priority, tag: task.tag, dueDate: task.dueDate ?? "" });

  function saveEdit() {
    onEdit(task.id, { title: editForm.title.trim() || task.title, priority: editForm.priority, tag: editForm.tag, dueDate: editForm.dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-lg p-3 space-y-2">
        <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        <div className="flex gap-1">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => setEditForm((f) => ({ ...f, priority: p }))} className={cn("flex-1 py-0.5 text-xs font-bold rounded transition-colors", editForm.priority === p ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{p}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.tag} onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
            {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div className="flex gap-1 justify-end">
          <button onClick={() => setEditing(false)} className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"><X className="w-3.5 h-3.5" /></button>
          <button onClick={saveEdit} className="p-1 text-[var(--text)] hover:text-[var(--text)] transition-colors"><Check className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 group hover:border-[var(--border)] transition-colors">
      <div className="flex items-start gap-2">
        <button onClick={() => onToggle(task.id)} className={cn("w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors", task.done ? "bg-[var(--text)] border-[var(--border-2)]" : "border-[var(--border)] hover:border-[var(--border-2)]")}>
          {task.done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <p className={cn("flex-1 text-sm leading-snug min-w-0", task.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{task.title}</p>
        <div className="opacity-0 group-hover:opacity-100 flex shrink-0 gap-0.5">
          <button onClick={() => setEditing(true)} className="p-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(task.id)} className="p-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-[var(--faint)]">
        <span>{task.tag}</span>
        {task.dueDate && <span className={cn(task.dueDate < today && !task.done ? "text-[var(--text)]" : "")}>{task.dueDate}</span>}
        {task.recurring && <RotateCcw className="w-3 h-3 text-[var(--text)]" />}
      </div>
    </div>
  );
}

// ── List Row ────────────────────────────────────────────────────────────────────

function TaskRow({ task, today, onToggle, onDelete, onEdit }: {
  task: Task; today: string;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [editForm, setEditForm] = useState({ title: task.title, priority: task.priority, tag: task.tag, dueDate: task.dueDate ?? "" });

  function saveEdit() {
    onEdit(task.id, { title: editForm.title.trim() || task.title, priority: editForm.priority, tag: editForm.tag, dueDate: editForm.dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-lg p-3 space-y-2">
        <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button key={p} onClick={() => setEditForm((f) => ({ ...f, priority: p }))} className={cn("px-2 py-0.5 text-xs font-bold rounded transition-colors", editForm.priority === p ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{p}</button>
            ))}
          </div>
          <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.tag} onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
            {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
          <div className="ml-auto flex gap-1">
            <button onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
            <button onClick={saveEdit} className="px-3 py-1 text-xs bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] rounded-lg transition-colors flex items-center gap-1"><Check className="w-3 h-3" /> Save</button>
          </div>
        </div>
      </div>
    );
  }

  const subs = task.subtasks ?? [];
  const subDone = subs.filter((s) => s.done).length;
  const setSubs = (next: typeof subs) => onEdit(task.id, { subtasks: next });
  const addSub = () => { const t = newSub.trim(); if (!t) return; setSubs([...subs, { id: uid(), title: t, done: false }]); setNewSub(""); };
  const breakDown = async () => {
    setBreaking(true);
    try {
      const res = await fetch("/api/tasks/breakdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: task.title }) });
      const j = await res.json();
      if (j.ok && Array.isArray(j.subtasks)) { setSubs([...subs, ...j.subtasks.map((t: string) => ({ id: uid(), title: t, done: false }))]); setExpanded(true); }
    } catch { /* ignore */ }
    setBreaking(false);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg group hover:border-[var(--border)] transition-colors">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onToggle(task.id)} className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", task.done ? "bg-[var(--text)] border-[var(--border-2)]" : "border-[var(--border)] hover:border-[var(--border-2)]")}>
          {task.done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <span className={cn("flex-1 text-sm min-w-0 truncate", task.done ? "text-[var(--muted)] line-through" : "text-[var(--text)]")}>{task.title}</span>
        <div className="flex items-center gap-2 text-xs shrink-0">
          {subs.length > 0 && <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[var(--faint)] hover:text-[var(--text)]">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}<span className="tabular">{subDone}/{subs.length}</span></button>}
          {task.recurring && <RotateCcw className="w-3 h-3 text-[var(--text)]" />}
          <span className="text-[var(--muted)] hidden sm:inline">{task.tag}</span>
          <span className={cn("font-bold px-1.5 py-0.5 rounded", task.priority === "P1" ? "bg-[var(--chip)] text-[var(--text)]" : task.priority === "P2" ? "bg-[var(--chip)] text-[var(--text)]" : "bg-[var(--chip)] text-[var(--muted)]")}>{task.priority}</span>
          {task.dueDate && <span className={cn("hidden sm:inline", task.dueDate < today && !task.done ? "text-[var(--text)]" : "text-[var(--muted)]")}>{task.dueDate}</span>}
          <button onClick={breakDown} disabled={breaking} title="Break into subtasks with AI" className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent)] transition-all disabled:opacity-100">{breaking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}</button>
          <button onClick={() => setExpanded((v) => !v)} title="Subtasks" className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Plus className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 pl-11 space-y-1.5">
          {subs.length > 0 && <div className="w-full bg-[var(--chip)] rounded-full h-1 overflow-hidden mb-1"><div className="h-1 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${subs.length ? (subDone / subs.length) * 100 : 0}%` }} /></div>}
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2 group/sub">
              <button onClick={() => setSubs(subs.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))} className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0", s.done ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border-2)]")}>{s.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}</button>
              <span className={cn("flex-1 text-[13px]", s.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{s.title}</span>
              <button onClick={() => setSubs(subs.filter((x) => x.id !== s.id))} className="opacity-0 group-hover/sub:opacity-100 text-[var(--faint)] hover:text-red-500"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <Plus className="w-3.5 h-3.5 text-[var(--faint)] shrink-0" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add subtask…" className="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
          </div>
        </div>
      )}
    </div>
  );
}

function computeNextDue(current: string | null, freq: "daily" | "weekly" | "monthly"): string {
  const base = current ? new Date(current) : new Date();
  if (freq === "daily") base.setDate(base.getDate() + 1);
  else if (freq === "weekly") base.setDate(base.getDate() + 7);
  else base.setMonth(base.getMonth() + 1);
  return base.toISOString().split("T")[0];
}
