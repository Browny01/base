"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { uid, getToday } from "@/lib/utils";
import { TASK_TAGS, normalizeTaskTag, taskTagLabel, type Task, type Priority, type TaskTag, type RecurringFreq } from "@/lib/store";
import { DEFAULT_TASK_SORT, PRIORITY_META, TASK_SORTS, isTaskSort, priorityLabel, sortTasks, type TaskSort } from "@/lib/task-sort";
import { useStoredPref, writeStored } from "@/lib/prefs";
import { Plus, Trash2, RotateCcw, LayoutList, Columns3, Pencil, Check, X, ChevronDown, ChevronRight, ChevronUp, GripVertical, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITIES = PRIORITY_META;
const TAGS = TASK_TAGS;
const SORT_KEY = "bridge_tasks_sort";
const RECURRING: { value: RecurringFreq; label: string }[] = [
  { value: null, label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function priorityBadge(priority: Priority) {
  return priority === "P1"
    ? "bg-[color-mix(in_srgb,var(--c-rose)_16%,transparent)] text-[var(--c-rose)]"
    : priority === "P2"
      ? "bg-[var(--chip)] text-[var(--text)]"
      : "bg-[var(--chip)] text-[var(--faint)]";
}

export function TasksPage() {
  const { data, mutate } = useBridge();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "today" | TaskTag>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showForm, setShowForm] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const storedSort = useStoredPref(SORT_KEY, DEFAULT_TASK_SORT);
  const sort: TaskSort = isTaskSort(storedSort) ? storedSort : DEFAULT_TASK_SORT;
  const [form, setForm] = useState<{
    title: string; priority: Priority; tag: TaskTag; dueDate: string; recurring: RecurringFreq;
  }>({ title: "", priority: "P2", tag: "work", dueDate: "", recurring: null });

  const today = getToday();

  // ⌘K → "New task" opens the form on arrival
  useEffect(() => { try { if (localStorage.getItem("bridge_open_new_task")) { localStorage.removeItem("bridge_open_new_task"); setShowForm(true); } } catch {} }, []);

  const filtered = data.tasks.filter((t) => {
    if (filter === "today") return t.dueDate === today && !t.done;
    if (filter === "all") return !t.done;
    return t.tag === filter && !t.done;
  });
  const doneTasks = data.tasks.filter((t) => t.done);
  const ordered = sortTasks(filtered, sort);

  function setSort(next: TaskSort) { writeStored(SORT_KEY, next); }

  // Dragging writes `order` values, so it only makes sense in the manual view.
  const canReorder = sort === "custom";

  // Drop `dragId` onto the slot held by `targetId`, then renumber the visible
  // list so `order` stays dense and stable.
  function moveTo(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const list = sortTasks(filtered, "custom");
    const from = list.findIndex((t) => t.id === draggedId);
    const to = list.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const orderMap = new Map(list.map((t, idx) => [t.id, idx]));
    mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t)),
    }));
  }

  function nudge(id: string, dir: -1 | 1) {
    const idx = ordered.findIndex((t) => t.id === id);
    const target = ordered[idx + dir];
    if (target) moveTo(id, target.id);
  }

  function addTask() {
    if (!form.title.trim()) return;
    mutate((d) => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), title: form.title.trim(), priority: form.priority, tag: normalizeTaskTag(form.tag), dueDate: form.dueDate || null, recurring: form.recurring, done: false, createdAt: new Date().toISOString(), order: d.tasks.length }],
    }));
    setForm({ title: "", priority: "P2", tag: "work", dueDate: "", recurring: null });
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
    const patch = updates.tag !== undefined ? { ...updates, tag: normalizeTaskTag(updates.tag) } : updates;
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) }));
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Tasks</h1>
        <div className="flex items-center gap-2">
          <SortMenu value={sort} onChange={setSort} />
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
          <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-base text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="Task title..." value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addTask()} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Priority</label>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <button key={p.value} onClick={() => setForm((f) => ({ ...f, priority: p.value }))} className={cn("flex-1 py-1.5 text-[13px] font-medium rounded-lg transition-colors", form.priority === p.value ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--chip)]")}>{p.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Tag</label>
              <select className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
                {TAGS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Due Date</label>
              <input type="date" className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Recurring</label>
              <select className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={form.recurring ?? ""} onChange={(e) => setForm((f) => ({ ...f, recurring: (e.target.value || null) as RecurringFreq }))}>
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
      <div className="flex gap-1 mb-5 bg-[var(--surface)] p-1 rounded-lg w-fit border border-[var(--border)] max-w-full overflow-x-auto">
        {(["all", "today", ...TAGS.map((t) => t.value)] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors", filter === f ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>
            {f === "all" ? "All" : f === "today" ? "Today" : taskTagLabel(f)}
          </button>
        ))}
      </div>

      {/* ── List View ── */}
      {view === "list" && (
        <>
          <div className="space-y-2.5 mb-8 max-w-4xl">
            {ordered.length === 0 ? (
              <p className="text-base text-[var(--muted)] py-4 text-center">No tasks here. You&apos;re clear!</p>
            ) : (
              ordered.map((task, idx) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={idx}
                  lastIndex={ordered.length - 1}
                  today={today}
                  canReorder={canReorder}
                  dragId={dragId}
                  overId={overId}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onEdit={editTask}
                  onDragStart={setDragId}
                  onDragOver={setOverId}
                  onDragLeave={(id) => setOverId((o) => (o === id ? null : o))}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onNudge={nudge}
                  onDrop={(targetId) => { if (dragId) moveTo(dragId, targetId); setDragId(null); setOverId(null); }}
                />
              ))
            )}
          </div>
          {doneTasks.length > 0 && (
            <div>
              <h2 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Completed ({doneTasks.length})</h2>
              <div className="space-y-2.5 max-w-4xl">
                {doneTasks.slice(0, 10).map((task) => (
                  <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} onEdit={editTask} />
                ))}
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

function SortMenu({ value, onChange }: { value: TaskSort; onChange: (s: TaskSort) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Sort tasks"
        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{TASK_SORTS.find((o) => o.value === value)?.label ?? value}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-1 z-50 w-56 bg-[var(--surface)] border border-[var(--border-2)] rounded-xl shadow-xl p-1.5 nx-pop">
            {TASK_SORTS.map((opt) => (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "w-full px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors",
                  opt.value === value ? "bg-[var(--chip)] text-[var(--text)] font-medium" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
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
  const columns: { key: Priority | "done"; tasks: Task[] }[] = [
    { key: "P1", tasks: filtered.filter((t) => t.priority === "P1") },
    { key: "P2", tasks: filtered.filter((t) => t.priority === "P2") },
    { key: "P3", tasks: filtered.filter((t) => t.priority === "P3") },
    { key: "done", tasks: doneTasks },
  ];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
      {columns.map(({ key, tasks }) => {
        const label = key === "done" ? "Done" : priorityLabel(key);
        const border = key === "done" || key === "P1" || key === "P2" ? "border-[var(--border-2)]" : "border-[var(--border)]";

        return (
          <div key={key} className={cn("flex flex-col w-80 sm:w-96 shrink-0 rounded-xl border bg-[var(--chip)] p-3.5", border)}>
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={cn("text-[15px] font-semibold", key === "P3" ? "text-[var(--muted)]" : "text-[var(--text)]")}>{label}</span>
              <span className="text-xs text-[var(--faint)] bg-[var(--surface)] px-2 py-0.5 rounded-full tabular">{tasks.length}</span>
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
  const [editForm, setEditForm] = useState({ title: task.title, priority: task.priority, tag: normalizeTaskTag(task.tag), dueDate: task.dueDate ?? "" });

  function saveEdit() {
    onEdit(task.id, { title: editForm.title.trim() || task.title, priority: editForm.priority, tag: normalizeTaskTag(editForm.tag), dueDate: editForm.dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-3.5 space-y-2.5">
        <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        <div className="flex gap-1">
          {PRIORITIES.map((p) => (
            <button key={p.value} onClick={() => setEditForm((f) => ({ ...f, priority: p.value }))} className={cn("flex-1 py-1 text-xs font-medium rounded transition-colors", editForm.priority === p.value ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{p.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={editForm.tag} onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
            {TAGS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
          </select>
          <input type="date" className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div className="flex gap-1 justify-end">
          <button onClick={() => setEditing(false)} className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"><X className="w-3.5 h-3.5" /></button>
          <button onClick={saveEdit} className="p-1 text-[var(--text)] hover:text-[var(--text)] transition-colors"><Check className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 group hover:border-[var(--border)] transition-colors">
      <div className="flex items-start gap-2.5">
        <button onClick={() => onToggle(task.id)} aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`} className={cn("w-4 h-4 mt-1 rounded border flex items-center justify-center shrink-0 transition-colors", task.done ? "bg-[var(--text)] border-[var(--border-2)]" : "border-[var(--border-2)] hover:bg-[var(--chip)]")}>
          {task.done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <p className={cn("flex-1 text-[15px] leading-snug min-w-0", task.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{task.title}</p>
        <div className="opacity-0 group-hover:opacity-100 flex shrink-0 gap-0.5">
          <button onClick={() => setEditing(true)} title="Edit task" aria-label={`Edit ${task.title}`} className="p-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onDelete(task.id)} title="Delete task" aria-label={`Delete ${task.title}`} className="p-0.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5 text-[13px] text-[var(--faint)]">
        <span>{taskTagLabel(task.tag)}</span>
        {task.dueDate && <span className={cn(task.dueDate < today && !task.done ? "text-[var(--text)]" : "")}>{task.dueDate}</span>}
        {task.recurring && <RotateCcw className="w-3.5 h-3.5 text-[var(--text)]" />}
      </div>
    </div>
  );
}

// ── List Row ────────────────────────────────────────────────────────────────────

function TaskRow({ task, today, onToggle, onDelete, onEdit, index, lastIndex, canReorder = false, dragId = null, overId = null, onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop, onNudge }: {
  task: Task; today: string;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
  index?: number; lastIndex?: number;
  canReorder?: boolean; dragId?: string | null; overId?: string | null;
  onDragStart?: (id: string) => void; onDragOver?: (id: string) => void;
  onDragLeave?: (id: string | null) => void; onDragEnd?: () => void;
  onDrop?: (targetId: string) => void;
  onNudge?: (id: string, dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [editForm, setEditForm] = useState({ title: task.title, priority: task.priority, tag: normalizeTaskTag(task.tag), dueDate: task.dueDate ?? "" });

  function saveEdit() {
    onEdit(task.id, { title: editForm.title.trim() || task.title, priority: editForm.priority, tag: normalizeTaskTag(editForm.tag), dueDate: editForm.dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 space-y-3">
        <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-base text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button key={p.value} onClick={() => setEditForm((f) => ({ ...f, priority: p.value }))} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", editForm.priority === p.value ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{p.label}</button>
            ))}
          </div>
          <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={editForm.tag} onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
            {TAGS.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
          </select>
          <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
          <div className="ml-auto flex gap-1">
            <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
            <button onClick={saveEdit} className="px-3 py-1 text-sm bg-[var(--text)] hover:text-[var(--text-hover)] text-[var(--bg)] rounded-lg transition-colors flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Save</button>
          </div>
        </div>
      </div>
    );
  }

  const subs = task.subtasks ?? [];
  const subDone = subs.filter((s) => s.done).length;
  const setSubs = (next: typeof subs) => onEdit(task.id, { subtasks: next });
  const addSub = () => { const t = newSub.trim(); if (!t) return; setSubs([...subs, { id: uid(), title: t, done: false }]); setNewSub(""); };
  const draggable = Boolean(canReorder && onDragStart && onDragOver && onDragEnd && onDrop);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { if (!draggable) return; e.dataTransfer.effectAllowed = "move"; onDragStart!(task.id); }}
      onDragEnd={() => { if (draggable) onDragEnd!(); }}
      onDragOver={(e) => { if (!draggable) return; e.preventDefault(); onDragOver!(task.id); }}
      onDragLeave={() => { if (draggable) onDragLeave?.(null); }}
      onDrop={(e) => { if (!draggable) return; e.preventDefault(); onDrop!(task.id); }}
      className={cn(
        "bg-[var(--surface)] border rounded-xl group transition-colors",
        overId === task.id ? "border-[var(--text)]" : "border-[var(--border)]",
        dragId === task.id && "opacity-40",
      )}
    >
      <div className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
        {/* Drag handle + keyboard reorder */}
        {draggable ? (
          <div className="flex flex-col items-center shrink-0 -my-1">
            <button
              onClick={() => onNudge?.(task.id, -1)}
              disabled={index === 0}
              aria-label={`Move ${task.title} up`}
              className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <GripVertical className="w-4 h-4 text-[var(--faint)] cursor-grab active:cursor-grabbing" />
            <button
              onClick={() => onNudge?.(task.id, 1)}
              disabled={lastIndex !== undefined && index === lastIndex}
              aria-label={`Move ${task.title} down`}
              className="text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--faint)] transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <button onClick={() => onToggle(task.id)} aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`} className={cn("w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors", task.done ? "bg-[var(--text)] border-[var(--border-2)]" : "border-[var(--border-2)] hover:bg-[var(--chip)]")}>
          {task.done && <svg viewBox="0 0 12 12" className="w-3 h-3 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>

        <span className={cn("flex-1 text-[15px] leading-snug min-w-0 truncate", task.done ? "text-[var(--muted)] line-through" : "text-[var(--text)]")}>{task.title}</span>

        <div className="flex items-center gap-2.5 text-[13px] shrink-0">
          {subs.length > 0 && <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-[var(--faint)] hover:text-[var(--text)]">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}<span className="tabular">{subDone}/{subs.length}</span></button>}
          {task.recurring && <RotateCcw className="w-3.5 h-3.5 text-[var(--text)]" />}
          <span className="text-[var(--muted)] hidden sm:inline">{taskTagLabel(task.tag)}</span>
          <span className={cn("font-medium px-2 py-0.5 rounded-md", priorityBadge(task.priority))}>{priorityLabel(task.priority)}</span>
          {task.dueDate && <span className={cn("hidden sm:inline", task.dueDate < today && !task.done ? "text-[var(--text)]" : "text-[var(--muted)]")}>{task.dueDate}</span>}
          <button onClick={() => setExpanded((v) => !v)} title="Subtasks" aria-label={`Subtasks for ${task.title}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Plus className="w-4 h-4" /></button>
          <button onClick={() => setEditing(true)} title="Edit task" aria-label={`Edit ${task.title}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onDelete(task.id)} title="Delete task" aria-label={`Delete ${task.title}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 pl-[4.5rem] space-y-2">
          {subs.length > 0 && <div className="w-full bg-[var(--chip)] rounded-full h-1 overflow-hidden mb-2"><div className="h-1 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${subs.length ? (subDone / subs.length) * 100 : 0}%` }} /></div>}
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2 group/sub">
              <button onClick={() => setSubs(subs.map((x) => x.id === s.id ? { ...x, done: !x.done } : x))} aria-label={`Toggle subtask ${s.title}`} className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", s.done ? "bg-[var(--accent)] border-[var(--accent)]" : "border-[var(--border-2)]")}>{s.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</button>
              <span className={cn("flex-1 text-sm", s.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{s.title}</span>
              <button onClick={() => setSubs(subs.filter((x) => x.id !== s.id))} aria-label={`Remove subtask ${s.title}`} className="opacity-0 group-hover/sub:opacity-100 text-[var(--faint)] hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-0.5">
            <Plus className="w-4 h-4 text-[var(--faint)] shrink-0" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSub()} placeholder="Add subtask…" aria-label="Add subtask" className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" />
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
