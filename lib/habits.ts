import type { HabitLog } from "./store";
export function habitDay(at = new Date(), timezone = "UTC"): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at); }
  catch { return at.toISOString().slice(0, 10); }
}
export function habitDays(end: string, count: number): string[] {
  const at = new Date(end + "T12:00:00Z");
  return Array.from({ length: count }, (_, index) => new Date(at.getTime() - (count - index - 1) * 86_400_000).toISOString().slice(0, 10));
}
export function habitStreaks(logs: HabitLog[], today: string) {
  const days = [...new Set(logs.filter(log => log.completed && /^\d{4}-\d{2}-\d{2}$/.test(log.date) && Number.isFinite(Date.parse(log.date)) && log.date <= today).map(log => log.date))].sort();
  const completed = new Set(days);
  let best = 0, run = 0, previous = "";
  for (const date of days) {
    run = previous === habitDays(date, 2)[0] ? run + 1 : 1;
    best = Math.max(best, run); previous = date;
  }
  let current = 0, day = completed.has(today) ? today : habitDays(today, 2)[0];
  while (completed.has(day)) { current++; day = habitDays(day, 2)[0]; }
  return { current, best };
}
export function setHabitLog(logs: HabitLog[], habitId: string, date: string, completed: boolean, value: string | undefined, id: string): HabitLog[] {
  const patch = { completed, ...(value !== undefined ? { value } : {}) };
  return logs.some(log => log.habitId === habitId && log.date === date)
    ? logs.map(log => log.habitId === habitId && log.date === date ? { ...log, ...patch } : log)
    : [...logs, { id, habitId, date, ...patch }];
}

// One wake at the next workspace-date boundary, including DST and half-hour zones.
export function nextHabitDay(at: Date, timezone: string): number {
  const today = habitDay(at, timezone);
  let low = at.getTime(), high = low + 36 * 3_600_000;
  while (high - low > 1_000) {
    const middle = Math.floor((low + high) / 2);
    if (habitDay(new Date(middle), timezone) === today) low = middle; else high = middle;
  }
  return high - at.getTime() + 100;
}
