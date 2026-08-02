import type { BridgeData, CalendarCategory, CalendarEvent, CalendarRepeat, ProjectColor } from "./store";

export const CALENDAR_CATEGORIES = ["work", "personal", "money", "health", "other"] as const satisfies readonly CalendarCategory[];
export const CALENDAR_COLORS = ["indigo", "cyan", "emerald", "yellow", "red", "purple", "orange", "pink"] as const satisfies readonly ProjectColor[];
export const CALENDAR_REPEATS = ["none", "daily", "weekly", "monthly"] as const satisfies readonly CalendarRepeat[];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EVENT_FIELDS = new Set(["title", "startDate", "endDate", "allDay", "startTime", "endTime", "category", "color", "location", "notes", "repeat"]);
const CATEGORY_COLOR: Record<CalendarCategory, ProjectColor> = {
  work: "indigo",
  personal: "purple",
  money: "emerald",
  health: "orange",
  other: "cyan",
};

export type CalendarEventInput = Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">;
export type CalendarMutationResult =
  | { ok: true; data: BridgeData; event: CalendarEvent; created: boolean }
  | { ok: false; error: string };

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateCalendarRange(startDate: unknown, endDate: unknown): { ok: true; startDate?: string; endDate?: string } | { ok: false; error: string } {
  if (startDate === undefined && endDate === undefined) return { ok: true };
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) return { ok: false, error: "startDate and endDate must both be valid YYYY-MM-DD dates." };
  if (endDate < startDate) return { ok: false, error: "endDate must be on or after startDate." };
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if ((end - start) / 86_400_000 > 370) return { ok: false, error: "Calendar ranges may span at most 370 days." };
  return { ok: true, startDate, endDate };
}

function optionalText(value: unknown, name: string, max: number): { value?: string; error?: string } {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") return { error: `${name} must be a string.` };
  const clean = value.trim();
  if (clean.length > max) return { error: `${name} must be ${max} characters or fewer.` };
  return clean ? { value: clean } : {};
}

export function validateCalendarEventInput(raw: Record<string, unknown>): { ok: true; input: CalendarEventInput } | { ok: false; error: string } {
  const unknown = Object.keys(raw).find((key) => !EVENT_FIELDS.has(key));
  if (unknown) return { ok: false, error: `Unknown calendar event field: ${unknown}.` };

  const title = optionalText(raw.title, "title", 200);
  if (title.error) return { ok: false, error: title.error };
  if (!title.value) return { ok: false, error: "title is required." };
  if (!isCalendarDate(raw.startDate) || !isCalendarDate(raw.endDate)) return { ok: false, error: "startDate and endDate must be valid YYYY-MM-DD dates." };
  if (raw.endDate < raw.startDate) return { ok: false, error: "endDate must be on or after startDate." };
  if (typeof raw.allDay !== "boolean") return { ok: false, error: "allDay must be a boolean." };

  const category = raw.category ?? "work";
  if (typeof category !== "string" || !(CALENDAR_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: `category must be one of: ${CALENDAR_CATEGORIES.join(", ")}.` };
  const color = raw.color ?? CATEGORY_COLOR[category as CalendarCategory];
  if (typeof color !== "string" || !(CALENDAR_COLORS as readonly string[]).includes(color)) return { ok: false, error: `color must be one of: ${CALENDAR_COLORS.join(", ")}.` };
  const repeat = raw.repeat ?? "none";
  if (typeof repeat !== "string" || !(CALENDAR_REPEATS as readonly string[]).includes(repeat)) return { ok: false, error: `repeat must be one of: ${CALENDAR_REPEATS.join(", ")}.` };

  const location = optionalText(raw.location, "location", 500);
  const notes = optionalText(raw.notes, "notes", 20_000);
  if (location.error || notes.error) return { ok: false, error: location.error || notes.error! };

  let startTime: string | undefined;
  let endTime: string | undefined;
  if (!raw.allDay) {
    if (typeof raw.startTime !== "string" || !TIME_RE.test(raw.startTime) || typeof raw.endTime !== "string" || !TIME_RE.test(raw.endTime)) {
      return { ok: false, error: "Timed events require startTime and endTime in HH:MM format." };
    }
    if (raw.startDate === raw.endDate && raw.endTime <= raw.startTime) return { ok: false, error: "endTime must be after startTime for a single-day event." };
    startTime = raw.startTime;
    endTime = raw.endTime;
  }

  return {
    ok: true,
    input: {
      title: title.value,
      startDate: raw.startDate,
      endDate: raw.endDate,
      allDay: raw.allDay,
      ...(startTime && endTime ? { startTime, endTime } : {}),
      category: category as CalendarCategory,
      color: color as ProjectColor,
      ...(location.value ? { location: location.value } : {}),
      ...(notes.value ? { notes: notes.value } : {}),
      repeat: repeat as CalendarRepeat,
    },
  };
}

export function createCalendarEvent(data: BridgeData, raw: Record<string, unknown>, id: string, stamp = new Date().toISOString()): CalendarMutationResult {
  if (!id || id.length > 200) return { ok: false, error: "A valid event id is required." };
  if ((data.calendarEvents ?? []).some((event) => event.id === id)) return { ok: false, error: "A calendar event with that id already exists." };
  const validated = validateCalendarEventInput(raw);
  if (!validated.ok) return validated;
  const event: CalendarEvent = { id, ...validated.input, createdAt: stamp, updatedAt: stamp };
  return { ok: true, data: { ...data, calendarEvents: [...(data.calendarEvents ?? []), event], updatedAt: Date.now() }, event, created: true };
}

export function updateCalendarEvent(data: BridgeData, id: string, patch: Record<string, unknown>, stamp = new Date().toISOString()): CalendarMutationResult {
  if (!Object.keys(patch).length) return { ok: false, error: "patch must include at least one calendar event field." };
  const unknown = Object.keys(patch).find((key) => !EVENT_FIELDS.has(key));
  if (unknown) return { ok: false, error: `Unknown calendar event field: ${unknown}.` };
  const events = data.calendarEvents ?? [];
  const index = events.findIndex((event) => event.id === id);
  if (index < 0) return { ok: false, error: "Calendar event not found." };
  const current = events[index];
  const candidate = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([key]) => EVENT_FIELDS.has(key)));
  const validated = validateCalendarEventInput(candidate);
  if (!validated.ok) return validated;
  const event: CalendarEvent = { id: current.id, ...validated.input, createdAt: current.createdAt, updatedAt: stamp };
  const nextEvents = [...events];
  nextEvents[index] = event;
  return { ok: true, data: { ...data, calendarEvents: nextEvents, updatedAt: Date.now() }, event, created: false };
}

export function deleteCalendarEvent(data: BridgeData, id: string): { ok: true; data: BridgeData; event: CalendarEvent } | { ok: false; error: string } {
  const events = data.calendarEvents ?? [];
  const event = events.find((candidate) => candidate.id === id);
  if (!event) return { ok: false, error: "Calendar event not found." };
  return { ok: true, data: { ...data, calendarEvents: events.filter((candidate) => candidate.id !== id), updatedAt: Date.now() }, event };
}
