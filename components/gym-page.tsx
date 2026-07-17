"use client";

import { useState, useMemo } from "react";
import { useBridge } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/store";
import {
  Dumbbell, Plus, X, Trash2, Pencil, ChevronDown, ChevronUp,
  Flame, CalendarDays, Weight, Clock, Copy, Trophy, TrendingUp, TrendingDown, Minus,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const TODAY = () => new Date().toISOString().split("T")[0];

function startOfWeek(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;       // Mon = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function workoutVolume(w: Workout): number {
  return w.exercises.reduce((a, ex) =>
    a + ex.sets.reduce((b, s) => b + (s.reps || 0) * (s.weight || 0), 0), 0);
}

function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((a, ex) => a + ex.sets.length, 0);
}

function fmtVol(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
  return `${Math.round(n)}kg`;
}

function fmtDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Consecutive-day streak counting back from today.
function calcStreak(workouts: Workout[]): number {
  const days = new Set(workouts.map(w => w.date));
  let streak = 0;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  // allow today to be a rest day without breaking the streak
  if (!days.has(cur.toISOString().split("T")[0])) cur.setDate(cur.getDate() - 1);
  while (days.has(cur.toISOString().split("T")[0])) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

const COMMON_EXERCISES = [
  "Bench Press", "Squat", "Deadlift", "Overhead Press", "Barbell Row",
  "Pull Up", "Chin Up", "Dip", "Incline Bench Press", "Romanian Deadlift",
  "Leg Press", "Lunge", "Lat Pulldown", "Seated Row", "Bicep Curl",
  "Tricep Pushdown", "Lateral Raise", "Face Pull", "Leg Curl", "Leg Extension",
  "Calf Raise", "Plank", "Hip Thrust", "Push Up", "Shoulder Press",
];

const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors";

// ── Workout editor modal ─────────────────────────────────────────────────────

const blankSet = (): WorkoutSet => ({ id: uid(), reps: 8, weight: 0, done: true });
const blankExercise = (): WorkoutExercise => ({ id: uid(), name: "", sets: [blankSet()] });

function WorkoutEditor({ initial, onSave, onClose }: {
  initial: Workout | null;
  onSave: (w: Workout) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState(initial?.name ?? "");
  const [date, setDate]         = useState(initial?.date ?? TODAY());
  const [duration, setDuration] = useState(initial?.durationMins?.toString() ?? "");
  const [notes, setNotes]       = useState(initial?.notes ?? "");
  const [exercises, setExercises] = useState<WorkoutExercise[]>(
    initial ? initial.exercises.map(ex => ({ ...ex, sets: ex.sets.map(s => ({ ...s })) })) : [blankExercise()]
  );

  const setEx = (id: string, patch: Partial<WorkoutExercise>) =>
    setExercises(xs => xs.map(ex => ex.id === id ? { ...ex, ...patch } : ex));

  const setSet = (exId: string, setId: string, patch: Partial<WorkoutSet>) =>
    setExercises(xs => xs.map(ex => ex.id !== exId ? ex : {
      ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, ...patch } : s),
    }));

  const addSet = (exId: string) =>
    setExercises(xs => xs.map(ex => {
      if (ex.id !== exId) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, last ? { ...last, id: uid() } : blankSet()] };
    }));

  const delSet = (exId: string, setId: string) =>
    setExercises(xs => xs.map(ex => ex.id !== exId ? ex : { ...ex, sets: ex.sets.filter(s => s.id !== setId) }));

  function save() {
    const cleaned = exercises
      .map(ex => ({ ...ex, name: ex.name.trim(), sets: ex.sets.filter(s => s.reps > 0 || s.weight > 0) }))
      .filter(ex => ex.name && ex.sets.length);
    if (!cleaned.length && !name.trim()) return;
    onSave({
      id: initial?.id ?? uid(),
      date,
      name: name.trim() || "Workout",
      exercises: cleaned,
      durationMins: duration ? parseInt(duration) : undefined,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--chip)] sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
            <p className="text-sm font-bold text-[var(--text)]">{initial ? "Edit Workout" : "Log Workout"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px] gap-3">
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5">Workout</label>
              <input autoFocus className={inputCls} placeholder="e.g. Push Day" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5">Date</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5">Mins</label>
              <input type="number" min="0" className={inputCls} placeholder="60" value={duration} onChange={e => setDuration(e.target.value)} />
            </div>
          </div>

          {/* Exercises */}
          <datalist id="gym-exercise-list">
            {COMMON_EXERCISES.map(e => <option key={e} value={e} />)}
          </datalist>

          <div className="space-y-3">
            {exercises.map((ex, i) => (
              <div key={ex.id} className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface-2)]">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--chip)] text-[11px] font-bold text-[var(--muted)] shrink-0">{i + 1}</span>
                  <input
                    list="gym-exercise-list"
                    className="flex-1 bg-transparent border-b border-[var(--border)] focus:border-[var(--text)] px-1 py-1 text-sm font-semibold text-[var(--text)] placeholder-[var(--faint)] focus:outline-none transition-colors"
                    placeholder="Exercise name"
                    value={ex.name}
                    onChange={e => setEx(ex.id, { name: e.target.value })}
                  />
                  <button onClick={() => setExercises(xs => xs.filter(x => x.id !== ex.id))}
                    className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                {/* Sets */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 px-1 text-[9px] font-bold text-[var(--faint)] uppercase tracking-wider">
                    <span>Set</span><span>Reps</span><span>Weight (kg)</span><span />
                  </div>
                  {ex.sets.map((s, si) => (
                    <div key={s.id} className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center">
                      <span className="text-[11px] font-bold text-[var(--muted)] text-center tabular">{si + 1}</span>
                      <input type="number" min="0" inputMode="numeric"
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)] tabular"
                        value={s.reps || ""} onChange={e => setSet(ex.id, s.id, { reps: parseInt(e.target.value) || 0 })} />
                      <input type="number" min="0" step="0.5" inputMode="decimal"
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)] tabular"
                        value={s.weight || ""} onChange={e => setSet(ex.id, s.id, { weight: parseFloat(e.target.value) || 0 })} />
                      <button onClick={() => delSet(ex.id, s.id)}
                        className="flex items-center justify-center text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={() => addSet(ex.id)}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-dashed border-[var(--border)] hover:border-[var(--border-2)] rounded-md transition-colors">
                    <Plus className="w-3 h-3" /> Add set
                  </button>
                </div>
              </div>
            ))}
            <button onClick={() => setExercises(xs => [...xs, blankExercise()])}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-dashed border-[var(--border)] hover:border-[var(--border-2)] rounded-xl transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add exercise
            </button>
          </div>

          <div>
            <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5">Notes</label>
            <textarea className={cn(inputCls, "resize-none")} rows={2} placeholder="How did it feel? PRs, energy…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[var(--border)] sticky bottom-0 bg-[var(--surface)]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">{initial ? "Save Changes" : "Save Workout"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Workout card ─────────────────────────────────────────────────────────────

function WorkoutCard({ workout, onEdit, onDelete, onRepeat }: {
  workout: Workout;
  onEdit: (w: Workout) => void;
  onDelete: (id: string) => void;
  onRepeat: (w: Workout) => void;
}) {
  const [open, setOpen] = useState(false);
  const vol  = workoutVolume(workout);
  const sets = workoutSetCount(workout);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--chip)] transition-colors group" onClick={() => setOpen(v => !v)}>
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--chip)] border border-[var(--border)] shrink-0">
          <Dumbbell className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] truncate">{workout.name}</p>
          <p className="text-[11px] text-[var(--faint)]">
            {fmtDate(workout.date)} · {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""} · {sets} sets
            {workout.durationMins ? ` · ${workout.durationMins}m` : ""}
          </p>
        </div>
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-sm font-extrabold text-[var(--text)] tabular">{fmtVol(vol)}</p>
          <p className="text-[9px] text-[var(--faint)] uppercase tracking-wider">volume</p>
        </div>
        <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => onRepeat(workout)} title="Repeat workout today" className="p-1.5 rounded-lg bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip-2)] transition-colors"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={() => onEdit(workout)} title="Edit" className="p-1.5 rounded-lg bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip-2)] transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => { if (confirm("Delete this workout?")) onDelete(workout.id); }} title="Delete" className="p-1.5 rounded-lg bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip-2)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        <div className="text-[var(--faint)] shrink-0">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-3">
          {workout.exercises.length === 0 && <p className="text-xs text-[var(--faint)]">No exercises logged.</p>}
          {workout.exercises.map(ex => (
            <div key={ex.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[12.5px] font-semibold text-[var(--text)]">{ex.name}</p>
                <div className="flex-1 h-px bg-[var(--chip)]" />
                <span className="text-[10px] text-[var(--faint)] tabular">{fmtVol(ex.sets.reduce((a, s) => a + s.reps * s.weight, 0))}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ex.sets.map((s, i) => (
                  <span key={s.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--chip)] text-[11px] text-[var(--muted)] tabular">
                    <span className="text-[var(--faint)]">{i + 1}</span>
                    <span className="font-semibold text-[var(--text)]">{s.reps}</span>
                    <span className="text-[var(--faint)]">×</span>
                    <span className="font-semibold text-[var(--text)]">{s.weight ? `${s.weight}kg` : "BW"}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {workout.notes && (
            <div className="bg-[var(--chip)] border border-[var(--border)] rounded-lg px-3 py-2">
              <p className="text-[10px] text-[var(--faint)] font-bold uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-xs text-[var(--muted)]">{workout.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Muscle map (which muscles you train the most) ───────────────────────────────
type Muscle = "chest" | "shoulders" | "biceps" | "triceps" | "forearms" | "abs" | "back" | "traps" | "quads" | "hamstrings" | "glutes" | "calves";
const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Chest", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", abs: "Abs",
  back: "Back", traps: "Traps", quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
};

// keyword → muscle contributions (primary 1.0, synergists lower). Order matters (first match per rule).
const MUSCLE_RULES: { re: RegExp; m: Partial<Record<Muscle, number>> }[] = [
  { re: /incline/, m: { chest: 1, shoulders: 0.4, triceps: 0.3 } },
  { re: /bench|chest press|pec|fly|dip(?!lo)/, m: { chest: 1, triceps: 0.4, shoulders: 0.3 } },
  { re: /push[- ]?up/, m: { chest: 1, triceps: 0.4, shoulders: 0.3 } },
  { re: /leg extension|quad/, m: { quads: 1 } },
  { re: /leg curl|hamstring/, m: { hamstrings: 1 } },
  { re: /rdl|romanian|stiff.?leg/, m: { hamstrings: 1, glutes: 0.7, back: 0.4 } },
  { re: /deadlift/, m: { hamstrings: 0.9, glutes: 0.8, back: 0.7, traps: 0.4 } },
  { re: /hip thrust|glute/, m: { glutes: 1, hamstrings: 0.4 } },
  { re: /squat|leg press|lunge|split squat|hack/, m: { quads: 1, glutes: 0.6, hamstrings: 0.3 } },
  { re: /calf|calve/, m: { calves: 1 } },
  { re: /shrug|trap/, m: { traps: 1 } },
  { re: /lateral raise|side raise|rear delt|overhead|shoulder press|military|ohp|arnold|delt/, m: { shoulders: 1, triceps: 0.3 } },
  { re: /pull[- ]?up|chin[- ]?up|pulldown|lat pull|lat ?pull/, m: { back: 1, biceps: 0.5 } },
  { re: /row|pull|lat/, m: { back: 1, biceps: 0.4, shoulders: 0.2 } },
  { re: /tricep|pushdown|skull|overhead extension|kickback|close.?grip/, m: { triceps: 1 } },
  { re: /curl/, m: { biceps: 1, forearms: 0.3 } },
  { re: /forearm|wrist|grip/, m: { forearms: 1 } },
  { re: /ab |abs|crunch|plank|sit.?up|core|oblique|leg raise|hanging/, m: { abs: 1 } },
  { re: /back extension|hyperext/, m: { back: 0.8, hamstrings: 0.3, glutes: 0.3 } },
];

function computeMuscleVolume(workouts: Workout[]): Record<Muscle, number> {
  const vol = {} as Record<Muscle, number>;
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const name = ex.name.trim().toLowerCase();
      if (!name) continue;
      const rule = MUSCLE_RULES.find((r) => r.re.test(name));
      if (!rule) continue;
      let load = 0;
      for (const s of ex.sets) { if (s.done) load += s.reps * Math.max(s.weight, 1); }
      if (load === 0) load = ex.sets.length * 10;   // fallback so unlogged-weight sets still count
      for (const [m, wgt] of Object.entries(rule.m)) vol[m as Muscle] = (vol[m as Muscle] ?? 0) + load * (wgt as number);
    }
  }
  return vol;
}

function MuscleMap({ workouts }: { workouts: Workout[] }) {
  const vol = useMemo(() => computeMuscleVolume(workouts), [workouts]);
  const max = Math.max(1, ...Object.values(vol));
  const ranked = (Object.entries(vol) as [Muscle, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const fill = (m: Muscle) => { const pct = (vol[m] ?? 0) / max; return `color-mix(in srgb, var(--accent) ${Math.round(12 + 78 * pct)}%, var(--chip))`; };
  // color-mix()/var() only work as CSS (the `style` prop), NOT as SVG presentation attributes.
  const S = (m: Muscle) => ({ style: { fill: fill(m), stroke: "var(--border-2)", strokeWidth: 0.6 }, className: "transition-[fill] duration-500" });
  const silhouette = { fill: "var(--surface-2)", stroke: "var(--border)", strokeWidth: 0.6 };

  if (workouts.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-3">
        <Dumbbell className="w-3.5 h-3.5 text-[var(--accent)]" />
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">Muscle Map</p>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--faint)]">less
          <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--chip), var(--accent))" }} />more</span>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* body diagrams */}
        <div className="flex items-start justify-center gap-6">
          {/* FRONT */}
          <figure className="text-center">
            <svg viewBox="0 0 100 210" className="w-32 sm:w-40" role="img" aria-label="Front muscle map">
              {/* silhouette */}
              <g style={silhouette}>
                <circle cx="50" cy="14" r="8.5" />
                <rect x="46" y="21" width="8" height="6" rx="2" />
              </g>
              {/* shoulders */}
              <ellipse cx="31" cy="34" rx="8" ry="6" {...S("shoulders")} />
              <ellipse cx="69" cy="34" rx="8" ry="6" {...S("shoulders")} />
              {/* chest */}
              <path d="M40 30 Q50 28 50 44 Q42 46 37 40 Z" {...S("chest")} />
              <path d="M60 30 Q50 28 50 44 Q58 46 63 40 Z" {...S("chest")} />
              {/* biceps */}
              <ellipse cx="26" cy="50" rx="5" ry="9" {...S("biceps")} />
              <ellipse cx="74" cy="50" rx="5" ry="9" {...S("biceps")} />
              {/* forearms */}
              <ellipse cx="22" cy="68" rx="4.5" ry="10" {...S("forearms")} />
              <ellipse cx="78" cy="68" rx="4.5" ry="10" {...S("forearms")} />
              {/* abs */}
              <rect x="43" y="46" width="14" height="26" rx="4" {...S("abs")} />
              {/* quads */}
              <path d="M41 78 Q44 78 45 82 L44 128 Q41 130 39 128 L38 84 Q38 79 41 78 Z" {...S("quads")} />
              <path d="M59 78 Q56 78 55 82 L56 128 Q59 130 61 128 L62 84 Q62 79 59 78 Z" {...S("quads")} />
              {/* calves (front/shins) */}
              <ellipse cx="42" cy="160" rx="4.5" ry="17" {...S("calves")} />
              <ellipse cx="58" cy="160" rx="4.5" ry="17" {...S("calves")} />
            </svg>
            <figcaption className="text-[10px] text-[var(--faint)] font-semibold uppercase tracking-wide">Front</figcaption>
          </figure>
          {/* BACK */}
          <figure className="text-center">
            <svg viewBox="0 0 100 210" className="w-32 sm:w-40" role="img" aria-label="Back muscle map">
              <g style={silhouette}>
                <circle cx="50" cy="14" r="8.5" />
              </g>
              {/* traps */}
              <path d="M42 24 L58 24 L54 36 L46 36 Z" {...S("traps")} />
              {/* rear shoulders */}
              <ellipse cx="31" cy="34" rx="8" ry="6" {...S("shoulders")} />
              <ellipse cx="69" cy="34" rx="8" ry="6" {...S("shoulders")} />
              {/* back / lats */}
              <path d="M40 36 L60 36 L58 70 Q50 74 42 70 Z" {...S("back")} />
              {/* triceps */}
              <ellipse cx="26" cy="50" rx="5" ry="9" {...S("triceps")} />
              <ellipse cx="74" cy="50" rx="5" ry="9" {...S("triceps")} />
              {/* forearms */}
              <ellipse cx="22" cy="68" rx="4.5" ry="10" {...S("forearms")} />
              <ellipse cx="78" cy="68" rx="4.5" ry="10" {...S("forearms")} />
              {/* glutes */}
              <ellipse cx="43" cy="82" rx="7" ry="7" {...S("glutes")} />
              <ellipse cx="57" cy="82" rx="7" ry="7" {...S("glutes")} />
              {/* hamstrings */}
              <ellipse cx="42" cy="108" rx="5.5" ry="20" {...S("hamstrings")} />
              <ellipse cx="58" cy="108" rx="5.5" ry="20" {...S("hamstrings")} />
              {/* calves */}
              <ellipse cx="42" cy="160" rx="5" ry="17" {...S("calves")} />
              <ellipse cx="58" cy="160" rx="5" ry="17" {...S("calves")} />
            </svg>
            <figcaption className="text-[10px] text-[var(--faint)] font-semibold uppercase tracking-wide">Back</figcaption>
          </figure>
        </div>

        {/* ranked list */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--faint)] mb-2.5">Most trained</p>
          {ranked.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">Log workouts with recognised exercise names to build your muscle map.</p>
          ) : (
            <div className="space-y-2">
              {ranked.slice(0, 8).map(([m, v], i) => (
                <div key={m} className="flex items-center gap-2.5">
                  <span className="w-4 text-[11px] font-bold text-[var(--faint)] tabular">{i + 1}</span>
                  <span className="w-20 text-[12px] font-medium text-[var(--text)] shrink-0">{MUSCLE_LABEL[m]}</span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--chip)] overflow-hidden"><div className="h-2 rounded-full" style={{ width: `${(v / max) * 100}%`, background: "var(--accent)" }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Exercise library + personal records ─────────────────────────────────────────
interface PR { name: string; bestWeight: number; bestReps: number; bestE1RM: number; sessions: number; lastDate: string; sessionMax: number[] }

function computePRs(workouts: Workout[]): PR[] {
  const map = new Map<string, { name: string; bestWeight: number; bestReps: number; bestE1RM: number; dates: Set<string>; byDate: Map<string, number>; lastDate: string }>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      const rec = map.get(key) ?? { name: ex.name.trim(), bestWeight: 0, bestReps: 0, bestE1RM: 0, dates: new Set<string>(), byDate: new Map<string, number>(), lastDate: "" };
      for (const s of ex.sets) {
        if (!s.done) continue;
        if (s.weight > rec.bestWeight) { rec.bestWeight = s.weight; rec.bestReps = s.reps; }
        const e1 = s.weight * (1 + s.reps / 30);   // Epley 1RM estimate
        if (e1 > rec.bestE1RM) rec.bestE1RM = e1;
        rec.byDate.set(w.date, Math.max(rec.byDate.get(w.date) ?? 0, s.weight));
      }
      rec.dates.add(w.date);
      if (w.date > rec.lastDate) rec.lastDate = w.date;
      map.set(key, rec);
    }
  }
  return [...map.values()]
    .map((r) => ({ name: r.name, bestWeight: r.bestWeight, bestReps: r.bestReps, bestE1RM: r.bestE1RM, sessions: r.dates.size, lastDate: r.lastDate, sessionMax: [...r.byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v) }))
    .sort((a, b) => b.bestE1RM - a.bestE1RM);
}

function ExerciseLibrary({ workouts }: { workouts: Workout[] }) {
  const [open, setOpen] = useState(true);
  const prs = useMemo(() => computePRs(workouts), [workouts]);
  if (prs.length === 0) return null;

  return (
    <div className="mb-6">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2.5 w-full mb-3">
        <Trophy className="w-3.5 h-3.5 text-[var(--c-amber)]" />
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">Personal Records</p>
        <span className="text-[11px] text-[var(--faint)] tabular">{prs.length}</span>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        {open ? <ChevronUp className="w-4 h-4 text-[var(--faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--faint)]" />}
      </button>
      {open && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {prs.map((pr) => {
            const trend = pr.sessionMax.length >= 2 ? pr.sessionMax.at(-1)! - pr.sessionMax.at(-2)! : 0;
            return (
              <div key={pr.name} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-[var(--text)] truncate">{pr.name}</p>
                  {pr.sessionMax.length >= 2 && (
                    <span className="flex items-center gap-0.5 text-[11px] font-semibold shrink-0" style={{ color: trend > 0 ? "var(--c-emerald)" : trend < 0 ? "var(--c-rose)" : "var(--faint)" }}>
                      {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {trend !== 0 ? `${trend > 0 ? "+" : ""}${trend}kg` : "flat"}
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xl font-extrabold text-[var(--text)] tabular leading-none">{pr.bestWeight > 0 ? `${pr.bestWeight}` : "BW"}<span className="text-xs font-semibold text-[var(--faint)]">{pr.bestWeight > 0 ? " kg" : ""}</span></p>
                    <p className="text-[10px] text-[var(--faint)] mt-0.5">PR{pr.bestReps ? ` · ${pr.bestReps} reps` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[var(--c-amber)] tabular leading-none">{pr.bestE1RM > 0 ? pr.bestE1RM.toFixed(0) : "—"}</p>
                    <p className="text-[10px] text-[var(--faint)]">est. 1RM</p>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--faint)] mt-2">{pr.sessions} session{pr.sessions !== 1 ? "s" : ""} · last {pr.lastDate}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GymPage() {
  const { data, mutate } = useBridge();
  const [editing, setEditing] = useState<Workout | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const workouts = useMemo(
    () => [...(data.workouts ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.workouts]
  );

  const stats = useMemo(() => {
    const weekStart = startOfWeek();
    const thisWeek = workouts.filter(w => new Date(w.date + "T00:00:00").getTime() >= weekStart);
    const weekVol  = thisWeek.reduce((a, w) => a + workoutVolume(w), 0);
    return {
      total: workouts.length,
      thisWeek: thisWeek.length,
      weekVol,
      streak: calcStreak(workouts),
    };
  }, [workouts]);

  function saveWorkout(w: Workout) {
    mutate(d => {
      const exists = (d.workouts ?? []).some(x => x.id === w.id);
      return { ...d, workouts: exists ? (d.workouts ?? []).map(x => x.id === w.id ? w : x) : [...(d.workouts ?? []), w] };
    });
  }
  function deleteWorkout(id: string) {
    mutate(d => ({ ...d, workouts: (d.workouts ?? []).filter(w => w.id !== id) }));
  }
  function repeatWorkout(w: Workout) {
    const copy: Workout = {
      ...w, id: uid(), date: TODAY(), createdAt: new Date().toISOString(),
      exercises: w.exercises.map(ex => ({ ...ex, id: uid(), sets: ex.sets.map(s => ({ ...s, id: uid() })) })),
    };
    setEditing(copy);
    setShowEditor(true);
  }

  const openNew  = () => { setEditing(null); setShowEditor(true); };
  const openEdit = (w: Workout) => { setEditing(w); setShowEditor(true); };

  const STAT_CARDS = [
    { label: "Total Workouts", value: stats.total.toString(),       sub: "all time",        Icon: Dumbbell },
    { label: "This Week",      value: stats.thisWeek.toString(),    sub: "sessions",        Icon: CalendarDays },
    { label: "Week Volume",    value: fmtVol(stats.weekVol),        sub: "lifted",          Icon: Weight },
    { label: "Streak",         value: `${stats.streak}d`,           sub: "consecutive",     Icon: Flame },
  ];

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Dumbbell className="w-5 h-5 text-[var(--text)]" />
            <h1 className="text-[1.6rem] font-extrabold text-[var(--text)] tracking-tight">Gym</h1>
          </div>
          <p className="text-sm text-[var(--faint)] font-medium">Log workouts, track volume, and keep your training streak alive.</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-semibold rounded-lg transition-colors shrink-0">
          <Plus className="w-4 h-4" strokeWidth={2.4} /> Log Workout
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.Icon className="w-3.5 h-3.5 text-[var(--faint)]" strokeWidth={1.9} />
              <p className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-bold">{s.label}</p>
            </div>
            <p className="text-2xl font-extrabold text-[var(--text)] leading-none tabular">{s.value}</p>
            <p className="text-[11px] text-[var(--faint)] mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Muscle map — which muscles you train most */}
      <MuscleMap workouts={workouts} />

      {/* Personal records / exercise library */}
      <ExerciseLibrary workouts={workouts} />

      {/* History */}
      <div className="flex items-center gap-2.5 mb-3">
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">History</p>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        <span className="text-[11px] text-[var(--faint)] tabular">{workouts.length} logged</span>
      </div>

      {workouts.length === 0 ? (
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-2xl py-16 flex flex-col items-center text-center">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--chip)] border border-[var(--border)] mb-4">
            <Dumbbell className="w-5 h-5 text-[var(--muted)]" strokeWidth={1.8} />
          </span>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">No workouts yet</p>
          <p className="text-xs text-[var(--faint)] mb-4 max-w-xs">Log your first session to start tracking volume and streaks.</p>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-semibold rounded-lg transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2.4} /> Log Workout
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts.map(w => (
            <WorkoutCard key={w.id} workout={w} onEdit={openEdit} onDelete={deleteWorkout} onRepeat={repeatWorkout} />
          ))}
        </div>
      )}

      {showEditor && (
        <WorkoutEditor initial={editing} onSave={saveWorkout} onClose={() => { setShowEditor(false); setEditing(null); }} />
      )}
    </div>
  );
}
