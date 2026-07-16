"use client";

import { useState, useMemo, useEffect } from "react";
import { useNexus } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { LockInSession, LockInTask, LockInTaskKind } from "@/lib/store";
import {
  Lock, Plus, X, Trash2, Pencil, Flame, Trophy, Target, CalendarRange,
  Dumbbell, BookOpen, Briefcase, Brain, HeartPulse, Star, Check, ChevronLeft,
  BarChart3, Settings2, Archive, AlertTriangle, Zap, Sparkles, CalendarPlus,
  type LucideIcon,
} from "lucide-react";
import {
  summarize, dayStatus, tasksDueOn, overdueOn, isTaskDoneOn, parseYmd,
  todayYmd, daysBetween, addDays, streakMult, projectedDailyStreak, getRank,
  EARLY_MULT, type PointEventType, type DayQuality,
} from "@/lib/lockin-engine";

// ── Categories, icons & templates ─────────────────────────────────────────────────

const CATEGORIES: { key: string; Icon: LucideIcon }[] = [
  { key: "Gym",      Icon: Dumbbell },
  { key: "Study",    Icon: BookOpen },
  { key: "Business", Icon: Briefcase },
  { key: "Mind",     Icon: Brain },
  { key: "Health",   Icon: HeartPulse },
  { key: "Other",    Icon: Star },
];
const catIcon = (c: string): LucideIcon => CATEGORIES.find(x => x.key === c)?.Icon ?? Star;

const ICONS = [
  "💪","🏋️","🏃","🚴","🤸","🧘","⚽","🏀","🏊","🥊","🎽","🥅",
  "🥗","🍎","💧","😴","🩺","🧴","🚿","☀️","🌙","🛏️",
  "📚","📖","✍️","📝","🧠","🎓","💡","🔬","🧮","🗣️","🌐","⏰","📅","🔁",
  "💼","💰","📈","📊","💵","🤝","📞","✉️","🧾","🏦","🚀","🎯",
  "🎨","🎸","🎹","📸","🎥","🎮","☕","🍳","🧹","🌱","🔥","⭐","✅","🏆","🧊","⚡",
];

type SeedTask = { title: string; category: string; kind: LockInTaskKind; icon?: string };
const TEMPLATES: { key: string; name: string; days: number; desc: string; tasks: SeedTask[] }[] = [
  { key: "custom", name: "Custom", days: 30, desc: "Blank slate — add your own tasks", tasks: [] },
  { key: "75hard", name: "75 Hard-style", days: 75, desc: "Two workouts, reading, diet, water — zero compromise", tasks: [
    { title: "Workout #1", category: "Gym", kind: "daily", icon: "🏋️" },
    { title: "Workout #2 (outdoor)", category: "Gym", kind: "daily", icon: "🏃" },
    { title: "Read 10 pages", category: "Mind", kind: "daily", icon: "📖" },
    { title: "Stick to the diet", category: "Health", kind: "daily", icon: "🥗" },
    { title: "Drink 3L water", category: "Health", kind: "daily", icon: "💧" },
  ] },
  { key: "exam", name: "Exam Crunch", days: 14, desc: "Daily study blocks + revision", tasks: [
    { title: "3h focused study", category: "Study", kind: "daily", icon: "📚" },
    { title: "Review yesterday's notes", category: "Study", kind: "daily", icon: "📝" },
    { title: "Gym / move body", category: "Gym", kind: "daily", icon: "💪" },
  ] },
  { key: "biz", name: "Business Sprint", days: 30, desc: "Outreach + build, every single day", tasks: [
    { title: "10 outreach messages", category: "Business", kind: "daily", icon: "📞" },
    { title: "2h deep work on product", category: "Business", kind: "daily", icon: "🚀" },
    { title: "Post 1 piece of content", category: "Business", kind: "daily", icon: "📸" },
  ] },
];

const TYPE_LABEL: Record<PointEventType, string> = {
  earned: "Base completions", streak: "Streak bonuses", early: "Early bonuses (×2)",
  late: "Late completions", penalty: "Missed penalties",
};

// calendar colours
const QUALITY_STYLE: Record<DayQuality, { bg?: string; text: string }> = {
  extra:    { bg: "#166534", text: "#ffffff" }, // dark green — all done + bonus
  perfect:  { bg: "#22c55e", text: "#ffffff" }, // green — all done
  near:     { bg: "#bbf7d0", text: "#14532d" }, // light green — missed exactly 1
  fail:     { bg: "#dc2626", text: "#ffffff" }, // red — missed 2+
  progress: { text: "var(--text)" },            // today, in progress
  rest:     { text: "var(--faint)" },
  future:   { text: "var(--faint)" },
};
const ORANGE = "#f97316";

const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors";
const labelCls = "text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5";
const fmtLong = (d: string) => parseYmd(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d: string) => parseYmd(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// ── Progress ring ──────────────────────────────────────────────────────────────────
function Ring({ value, size = 56, stroke = 5, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chip)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--text)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// ── Task modal (add / edit) ─────────────────────────────────────────────────────────
function TaskModal({ session, task, defaultDate, onSave, onDelete, onClose }: {
  session: LockInSession;
  task: LockInTask | null;
  defaultDate: string;
  onSave: (t: LockInTask) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle]       = useState(task?.title ?? "");
  const [category, setCategory] = useState(task?.category ?? "Gym");
  const [kind, setKind]         = useState<LockInTaskKind>(task?.kind ?? "daily");
  const [date, setDate]         = useState(task?.date ?? defaultDate);
  const [points, setPoints]     = useState((task?.points ?? session.basePoints).toString());
  const [icon, setIcon]         = useState<string>(task?.icon ?? "");

  function save() {
    if (!title.trim()) return;
    onSave({
      id: task?.id ?? uid(),
      title: title.trim(),
      category, kind,
      date: kind === "specific" ? date : undefined,
      points: Math.max(1, parseInt(points) || session.basePoints),
      icon: icon || undefined,
      createdAt: task?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)] sticky top-0 z-10">
          <p className="text-sm font-bold text-[var(--text)]">{task ? "Edit Task" : "Add Task"}</p>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Task</label>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-lg shrink-0">
                {icon || <span className="text-[var(--faint)] text-sm">{title.slice(0, 1).toUpperCase() || "?"}</span>}
              </span>
              <input autoFocus className={inputCls} placeholder="e.g. 3h deep work" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Icon</label>
            <div className="grid grid-cols-9 gap-1 max-h-[132px] overflow-y-auto p-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
              <button onClick={() => setIcon("")} title="No icon"
                className={cn("flex items-center justify-center aspect-square rounded-md text-[10px] text-[var(--faint)] transition-colors", icon === "" ? "bg-[var(--text)] text-[var(--bg)]" : "hover:bg-[var(--chip)]")}>
                ✕
              </button>
              {ICONS.map(e => (
                <button key={e} onClick={() => setIcon(e)}
                  className={cn("flex items-center justify-center aspect-square rounded-md text-base transition-colors", icon === e ? "bg-[var(--text)] ring-1 ring-[var(--text)]" : "hover:bg-[var(--chip)]")}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORIES.map(({ key, Icon }) => (
                <button key={key} onClick={() => setCategory(key)}
                  className={cn("flex items-center gap-1.5 px-2 py-2 rounded-lg border text-[12px] font-medium transition-colors",
                    category === key ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}>
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} /> {key}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Frequency</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setKind("daily")}
                className={cn("px-3 py-2 rounded-lg border text-[12.5px] font-medium transition-colors text-left",
                  kind === "daily" ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}>
                Every day
                <span className={cn("block text-[10px] font-normal mt-0.5", kind === "daily" ? "text-[var(--bg)]/70" : "text-[var(--faint)]")}>builds streak ×</span>
              </button>
              <button onClick={() => setKind("specific")}
                className={cn("px-3 py-2 rounded-lg border text-[12.5px] font-medium transition-colors text-left",
                  kind === "specific" ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}>
                Specific day
                <span className={cn("block text-[10px] font-normal mt-0.5", kind === "specific" ? "text-[var(--bg)]/70" : "text-[var(--faint)]")}>early = ×2</span>
              </button>
            </div>
          </div>

          {kind === "specific" && (
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" min={session.startDate} max={session.endDate} className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}

          <div>
            <label className={labelCls}>Base points</label>
            <input type="number" min="1" className={inputCls} value={points} onChange={e => setPoints(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--surface)]">
          {task && onDelete ? (
            <button onClick={() => { if (confirm("Delete this task?")) { onDelete(task.id); onClose(); } }}
              className="text-xs text-[var(--text)] hover:opacity-70 font-medium transition-opacity">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={save} className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">{task ? "Save" : "Add Task"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New session modal ───────────────────────────────────────────────────────────────
function NewSessionModal({ onCreate, onClose }: { onCreate: (s: LockInSession) => void; onClose: () => void }) {
  const [tplKey, setTplKey] = useState("custom");
  const tpl = TEMPLATES.find(t => t.key === tplKey)!;
  const [name, setName]   = useState("");
  const [start, setStart] = useState(todayYmd());
  const [end, setEnd]     = useState(addDays(todayYmd(), tpl.days - 1));
  const [base, setBase]   = useState("10");

  function pickTpl(k: string) {
    const t = TEMPLATES.find(x => x.key === k)!;
    setTplKey(k);
    setEnd(addDays(start, t.days - 1));
    if (!name) setName(t.key === "custom" ? "" : t.name);
  }

  function create() {
    const basePts = Math.max(1, parseInt(base) || 10);
    const now = new Date().toISOString();
    const tasks: LockInTask[] = tpl.tasks.map(s => ({
      id: uid(), title: s.title, category: s.category, kind: s.kind, icon: s.icon, points: basePts, createdAt: now,
    }));
    onCreate({
      id: uid(),
      name: name.trim() || tpl.name || "Lock-In",
      startDate: start, endDate: end < start ? start : end,
      tasks, completions: [], basePoints: basePts, archived: false, createdAt: now,
    });
    onClose();
  }

  const totalDays = daysBetween(start, end) + 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)] sticky top-0">
          <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} /><p className="text-sm font-bold text-[var(--text)]">Start a Lock-In</p></div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Template</label>
            <div className="space-y-1.5">
              {TEMPLATES.map(t => (
                <button key={t.key} onClick={() => pickTpl(t.key)}
                  className={cn("w-full text-left px-3 py-2.5 rounded-xl border transition-colors",
                    tplKey === t.key ? "border-[var(--text)] bg-[var(--chip)]" : "border-[var(--border)] hover:bg-[var(--chip)]")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[var(--text)]">{t.name}</span>
                    <span className="text-[10px] text-[var(--faint)]">{t.days}d · {t.tasks.length} tasks</span>
                  </div>
                  <p className="text-[11px] text-[var(--faint)] mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} placeholder={tpl.name === "Custom" ? "e.g. Summer Lock-In" : tpl.name} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Start</label><input type="date" className={inputCls} value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></div>
            <div><label className={labelCls}>End</label><input type="date" min={start} className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div>
            <label className={labelCls}>Base points per task</label>
            <input type="number" min="1" className={inputCls} value={base} onChange={e => setBase(e.target.value)} />
          </div>
          <p className="text-[11px] text-[var(--faint)] bg-[var(--chip)] border border-[var(--border)] rounded-lg px-3 py-2">
            {totalDays} day lock-in · {tpl.tasks.length} starting task{tpl.tasks.length !== 1 ? "s" : ""}. You can add more tasks (including specific-day ones) after creating.
          </p>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--surface)]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl transition-colors">Cancel</button>
          <button onClick={create} className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">Lock In</button>
        </div>
      </div>
    </div>
  );
}

// ── Breakdown modal ───────────────────────────────────────────────────────────────
function BreakdownModal({ session, onClose }: { session: LockInSession; onClose: () => void }) {
  const sum = useMemo(() => summarize(session), [session]);
  const cats = Object.entries(sum.byCategory).sort((a, b) => b[1] - a[1]);
  const recent = [...sum.events].reverse().slice(0, 60);

  const rows: { type: PointEventType; value: number }[] = [
    { type: "earned", value: sum.baseEarned },
    { type: "streak", value: sum.streakBonus },
    { type: "early", value: sum.earlyBonus },
    { type: "penalty", value: sum.penalties },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)] sticky top-0 z-10">
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} /><p className="text-sm font-bold text-[var(--text)]">Points Breakdown</p></div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-end justify-between">
            <p className="text-xs text-[var(--faint)]">Net total</p>
            <p className="text-3xl font-extrabold text-[var(--text)] tabular">{sum.net}</p>
          </div>

          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.type} className="flex items-center justify-between bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                <span className="text-[12.5px] text-[var(--muted)]">{TYPE_LABEL[r.type]}</span>
                <span className="text-sm font-bold tabular text-[var(--text)]">{r.value >= 0 ? "+" : ""}{r.value}</span>
              </div>
            ))}
          </div>

          {cats.length > 0 && (
            <div>
              <p className={labelCls}>By category</p>
              <div className="space-y-1.5">
                {cats.map(([c, v]) => {
                  const Icon = catIcon(c);
                  return (
                    <div key={c} className="flex items-center gap-2.5">
                      <Icon className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" strokeWidth={1.9} />
                      <span className="text-[12.5px] text-[var(--text)] flex-1">{c}</span>
                      <span className="text-[12.5px] font-bold text-[var(--text)] tabular">{v >= 0 ? "+" : ""}{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className={labelCls}>Recent activity</p>
            {recent.length === 0 ? (
              <p className="text-xs text-[var(--faint)] py-2">No points logged yet.</p>
            ) : (
              <div className="space-y-1">
                {recent.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] py-1 border-b border-[var(--border)] last:border-0">
                    <span className="text-[var(--faint)] tabular w-14 shrink-0">{fmtShort(e.date)}</span>
                    <span className="text-[var(--text)] flex-1 truncate">{e.title}</span>
                    {e.type === "streak" && <Flame className="w-3 h-3" style={{ color: ORANGE, fill: ORANGE }} />}
                    {e.type === "early" && <Zap className="w-3 h-3 text-[var(--muted)]" />}
                    {e.multiplier > 1 && <span className="text-[10px] text-[var(--faint)] tabular">×{e.multiplier.toFixed(1)}</span>}
                    <span className={cn("font-bold tabular w-10 text-right shrink-0", e.points < 0 ? "text-[var(--faint)]" : "text-[var(--text)]")}>{e.points >= 0 ? "+" : ""}{e.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session settings modal ──────────────────────────────────────────────────────────
function SettingsModal({ session, onSave, onDelete, onClose }: {
  session: LockInSession;
  onSave: (patch: Partial<LockInSession>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName]   = useState(session.name);
  const [start, setStart] = useState(session.startDate);
  const [end, setEnd]     = useState(session.endDate);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)]">
          <div className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} /><p className="text-sm font-bold text-[var(--text)]">Session Settings</p></div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className={labelCls}>Name</label><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Start</label><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><label className={labelCls}>End</label><input type="date" min={start} className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)]">
          <button onClick={() => { if (confirm("Delete this entire lock-in? This cannot be undone.")) { onDelete(); onClose(); } }}
            className="text-xs text-[var(--text)] hover:opacity-70 font-medium transition-opacity">Delete session</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={() => { onSave({ name: name.trim() || session.name, startDate: start, endDate: end < start ? start : end }); onClose(); }}
              className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Calendar({ session, today, selected, onSelect }: {
  session: LockInSession; today: string; selected: string; onSelect: (d: string) => void;
}) {
  const weeks = useMemo(() => {
    const s = parseYmd(session.startDate); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    const e = parseYmd(session.endDate);   e.setDate(e.getDate() + (6 - ((e.getDay() + 6) % 7)));
    const out: string[][] = [];
    const cur = new Date(s); let wk: string[] = [];
    while (cur.getTime() <= e.getTime()) {
      const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, "0"), d = String(cur.getDate()).padStart(2, "0");
      wk.push(`${y}-${m}-${d}`);
      if (wk.length === 7) { out.push(wk); wk = []; }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [session.startDate, session.endDate]);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4">
      {/* legend */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-3 text-[10px] text-[var(--faint)]">
        {[["#166534", "Bonus"], ["#22c55e", "All done"], ["#bbf7d0", "Missed 1"], ["#dc2626", "Missed 2+"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} /> {l}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold text-[var(--faint)] uppercase tracking-wider">{w}</div>)}
      </div>
      <div className="space-y-1.5">
        {weeks.map((wk, i) => (
          <div key={i} className="grid grid-cols-7 gap-1.5">
            {wk.map(d => {
              const st = dayStatus(session, d, today);
              const dayNum = parseYmd(d).getDate();
              const isFirstOfMonth = dayNum === 1 || d === session.startDate;
              if (!st.inRange) {
                return <div key={d} className="aspect-square rounded-lg opacity-30 flex items-start justify-end p-1">
                  <span className="text-[10px] text-[var(--faint)] tabular">{dayNum}</span>
                </div>;
              }
              const style = QUALITY_STYLE[st.quality];
              const colored = !!style.bg;
              const isSel = d === selected;
              const specifics = tasksDueOn(session, d).filter(t => t.kind === "specific");
              return (
                <button key={d} onClick={() => onSelect(d)}
                  style={{ background: style.bg, color: colored ? style.text : undefined }}
                  className={cn(
                    "aspect-square rounded-lg border p-1 sm:p-1.5 flex flex-col text-left transition-all relative overflow-hidden",
                    colored ? "border-transparent" : "bg-[var(--surface-2)]",
                    st.isFuture && "border-dashed border-[var(--border)]",
                    !colored && !st.isFuture && "border-[var(--border)]",
                    isSel && "outline outline-2 outline-[var(--text)] outline-offset-1",
                    st.isToday && !isSel && "ring-2 ring-[var(--text)]",
                  )}>
                  <div className="flex items-center justify-between w-full">
                    {isFirstOfMonth
                      ? <span className="text-[9px] font-bold uppercase opacity-80" style={{ color: colored ? style.text : "var(--muted)" }}>{parseYmd(d).toLocaleDateString(undefined, { month: "short" })}</span>
                      : <span />}
                    <span className="text-[10px] sm:text-[11px] font-bold tabular" style={{ color: colored ? style.text : st.isFuture ? "var(--faint)" : "var(--text)" }}>{dayNum}</span>
                  </div>

                  {/* specific-task markers: icon + title */}
                  {specifics.length > 0 && (
                    <div className="mt-0.5 w-full space-y-0.5 leading-tight">
                      {specifics.slice(0, 2).map(t => (
                        <div key={t.id} className="flex items-center gap-0.5 min-w-0">
                          <span className="text-[9px] leading-none shrink-0">{t.icon || "•"}</span>
                          <span className="text-[8.5px] leading-tight truncate" style={{ color: colored ? style.text : "var(--text)" }}>{t.title}</span>
                        </div>
                      ))}
                      {specifics.length > 2 && <span className="text-[8px] opacity-70 block" style={{ color: colored ? style.text : "var(--muted)" }}>+{specifics.length - 2} more</span>}
                    </div>
                  )}

                  <div className="mt-auto w-full">
                    {st.due > 0 && (
                      <div className="flex items-center justify-between">
                        {st.perfect && !st.isFuture ? (
                          <Check className="w-3 h-3" strokeWidth={3} style={{ color: colored ? style.text : "var(--text)" }} />
                        ) : st.quality === "fail" ? (
                          <span className="text-[9px]" style={{ color: style.text }}>missed</span>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] tabular opacity-90" style={{ color: colored ? style.text : "var(--muted)" }}>{st.done}/{st.due}</span>
                        )}
                        {st.points !== 0 && !st.isFuture && (
                          <span className="text-[9px] sm:text-[10px] font-bold tabular hidden sm:inline" style={{ color: colored ? style.text : st.points < 0 ? "var(--faint)" : "var(--text)" }}>
                            {st.points > 0 ? "+" : ""}{st.points}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day panel ────────────────────────────────────────────────────────────────────
function TaskRow({ session, task, day, editable, onToggle, onEdit }: {
  session: LockInSession; task: LockInTask; day: string; editable: boolean;
  onToggle: () => void; onEdit: () => void;
}) {
  const done = isTaskDoneOn(session, task, day);
  const Icon = catIcon(task.category);
  const overdue = task.kind === "specific" && task.date! < day && !done;
  const early = task.kind === "specific" && !done && day < (task.date ?? day);

  let preview = `+${task.points}`;
  if (task.kind === "daily" && !done) {
    const proj = projectedDailyStreak(session, task.id, day);
    const m = streakMult(proj);
    if (m > 1) preview = `+${Math.round(task.points * m)}`;
  } else if (early) {
    preview = `+${task.points * EARLY_MULT}`;
  }

  return (
    <div className={cn("group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors", editable && "hover:bg-[var(--chip)]")}>
      <button disabled={!editable} onClick={onToggle}
        className={cn("flex items-center justify-center w-5 h-5 rounded-[6px] border shrink-0 transition-colors",
          done ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border-2)]",
          editable && !done && "hover:border-[var(--text)]", !editable && "opacity-50")}>
        {done && <Check className="w-3.5 h-3.5 text-[var(--bg)]" strokeWidth={3} />}
      </button>
      {task.icon
        ? <span className="text-base leading-none w-5 text-center shrink-0">{task.icon}</span>
        : <Icon className="w-4 h-4 text-[var(--muted)] shrink-0" strokeWidth={1.9} />}
      <div className="flex-1 min-w-0">
        <p className={cn("text-[13px] truncate", done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{task.title}</p>
        <p className="text-[10px] text-[var(--faint)]">
          {task.category}
          {task.kind === "specific" && ` · due ${fmtShort(task.date!)}`}
          {overdue && " · overdue"}
          {early && " · early ×2"}
        </p>
      </div>
      {!done && <span className="text-[11px] font-bold text-[var(--muted)] tabular shrink-0">{preview}</span>}
      <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function DayPanel({ session, day, today, onToggle, onEditTask, onAddTask, onToday }: {
  session: LockInSession; day: string; today: string;
  onToggle: (taskId: string) => void; onEditTask: (t: LockInTask) => void; onAddTask: () => void; onToday: () => void;
}) {
  const st = dayStatus(session, day, today);
  const editable = day <= today && st.inRange;
  const daily = tasksDueOn(session, day).filter(t => t.kind === "daily");
  const specific = tasksDueOn(session, day).filter(t => t.kind === "specific");
  const overdue = overdueOn(session, day);

  const Section = ({ title, tasks, icon }: { title: string; tasks: LockInTask[]; icon?: React.ReactNode }) =>
    tasks.length ? (
      <div>
        <div className="flex items-center gap-1.5 mb-1 px-1">
          {icon}
          <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.15em]">{title}</p>
        </div>
        <div>{tasks.map(t => (
          <TaskRow key={t.id} session={session} task={t} day={day} editable={editable}
            onToggle={() => onToggle(t.id)} onEdit={() => onEditTask(t)} />
        ))}</div>
      </div>
    ) : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--chip)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-[var(--text)] truncate">{st.isToday ? "Today" : fmtLong(day)}</p>
              {st.perfect && st.due > 0 && !st.isFuture && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#166534] bg-[#dcfce7] border border-[#86efac] rounded-full px-1.5 py-0.5"><Sparkles className="w-2.5 h-2.5" /> Perfect</span>
              )}
            </div>
            <p className="text-[11px] text-[var(--faint)]">{st.isToday ? fmtLong(day) : (day > today ? "Upcoming · view only" : "Past day")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!st.isToday && <button onClick={onToday} title="Back to today" className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-md px-2 py-1 transition-colors">Today</button>}
          <div className="text-right">
            <p className="text-lg font-extrabold text-[var(--text)] tabular leading-none">{st.points >= 0 ? "+" : ""}{st.points}</p>
            <p className="text-[10px] text-[var(--faint)]">{st.done}/{st.due} done</p>
          </div>
        </div>
      </div>
      <div className="p-2.5 space-y-3">
        {st.due === 0 && overdue.length === 0 && (
          <p className="text-xs text-[var(--faint)] text-center py-5">No tasks for this day.</p>
        )}
        <Section title="Every day" tasks={daily} />
        <Section title="This day" tasks={specific} />
        <Section title="Carried over (overdue)" tasks={overdue} icon={<AlertTriangle className="w-3 h-3 text-[var(--muted)]" />} />
        {editable && (
          <button onClick={onAddTask} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-dashed border-[var(--border)] hover:border-[var(--border-2)] rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add task
          </button>
        )}
        {!editable && day > today && (
          <p className="text-[11px] text-[var(--faint)] text-center pb-1">Tasks unlock on the day — complete a specific task early from today to bank ×2 points.</p>
        )}
      </div>
    </div>
  );
}

// ── Condensed stat chips ──────────────────────────────────────────────────────────
function StatChips({ net, rank, current, best, pct, rate }: {
  net: number; rank: string; current: number; best: number; pct: number; rate: number;
}) {
  return (
    <div className="flex items-stretch gap-2.5 flex-1">
      <div className="rounded-xl px-4 py-2.5 flex flex-col justify-center flex-1 min-w-[96px]" style={{ background: "#0a0a0a" }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "#737373" }}>Points</p>
        <p className="text-2xl font-extrabold tabular leading-none my-1" style={{ color: "#fff" }}>{net}</p>
        <p className="text-[9px] font-bold tracking-[0.1em]" style={{ color: "#737373" }}>{rank}</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex flex-col justify-center flex-1 min-w-[90px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--faint)]">Streak</p>
        <div className="flex items-center gap-1.5 my-1">
          <Flame className="w-5 h-5" style={{ color: ORANGE, fill: ORANGE }} strokeWidth={1.8} />
          <p className="text-2xl font-extrabold tabular leading-none text-[var(--text)]">{current}<span className="text-sm text-[var(--faint)] font-bold ml-0.5">d</span></p>
        </div>
        <p className="text-[9px] text-[var(--faint)]">best {best}d</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 flex flex-col justify-center flex-1 min-w-[96px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--faint)]">Progress</p>
        <p className="text-2xl font-extrabold tabular leading-none my-1 text-[var(--text)]">{Math.round(pct * 100)}%</p>
        <div className="h-1 bg-[var(--chip)] rounded-full overflow-hidden"><div className="h-full bg-[var(--text)] rounded-full" style={{ width: `${Math.round(rate * 100)}%` }} /></div>
      </div>
    </div>
  );
}

// ── Archive view ─────────────────────────────────────────────────────────────────
function ArchiveList({ sessions, onUnarchive, onDelete, onBack }: {
  sessions: LockInSession[]; onUnarchive: (id: string) => void; onDelete: (id: string) => void; onBack: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] mb-4 transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back to active
      </button>
      {sessions.length === 0 ? (
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl py-14 text-center">
          <Archive className="w-5 h-5 text-[var(--faint)] mx-auto mb-3" strokeWidth={1.8} />
          <p className="text-sm font-semibold text-[var(--text)]">No archived sessions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => {
            const sum = summarize(s);
            return (
              <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text)] truncate">{s.name}</p>
                    <p className="text-[11px] text-[var(--faint)]">{fmtShort(s.startDate)} – {fmtShort(s.endDate)} · {sum.totalDays} days · {Math.round(sum.completionRate * 100)}% complete</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-extrabold text-[var(--text)] tabular leading-none">{sum.net}</p>
                    <p className="text-[10px] text-[var(--faint)]">{getRank(sum.net).label}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => onUnarchive(s.id)} className="flex-1 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg transition-colors">Reactivate</button>
                  <button onClick={() => { if (confirm("Permanently delete this archived session?")) onDelete(s.id); }} className="px-3 py-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Top action buttons ────────────────────────────────────────────────────────────
function Actions({ onAddTask, onBreakdown, onSettings, onNew, onArchive, archivedCount }: {
  onAddTask: () => void; onBreakdown: () => void; onSettings: () => void; onNew: () => void; onArchive?: () => void; archivedCount: number;
}) {
  const iconBtn = "p-2 border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors";
  return (
    <div className="flex gap-1.5">
      <button onClick={onAddTask} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] rounded-lg text-xs font-semibold transition-colors"><Plus className="w-3.5 h-3.5" strokeWidth={2.4} /> Task</button>
      <button onClick={onBreakdown} title="Points breakdown" className={iconBtn}><BarChart3 className="w-3.5 h-3.5" /></button>
      <button onClick={onSettings} title="Session settings" className={iconBtn}><Settings2 className="w-3.5 h-3.5" /></button>
      <button onClick={onNew} title="New lock-in" className={iconBtn}><CalendarPlus className="w-3.5 h-3.5" /></button>
      {onArchive && <button onClick={onArchive} title={`Archive (${archivedCount})`} className={iconBtn}><Archive className="w-3.5 h-3.5" /></button>}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────────
export function LockInPage() {
  const { data, mutate } = useNexus();
  const today = todayYmd();

  const sessions = data.lockInSessions ?? [];
  const active = useMemo(() => sessions.filter(s => !s.archived), [sessions]);
  const archived = useMemo(() => sessions.filter(s => s.archived), [sessions]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingTask, setEditingTask] = useState<LockInTask | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today);

  useEffect(() => {
    if (active.length && (!activeId || !active.some(s => s.id === activeId))) setActiveId(active[0].id);
  }, [active, activeId]);

  const session = active.find(s => s.id === activeId) ?? active[0] ?? null;

  // whenever the active session changes, open on the real "today" (clamped into its window)
  useEffect(() => {
    if (!session) return;
    setSelectedDay(today < session.startDate ? session.startDate : today > session.endDate ? session.endDate : today);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = useMemo(() => session ? summarize(session, today) : null, [session, today]);

  // ── mutations ──
  const patchSession = (id: string, patch: Partial<LockInSession>) =>
    mutate(d => ({ ...d, lockInSessions: (d.lockInSessions ?? []).map(s => s.id === id ? { ...s, ...patch } : s) }));
  const createSession = (s: LockInSession) => { mutate(d => ({ ...d, lockInSessions: [...(d.lockInSessions ?? []), s] })); setActiveId(s.id); };
  const deleteSession = (id: string) => mutate(d => ({ ...d, lockInSessions: (d.lockInSessions ?? []).filter(s => s.id !== id) }));

  const saveTask = (t: LockInTask) => session && patchSession(session.id, {
    tasks: session.tasks.some(x => x.id === t.id) ? session.tasks.map(x => x.id === t.id ? t : x) : [...session.tasks, t],
  });
  const deleteTask = (taskId: string) => session && patchSession(session.id, {
    tasks: session.tasks.filter(t => t.id !== taskId),
    completions: session.completions.filter(c => c.taskId !== taskId),
  });

  const toggleTask = (taskId: string, day: string) => {
    if (!session || day > today) return;   // never complete a future day — today is real-date locked
    const task = session.tasks.find(t => t.id === taskId);
    if (!task) return;
    let completions;
    if (task.kind === "specific") {
      const has = session.completions.some(c => c.taskId === taskId);
      completions = has ? session.completions.filter(c => c.taskId !== taskId) : [...session.completions, { id: uid(), taskId, date: day }];
    } else {
      const has = session.completions.some(c => c.taskId === taskId && c.date === day);
      completions = has ? session.completions.filter(c => !(c.taskId === taskId && c.date === day)) : [...session.completions, { id: uid(), taskId, date: day }];
    }
    patchSession(session.id, { completions });
  };

  // ── Archive view ──
  if (showArchive) {
    return (
      <div className="p-4 sm:p-6">
        <MiniHeader onNew={() => setShowNew(true)} />
        <ArchiveList sessions={archived} onUnarchive={id => patchSession(id, { archived: false })} onDelete={deleteSession} onBack={() => setShowArchive(false)} />
        {showNew && <NewSessionModal onCreate={s => { createSession(s); setShowArchive(false); }} onClose={() => setShowNew(false)} />}
      </div>
    );
  }

  // ── Empty state ──
  if (!session) {
    return (
      <div className="p-4 sm:p-6">
        <MiniHeader onNew={() => setShowNew(true)} onArchive={archived.length ? () => setShowArchive(true) : undefined} archivedCount={archived.length} />
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl py-20 flex flex-col items-center text-center">
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--chip)] border border-[var(--border)] mb-4">
            <Lock className="w-6 h-6 text-[var(--text)]" strokeWidth={1.8} />
          </span>
          <p className="text-base font-bold text-[var(--text)] mb-1">No active lock-in</p>
          <p className="text-sm text-[var(--faint)] mb-5 max-w-sm">Pick a window, set the tasks you can&apos;t skip, and earn points for showing up every day.</p>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-semibold rounded-lg transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2.4} /> Start a Lock-In
          </button>
        </div>
        {showNew && <NewSessionModal onCreate={createSession} onClose={() => setShowNew(false)} />}
      </div>
    );
  }

  const rank = getRank(sum!.net);

  return (
    <div className="p-4 sm:p-6">
      {/* Top bar: name + dates (left) · stats + actions (right) */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-4">
        <div className="min-w-0">
          {active.length > 1 && (
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {active.map(s => (
                <button key={s.id} onClick={() => setActiveId(s.id)}
                  className={cn("px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                    s.id === session.id ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]")}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[var(--text)] shrink-0" />
            <h1 className="text-[1.5rem] font-extrabold text-[var(--text)] tracking-tight truncate">{session.name}</h1>
            {sum!.finished && <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text)] bg-[var(--chip)] border border-[var(--border-2)] rounded-full px-2 py-0.5 shrink-0">Complete</span>}
          </div>
          <p className="text-[12.5px] text-[var(--faint)] mt-1 flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" /> {fmtLong(session.startDate)} → {fmtLong(session.endDate)} · Day {Math.min(sum!.daysElapsed, sum!.totalDays)} of {sum!.totalDays}
          </p>
        </div>

        <div className="xl:ml-auto xl:flex-1 xl:max-w-[760px] flex items-center gap-2.5 flex-wrap">
          <StatChips net={sum!.net} rank={rank.label} current={sum!.current} best={sum!.best} pct={sum!.pct} rate={sum!.completionRate} />
          <Actions onAddTask={() => { setEditingTask(null); setAddingTask(true); }} onBreakdown={() => setShowBreakdown(true)}
            onSettings={() => setShowSettings(true)} onNew={() => setShowNew(true)}
            onArchive={archived.length ? () => setShowArchive(true) : undefined} archivedCount={archived.length} />
        </div>
      </div>

      {/* Finished banner */}
      {sum!.finished && (
        <div className="mb-4 bg-[var(--chip)] border border-[var(--border-2)] rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Trophy className="w-5 h-5 text-[var(--text)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[var(--text)]">Lock-In complete</p>
              <p className="text-[12.5px] text-[var(--faint)] mt-0.5">You finished with <span className="font-bold text-[var(--text)]">{sum!.net} pts</span> ({rank.label}) and {Math.round(sum!.completionRate * 100)}% completion. Archive it to lock in the result, or extend the dates to keep the streak going.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => patchSession(session.id, { archived: true })} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--text)] text-[var(--bg)] rounded-lg text-xs font-semibold hover:bg-[var(--text-hover)] transition-colors"><Archive className="w-3.5 h-3.5" /> Archive session</button>
                <button onClick={() => patchSession(session.id, { endDate: addDays(today, 13) })} className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border-2)] rounded-lg text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] transition-colors"><CalendarRange className="w-3.5 h-3.5" /> Extend +2 weeks</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overdue alert */}
      {sum!.todayOverdue > 0 && !sum!.finished && (
        <div className="mb-4 flex items-center gap-2.5 bg-[var(--chip)] border border-[var(--border-2)] rounded-xl px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 text-[var(--text)] shrink-0" />
          <p className="text-[12.5px] text-[var(--text)]"><span className="font-bold">{sum!.todayOverdue}</span> overdue task{sum!.todayOverdue !== 1 ? "s" : ""} stacked onto today — clear {sum!.todayOverdue !== 1 ? "them" : "it"} to stop the bleed.</p>
        </div>
      )}

      {/* Day tasks (top-left) · Calendar (right) */}
      <div className="grid xl:grid-cols-[minmax(300px,360px)_1fr] gap-4 items-start">
        <DayPanel session={session} day={selectedDay} today={today}
          onToggle={taskId => toggleTask(taskId, selectedDay)}
          onEditTask={t => { setEditingTask(t); setAddingTask(true); }}
          onAddTask={() => { setEditingTask(null); setAddingTask(true); }}
          onToday={() => setSelectedDay(today < session.startDate ? session.startDate : today > session.endDate ? session.endDate : today)} />
        <Calendar session={session} today={today} selected={selectedDay} onSelect={setSelectedDay} />
      </div>

      {/* Modals */}
      {showNew && <NewSessionModal onCreate={createSession} onClose={() => setShowNew(false)} />}
      {showBreakdown && <BreakdownModal session={session} onClose={() => setShowBreakdown(false)} />}
      {showSettings && <SettingsModal session={session} onSave={p => patchSession(session.id, p)} onDelete={() => { deleteSession(session.id); setActiveId(null); }} onClose={() => setShowSettings(false)} />}
      {addingTask && <TaskModal session={session} task={editingTask} defaultDate={selectedDay >= session.startDate && selectedDay <= session.endDate ? selectedDay : session.startDate}
        onSave={saveTask} onDelete={editingTask ? deleteTask : undefined} onClose={() => { setAddingTask(false); setEditingTask(null); }} />}
    </div>
  );
}

// ── Minimal header (empty + archive states only) ───────────────────────────────────
function MiniHeader({ onNew, onArchive, archivedCount = 0 }: { onNew: () => void; onArchive?: () => void; archivedCount?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2.5">
        <Target className="w-5 h-5 text-[var(--text)]" />
        <h1 className="text-[1.6rem] font-extrabold text-[var(--text)] tracking-tight">Lock In</h1>
      </div>
      <div className="flex gap-2 shrink-0">
        {onArchive && (
          <button onClick={onArchive} className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors">
            <Archive className="w-3.5 h-3.5" /> Archive ({archivedCount})
          </button>
        )}
        <button onClick={onNew} className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-semibold rounded-lg transition-colors">
          <Plus className="w-4 h-4" strokeWidth={2.4} /> New
        </button>
      </div>
    </div>
  );
}
