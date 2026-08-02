import type { CalendarEvent } from "@/lib/store";

export interface CalendarOccurrence {
  occurrenceId: string;
  event: CalendarEvent;
  startDate: string;
  endDate: string;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function shiftDateKey(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function daysBetween(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

export function monthGrid(anchor: Date): string[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return dateKey(date);
  });
}

export function addMonths(anchor: Date, amount: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + amount, 1, 12);
}

export function overlapsRange(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  return end >= rangeStart && start <= rangeEnd;
}

export function coversDate(start: string, end: string, day: string): boolean {
  return start <= day && end >= day;
}

export function expandCalendarEvents(events: CalendarEvent[], rangeStart: string, rangeEnd: string): CalendarOccurrence[] {
  const occurrences: CalendarOccurrence[] = [];

  for (const event of events) {
    const duration = Math.max(0, daysBetween(event.startDate, event.endDate || event.startDate));
    if (event.repeat === "none") {
      if (overlapsRange(event.startDate, event.endDate || event.startDate, rangeStart, rangeEnd)) {
        occurrences.push({ occurrenceId: `${event.id}:${event.startDate}`, event, startDate: event.startDate, endDate: event.endDate || event.startDate });
      }
      continue;
    }

    if (event.repeat === "daily" || event.repeat === "weekly") {
      const step = event.repeat === "daily" ? 1 : 7;
      let occurrenceStart = event.startDate;
      if (occurrenceStart < rangeStart) {
        const elapsed = Math.max(0, daysBetween(occurrenceStart, rangeStart));
        occurrenceStart = shiftDateKey(occurrenceStart, Math.floor(elapsed / step) * step);
        while (shiftDateKey(occurrenceStart, duration) < rangeStart) occurrenceStart = shiftDateKey(occurrenceStart, step);
      }
      while (occurrenceStart <= rangeEnd) {
        const occurrenceEnd = shiftDateKey(occurrenceStart, duration);
        if (overlapsRange(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
          occurrences.push({ occurrenceId: `${event.id}:${occurrenceStart}`, event, startDate: occurrenceStart, endDate: occurrenceEnd });
        }
        occurrenceStart = shiftDateKey(occurrenceStart, step);
      }
      continue;
    }

    const base = parseDateKey(event.startDate);
    const baseDay = base.getDate();
    let cursor = new Date(base.getFullYear(), base.getMonth(), 1, 12);
    const endMonth = parseDateKey(rangeEnd);
    while (cursor <= endMonth) {
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), baseDay, 12);
      if (candidate.getMonth() === cursor.getMonth()) {
        const occurrenceStart = dateKey(candidate);
        const occurrenceEnd = shiftDateKey(occurrenceStart, duration);
        if (occurrenceStart >= event.startDate && overlapsRange(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
          occurrences.push({ occurrenceId: `${event.id}:${occurrenceStart}`, event, startDate: occurrenceStart, endDate: occurrenceEnd });
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
    }
  }

  return occurrences;
}
