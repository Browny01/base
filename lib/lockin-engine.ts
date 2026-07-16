import type { LockInSession, LockInTask } from "./store";

// ── Tunable rules ────────────────────────────────────────────────────────────────
export const STREAK_STEP = 0.1;   // +0.1x per consecutive day a daily task is done
export const MAX_MULT    = 3.0;   // cap on the streak multiplier
export const EARLY_MULT  = 2;     // double points for finishing a task before its due day

export function streakMult(streak: number): number {
  // First completion = 1.0x, then +0.1x for every additional day in a row.
  return Math.min(MAX_MULT, 1 + STREAK_STEP * Math.max(0, streak - 1));
}

// ── Date helpers (all local, no UTC drift) ──────────────────────────────────────
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function parseYmd(s: string): Date { return new Date(s + "T00:00:00"); }
export function todayYmd(): string { return ymd(new Date()); }

export function eachDay(start: string, end: string): string[] {
  const res: string[] = [];
  const d = parseYmd(start);
  const e = parseYmd(end);
  while (d.getTime() <= e.getTime()) { res.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return res;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}
export function addDays(s: string, n: number): string {
  const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d);
}

const dayPart = (iso: string) => iso.split("T")[0];

// ── Point events (the ledger) ────────────────────────────────────────────────────
export type PointEventType = "earned" | "streak" | "early" | "late" | "penalty";

export interface PointEvent {
  date: string;          // day credited
  taskId: string;
  title: string;
  category: string;
  kind: "daily" | "specific";
  base: number;
  multiplier: number;
  points: number;        // signed final points
  type: PointEventType;
}

interface CompIndex {
  has: (taskId: string, date: string) => boolean;
  firstDate: (taskId: string) => string | undefined;
}
function indexCompletions(session: LockInSession): CompIndex {
  const set = new Set<string>();
  const first = new Map<string, string>();
  for (const c of session.completions) {
    set.add(c.taskId + "__" + c.date);
    const prev = first.get(c.taskId);
    if (!prev || c.date < prev) first.set(c.taskId, c.date);
  }
  return { has: (t, d) => set.has(t + "__" + d), firstDate: (t) => first.get(t) };
}

/**
 * Walk every day of the session up to `today` and produce a signed point event
 * for each completion and each missed (penalised) task.
 */
export function computeLedger(session: LockInSession, today = todayYmd()): PointEvent[] {
  const events: PointEvent[] = [];
  const comp = indexCompletions(session);
  const days = eachDay(session.startDate, session.endDate);

  // Daily (recurring) tasks — streak multiplier, penalty on missed past days.
  for (const t of session.tasks.filter(t => t.kind === "daily")) {
    const base = t.points;
    const createdDay = dayPart(t.createdAt || session.startDate);
    let streak = 0;
    for (const d of days) {
      if (d > today) break;
      if (d < createdDay) continue;
      if (comp.has(t.id, d)) {
        streak += 1;
        const mult = streakMult(streak);
        const pts = Math.round(base * mult);
        events.push({ date: d, taskId: t.id, title: t.title, category: t.category, kind: "daily",
          base, multiplier: mult, points: pts, type: streak > 1 ? "streak" : "earned" });
      } else if (d < today) {
        streak = 0;
        events.push({ date: d, taskId: t.id, title: t.title, category: t.category, kind: "daily",
          base, multiplier: 1, points: -base, type: "penalty" });
      }
      // today + not done → pending, no event
    }
  }

  // Specific (one-off) tasks — double if early, penalty once if the due day passes undone.
  for (const t of session.tasks.filter(t => t.kind === "specific")) {
    const base = t.points;
    const dd = t.date!;
    const cd = comp.firstDate(t.id);
    if (cd && cd <= today) {
      let type: PointEventType = "earned"; let mult = 1; let pts = base;
      if (cd < dd)      { type = "early"; mult = EARLY_MULT; pts = base * EARLY_MULT; }
      else if (cd > dd) { type = "late"; }
      events.push({ date: cd, taskId: t.id, title: t.title, category: t.category, kind: "specific",
        base, multiplier: mult, points: pts, type });
    } else if (!cd && dd < today) {
      events.push({ date: dd, taskId: t.id, title: t.title, category: t.category, kind: "specific",
        base, multiplier: 1, points: -base, type: "penalty" });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// ── Per-day view (calendar cells + day panel) ─────────────────────────────────────
// quality drives the calendar colour:
//   extra   → dark green  (all required done + bonus task(s) completed that day)
//   perfect → green       (all required done, exactly)
//   near    → light green (past day, exactly one task missed)
//   fail    → red         (past day, two or more tasks missed)
//   progress→ neutral     (today, still in progress)
//   rest    → neutral     (no required tasks and no bonus)
//   future  → faint
export type DayQuality = "extra" | "perfect" | "near" | "fail" | "progress" | "rest" | "future";

export interface DayStatus {
  date: string;
  due: number;
  done: number;
  extra: number;       // bonus completions credited this day (specific task done off its due day)
  missed: number;      // required tasks not done (due - done)
  perfect: boolean;
  quality: DayQuality;
  points: number;
  inRange: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export function tasksDueOn(session: LockInSession, d: string): LockInTask[] {
  return session.tasks.filter(t => {
    if (t.kind === "daily") {
      const created = dayPart(t.createdAt || session.startDate);
      return d >= created && d >= session.startDate && d <= session.endDate;
    }
    return t.date === d;
  });
}

// Overdue specific tasks that "stack" forward onto day d (still actionable, not yet done).
export function overdueOn(session: LockInSession, d: string): LockInTask[] {
  const comp = indexCompletions(session);
  return session.tasks.filter(t =>
    t.kind === "specific" && t.date! < d && t.date! >= session.startDate && !comp.firstDate(t.id));
}

// If a daily task is completed on `day`, what streak length (and thus multiplier) would it hit?
export function projectedDailyStreak(session: LockInSession, taskId: string, day: string): number {
  const t = session.tasks.find(x => x.id === taskId);
  if (!t) return 1;
  let streak = 0;
  let d = addDays(day, -1);
  while (d >= session.startDate) {
    if (isTaskDoneOn(session, t, d)) { streak++; d = addDays(d, -1); }
    else break;
  }
  return streak + 1;
}

export function isTaskDoneOn(session: LockInSession, t: LockInTask, d: string): boolean {
  const comp = indexCompletions(session);
  if (t.kind === "daily") return comp.has(t.id, d);
  const cd = comp.firstDate(t.id);
  return !!cd && cd <= d;
}

export function dayStatus(session: LockInSession, d: string, today = todayYmd()): DayStatus {
  const comp = indexCompletions(session);
  const due = tasksDueOn(session, d);
  let done = 0;
  for (const t of due) {
    if (t.kind === "daily") { if (comp.has(t.id, d)) done++; }
    else { const cd = comp.firstDate(t.id); if (cd && cd <= d) done++; }
  }
  // bonus completions credited this day: a specific task ticked off on a day that isn't its due day
  const extra = session.completions.filter(c => {
    if (c.date !== d) return false;
    const t = session.tasks.find(x => x.id === c.taskId);
    return !!t && t.kind === "specific" && t.date !== d;
  }).length;
  const missed = Math.max(0, due.length - done);
  const points = computeLedger(session, today).filter(e => e.date === d).reduce((a, e) => a + e.points, 0);
  const isToday = d === today;
  const isFuture = d > today;

  let quality: DayQuality;
  if (isFuture)                          quality = "future";
  else if (due.length === 0 && extra === 0) quality = "rest";
  else if (isToday && missed > 0)        quality = "progress";
  else if (missed <= 0)                  quality = extra > 0 ? "extra" : "perfect";
  else if (missed === 1)                 quality = "near";
  else                                   quality = "fail";

  return {
    date: d,
    due: due.length,
    done, extra, missed,
    perfect: due.length === 0 ? true : done === due.length,
    quality, points,
    inRange: d >= session.startDate && d <= session.endDate,
    isToday, isFuture,
  };
}

// ── Streaks ──────────────────────────────────────────────────────────────────────
export function perfectStreaks(session: LockInSession, today = todayYmd()): { current: number; best: number } {
  const end = today < session.endDate ? today : session.endDate;
  if (end < session.startDate) return { current: 0, best: 0 };
  const days = eachDay(session.startDate, end);
  const flags = days.map(d => {
    const s = dayStatus(session, d, today);
    return s.due > 0 ? s.perfect : null;   // null = no required tasks (neutral)
  });

  // best run of perfect days (neutral days don't break, don't add)
  let best = 0, run = 0;
  for (const f of flags) {
    if (f === false) run = 0;
    else if (f === true) { run++; best = Math.max(best, run); }
  }

  // current run ending today; an unfinished (not-yet-perfect) today shouldn't break it
  let current = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    const f = flags[i];
    const isLast = i === flags.length - 1;
    if (isLast && f !== true) continue;   // skip an unfinished today
    if (f === true) current++;
    else if (f === false) break;
    // neutral (null) → continue without breaking or adding
  }
  return { current, best };
}

// ── Summary (header stats) ────────────────────────────────────────────────────────
export interface LockInSummary {
  net: number;
  baseEarned: number;
  streakBonus: number;
  earlyBonus: number;
  penalties: number;            // negative
  byCategory: Record<string, number>;
  byType: Record<PointEventType, number>;
  todayPoints: number;
  todayDone: number;
  todayDue: number;
  todayOverdue: number;
  completionRate: number;       // 0..1 across past + today required tasks
  daysElapsed: number;
  totalDays: number;
  pct: number;                  // session progress 0..1
  current: number;              // perfect-day streak
  best: number;
  finished: boolean;
  events: PointEvent[];
}

export function summarize(session: LockInSession, today = todayYmd()): LockInSummary {
  const events = computeLedger(session, today);
  let baseEarned = 0, streakBonus = 0, earlyBonus = 0, penalties = 0;
  const byCategory: Record<string, number> = {};
  const byType = { earned: 0, streak: 0, early: 0, late: 0, penalty: 0 } as Record<PointEventType, number>;
  for (const e of events) {
    if (e.points >= 0) baseEarned += e.base;
    if (e.type === "streak") streakBonus += e.points - e.base;
    if (e.type === "early") earlyBonus += e.points - e.base;
    if (e.type === "penalty") penalties += e.points;
    byCategory[e.category] = (byCategory[e.category] || 0) + e.points;
    byType[e.type] += e.points;
  }
  const net = baseEarned + streakBonus + earlyBonus + penalties;

  const todayStatus = dayStatus(session, today, today);
  const overdue = overdueOn(session, today);

  // completion rate over evaluable days (start..min(today,end))
  const end = today < session.endDate ? today : session.endDate;
  let totDue = 0, totDone = 0;
  if (end >= session.startDate) {
    for (const d of eachDay(session.startDate, end)) {
      const s = dayStatus(session, d, today);
      totDue += s.due; totDone += s.done;
    }
  }

  const totalDays = daysBetween(session.startDate, session.endDate) + 1;
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(session.startDate, today) + 1));
  const { current, best } = perfectStreaks(session, today);

  return {
    net, baseEarned, streakBonus, earlyBonus, penalties, byCategory, byType,
    todayPoints: todayStatus.points,
    todayDone: todayStatus.done,
    todayDue: todayStatus.due,
    todayOverdue: overdue.length,
    completionRate: totDue ? totDone / totDue : 0,
    daysElapsed: elapsed,
    totalDays,
    pct: totalDays ? elapsed / totalDays : 0,
    current, best,
    finished: today > session.endDate,
    events,
  };
}

// ── Rank tiers (motivation) ──────────────────────────────────────────────────────
export interface LockInRank { min: number; label: string }
export const LOCKIN_RANKS: LockInRank[] = [
  { min: 1200, label: "UNBREAKABLE" },
  { min: 750,  label: "RELENTLESS" },
  { min: 400,  label: "DIALED IN" },
  { min: 175,  label: "LOCKED IN" },
  { min: 0,    label: "WARMING UP" },
  { min: -1e9, label: "SLIPPING" },
];
export function getRank(net: number): LockInRank {
  return LOCKIN_RANKS.find(r => net >= r.min) ?? LOCKIN_RANKS[LOCKIN_RANKS.length - 1];
}
