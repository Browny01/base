"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clock,
  CreditCard, Dumbbell, ExternalLink, Flag, GraduationCap, Loader2, MapPin,
  Pencil, Plus, Repeat2, Trash2, Video, X,
} from "lucide-react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import {
  addMonths, coversDate, dateKey, expandCalendarEvents, monthGrid, parseDateKey,
  shiftDateKey,
} from "@/lib/calendar";
import { cn, formatAUD, uid } from "@/lib/utils";
import type {
  CalendarCategory, CalendarEvent, CalendarRepeat, PaymentSubscription, ProjectColor,
} from "@/lib/store";

type SourceKey = "calendar" | "tasks" | "milestones" | "subscriptions" | "exams" | "workouts" | "calcom";

interface ScheduleItem {
  id: string;
  source: SourceKey;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  color: string;
  meta?: string;
  detail?: string;
  href?: string;
  event?: CalendarEvent;
}

interface CalcomBooking {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  attendee: string;
}

interface EventDraft {
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  category: CalendarCategory;
  color: ProjectColor;
  location: string;
  notes: string;
  repeat: CalendarRepeat;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SOURCES: { key: SourceKey; label: string; color: string }[] = [
  { key: "calendar", label: "Events", color: "var(--c-indigo)" },
  { key: "tasks", label: "Tasks", color: "var(--c-cyan)" },
  { key: "milestones", label: "Milestones", color: "var(--c-purple)" },
  { key: "subscriptions", label: "Payments", color: "var(--c-emerald)" },
  { key: "exams", label: "Exams", color: "var(--c-amber)" },
  { key: "workouts", label: "Workouts", color: "var(--c-orange)" },
  { key: "calcom", label: "Cal.com", color: "var(--c-blue)" },
];
const COLOR_OPTIONS: ProjectColor[] = ["indigo", "cyan", "emerald", "yellow", "red", "purple", "orange", "pink"];
const COLORS: Record<ProjectColor, string> = {
  indigo: "var(--c-indigo)", cyan: "var(--c-cyan)", emerald: "var(--c-emerald)",
  yellow: "var(--c-amber)", red: "var(--c-rose)", purple: "var(--c-purple)",
  orange: "var(--c-orange)", pink: "var(--c-pink)",
};
const CATEGORY_DEFAULTS: Record<CalendarCategory, ProjectColor> = {
  work: "indigo", personal: "purple", money: "emerald", health: "orange", other: "cyan",
};
const SOURCE_LABEL: Record<SourceKey, string> = Object.fromEntries(SOURCES.map((source) => [source.key, source.label])) as Record<SourceKey, string>;

function blankDraft(day: string): EventDraft {
  return {
    title: "", startDate: day, endDate: day, allDay: false, startTime: "09:00", endTime: "10:00",
    category: "work", color: "indigo", location: "", notes: "", repeat: "none",
  };
}

function draftFromEvent(event: CalendarEvent): EventDraft {
  return {
    title: event.title, startDate: event.startDate, endDate: event.endDate || event.startDate,
    allDay: event.allDay, startTime: event.startTime || "09:00", endTime: event.endTime || "10:00",
    category: event.category, color: event.color, location: event.location || "", notes: event.notes || "",
    repeat: event.repeat,
  };
}

function displayTime(item: ScheduleItem): string {
  if (item.allDay) return "All day";
  if (!item.startTime) return "Scheduled";
  return item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
}

function formatSelectedDate(day: string): string {
  return parseDateKey(day).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

function subscriptionDate(date: string, frequency: PaymentSubscription["frequency"]): string {
  if (frequency === "weekly") return shiftDateKey(date, 7);
  const source = parseDateKey(date);
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const targetMonth = new Date(source.getFullYear(), source.getMonth() + months, 1, 12);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate();
  return dateKey(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(source.getDate(), lastDay), 12));
}

function projectSubscriptions(subscriptions: PaymentSubscription[], start: string, end: string): ScheduleItem[] {
  const projected: ScheduleItem[] = [];
  for (const subscription of subscriptions.filter((entry) => entry.active && entry.dueDate)) {
    let due = subscription.dueDate;
    let guard = 0;
    while (due < start && guard++ < 600) due = subscriptionDate(due, subscription.frequency);
    while (due <= end && guard++ < 650) {
      projected.push({
        id: `subscription:${subscription.id}:${due}`, source: "subscriptions", title: subscription.name,
        startDate: due, endDate: due, allDay: true, color: "var(--c-emerald)",
        meta: formatAUD(subscription.amount), detail: `${subscription.frequency} · ${subscription.category || "Subscription"}`,
        href: "/finance",
      });
      due = subscriptionDate(due, subscription.frequency);
    }
  }
  return projected;
}

function sourceIcon(source: SourceKey, className = "w-4 h-4") {
  const props = { className, strokeWidth: 1.9 };
  if (source === "tasks") return <CheckSquare {...props} />;
  if (source === "milestones") return <Flag {...props} />;
  if (source === "subscriptions") return <CreditCard {...props} />;
  if (source === "exams") return <GraduationCap {...props} />;
  if (source === "workouts") return <Dumbbell {...props} />;
  if (source === "calcom") return <Video {...props} />;
  return <CalendarDays {...props} />;
}

export function CalendarPage() {
  const { data, mutate, loaded } = useBridge();
  const { toast } = useToast();
  const today = dateKey(new Date());
  const [anchor, setAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDay, setSelectedDay] = useState(today);
  const [enabled, setEnabled] = useState<Record<SourceKey, boolean>>(() => Object.fromEntries(SOURCES.map((source) => [source.key, true])) as Record<SourceKey, boolean>);
  const [calcom, setCalcom] = useState<CalcomBooking[]>([]);
  const [calcomState, setCalcomState] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  const [editor, setEditor] = useState<{ open: boolean; event: CalendarEvent | null }>({ open: false, event: null });

  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  useEffect(() => {
    const controller = new AbortController();
    const start = parseDateKey(rangeStart);
    start.setHours(0, 0, 0, 0);
    const end = parseDateKey(rangeEnd);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    fetch(`/api/calcom/bookings?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || body.error) throw new Error(body.error || "Could not load Cal.com");
        if (!body.configured) {
          setCalcom([]);
          setCalcomState("unconfigured");
          return;
        }
        setCalcom(Array.isArray(body.bookings) ? body.bookings : []);
        setCalcomState("ready");
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setCalcom([]);
        setCalcomState("error");
      });
    return () => controller.abort();
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    const openRequestedEvent = () => {
      try {
        if (localStorage.getItem("bridge_open_new_event")) {
          localStorage.removeItem("bridge_open_new_event");
          setEditor({ open: true, event: null });
        }
      } catch {}
    };
    const frame = requestAnimationFrame(openRequestedEvent);
    window.addEventListener("bridge:new-event", openRequestedEvent);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("bridge:new-event", openRequestedEvent);
    };
  }, []);

  const allItems = useMemo<ScheduleItem[]>(() => {
    const calendarItems = expandCalendarEvents(data.calendarEvents ?? [], rangeStart, rangeEnd).map((occurrence): ScheduleItem => ({
      id: `calendar:${occurrence.occurrenceId}`, source: "calendar", title: occurrence.event.title,
      startDate: occurrence.startDate, endDate: occurrence.endDate, allDay: occurrence.event.allDay,
      startTime: occurrence.event.startTime, endTime: occurrence.event.endTime, color: COLORS[occurrence.event.color],
      meta: occurrence.event.location || undefined,
      detail: occurrence.event.repeat !== "none" ? `${occurrence.event.category} · Repeats ${occurrence.event.repeat}` : occurrence.event.category,
      event: occurrence.event,
    }));
    const tasks: ScheduleItem[] = (data.tasks ?? []).filter((task) => !task.done && task.dueDate).map((task) => ({
      id: `task:${task.id}`, source: "tasks", title: task.title, startDate: task.dueDate!, endDate: task.dueDate!, allDay: true,
      color: "var(--c-cyan)", meta: `${task.priority} · ${task.tag}`, detail: task.recurring ? `Repeats ${task.recurring}` : undefined,
      href: task.projectId ? `/projects/${task.projectId}` : "/tasks",
    }));
    const milestones: ScheduleItem[] = (data.milestones ?? []).filter((milestone) => milestone.status !== "done" && milestone.dueDate).map((milestone) => ({
      id: `milestone:${milestone.id}`, source: "milestones", title: milestone.title, startDate: milestone.dueDate!, endDate: milestone.dueDate!, allDay: true,
      color: "var(--c-purple)", meta: milestone.status.replace("-", " "), href: `/projects/${milestone.projectId}`,
    }));
    const exams: ScheduleItem[] = (data.exams ?? []).filter((exam) => exam.date).map((exam) => ({
      id: `exam:${exam.id}`, source: "exams", title: exam.subject, startDate: exam.date, endDate: exam.date, allDay: !exam.time,
      startTime: exam.time, color: exam.color ? COLORS[exam.color] : "var(--c-amber)", meta: exam.notes,
    }));
    const workouts: ScheduleItem[] = (data.workouts ?? []).filter((workout) => workout.date).map((workout) => ({
      id: `workout:${workout.id}`, source: "workouts", title: workout.name, startDate: workout.date, endDate: workout.date, allDay: true,
      color: "var(--c-orange)", meta: workout.durationMins ? `${workout.durationMins} min` : `${workout.exercises.length} exercises`,
      detail: workout.notes, href: "/gym",
    }));
    const bookings: ScheduleItem[] = calcom.flatMap((booking) => {
      const start = new Date(booking.startTime);
      const end = new Date(booking.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
      return [{
        id: `calcom:${booking.id}`, source: "calcom" as const, title: booking.title,
        startDate: dateKey(start), endDate: dateKey(end), allDay: false,
        startTime: start.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
        endTime: end.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }),
        color: "var(--c-blue)", meta: booking.attendee, detail: booking.status, href: "/business",
      }];
    });
    return [...calendarItems, ...tasks, ...milestones, ...projectSubscriptions(data.subscriptions ?? [], rangeStart, rangeEnd), ...exams, ...workouts, ...bookings];
  }, [data, rangeStart, rangeEnd, calcom]);

  const visibleItems = useMemo(() => allItems.filter((item) => enabled[item.source]), [allItems, enabled]);
  const itemsByDay = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const day of days) {
      const items = visibleItems.filter((item) => coversDate(item.startDate, item.endDate, day)).sort(sortScheduleItems);
      map.set(day, items);
    }
    return map;
  }, [days, visibleItems]);
  const agenda = useMemo(() => visibleItems.filter((item) => coversDate(item.startDate, item.endDate, selectedDay)).sort(sortScheduleItems), [visibleItems, selectedDay]);

  function moveMonth(amount: number) {
    const next = addMonths(anchor, amount);
    setCalcomState("loading");
    setAnchor(next);
    setSelectedDay(dateKey(next));
  }

  function goToday() {
    const now = new Date();
    setCalcomState("loading");
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1, 12));
    setSelectedDay(today);
  }

  function chooseDay(day: string) {
    setSelectedDay(day);
    const date = parseDateKey(day);
    if (date.getMonth() !== anchor.getMonth() || date.getFullYear() !== anchor.getFullYear()) {
      setCalcomState("loading");
      setAnchor(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    }
  }

  function openNew() {
    setEditor({ open: true, event: null });
  }

  function saveEvent(draft: EventDraft) {
    const now = new Date().toISOString();
    if (editor.event) {
      mutate((current) => ({
        ...current,
        calendarEvents: (current.calendarEvents ?? []).map((event) => event.id === editor.event!.id ? {
          ...event, ...draft, startTime: draft.allDay ? undefined : draft.startTime,
          endTime: draft.allDay ? undefined : draft.endTime, location: draft.location.trim() || undefined,
          notes: draft.notes.trim() || undefined, title: draft.title.trim(), updatedAt: now,
        } : event),
      }));
      toast("Event updated");
    } else {
      const event: CalendarEvent = {
        id: uid(), ...draft, title: draft.title.trim(), startTime: draft.allDay ? undefined : draft.startTime,
        endTime: draft.allDay ? undefined : draft.endTime, location: draft.location.trim() || undefined,
        notes: draft.notes.trim() || undefined, createdAt: now, updatedAt: now,
      };
      mutate((current) => ({ ...current, calendarEvents: [...(current.calendarEvents ?? []), event] }));
      setSelectedDay(draft.startDate);
      toast("Event added");
    }
    setEditor({ open: false, event: null });
  }

  function deleteEvent(event: CalendarEvent) {
    mutate((current) => ({ ...current, calendarEvents: (current.calendarEvents ?? []).filter((candidate) => candidate.id !== event.id) }));
    setEditor({ open: false, event: null });
    toast("Event deleted", {
      action: { label: "Undo", onClick: () => mutate((current) => ({ ...current, calendarEvents: [...(current.calendarEvents ?? []), event] })) },
    });
  }

  return (
    <div className="calendar-page min-h-full px-3 pb-[var(--app-bottom-clearance)] pt-4 sm:px-5 sm:pt-5 lg:px-7 lg:pt-6">
      <div className="mx-auto max-w-[1540px]">
        <header className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px w-8 bg-[var(--border-2)]" />
              <span className="eyebrow">Time, made visible</span>
            </div>
            <h1 className="text-[clamp(2rem,5vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-[var(--text)]">
              {anchor.toLocaleDateString("en-AU", { month: "long" })}
              <span className="ml-2 font-normal text-[var(--faint)] sm:ml-3">{anchor.getFullYear()}</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
              <button onClick={() => moveMonth(-1)} aria-label="Previous month" className="calendar-icon-button"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={goToday} className="h-8 rounded-lg px-3 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Today</button>
              <button onClick={() => moveMonth(1)} aria-label="Next month" className="calendar-icon-button"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button onClick={openNew} className="btn-primary flex h-[42px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold">
              <Plus className="h-4 w-4" /> New event
            </button>
          </div>
        </header>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Calendar sources">
          {SOURCES.map((source) => (
            <button key={source.key} onClick={() => setEnabled((current) => ({ ...current, [source.key]: !current[source.key] }))}
              aria-pressed={enabled[source.key]}
              className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                enabled[source.key] ? "border-[var(--border-2)] bg-[var(--surface)] text-[var(--text)]" : "border-[var(--border)] text-[var(--faint)] opacity-60")}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: enabled[source.key] ? source.color : "var(--faint)" }} />
              {source.label}
            </button>
          ))}
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_20px_70px_-45px_rgba(0,0,0,.8)]">
            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
              {WEEKDAYS.map((day) => <div key={day} className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const date = parseDateKey(day);
                const outside = date.getMonth() !== anchor.getMonth();
                const selected = day === selectedDay;
                const dayItems = itemsByDay.get(day) ?? [];
                return (
                  <button key={day} onClick={() => chooseDay(day)}
                    className={cn("calendar-day group relative min-h-[76px] border-b border-r border-[var(--border)] p-1.5 text-left sm:min-h-[104px] sm:p-2 lg:min-h-[122px]",
                      index % 7 === 6 && "border-r-0", index >= 35 && "border-b-0", outside && "bg-[var(--bg)]/45", selected && "calendar-day-selected")}
                  >
                    <span className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular transition-colors",
                      day === today ? "bg-[var(--text)] text-[var(--bg)]" : selected ? "bg-[var(--chip-2)] text-[var(--text)]" : outside ? "text-[var(--faint)]" : "text-[var(--muted)] group-hover:text-[var(--text)]")}
                    >{date.getDate()}</span>
                    <div className="space-y-0.5 overflow-hidden">
                      {dayItems.slice(0, 3).map((item) => (
                        <span key={item.id} onClick={(event) => { event.stopPropagation(); if (item.event) setEditor({ open: true, event: item.event }); else chooseDay(day); }}
                          className="calendar-chip flex h-[17px] items-center gap-1 rounded px-1 text-[9px] font-semibold leading-none text-[var(--text)] sm:h-5 sm:px-1.5 sm:text-[10px]"
                          style={{ background: `color-mix(in srgb, ${item.color} 13%, transparent)`, borderLeftColor: item.color }}
                        >
                          {!item.allDay && <span className="hidden tabular opacity-65 sm:inline">{item.startTime}</span>}
                          <span className="truncate">{item.title}</span>
                        </span>
                      ))}
                      {dayItems.length > 3 && <span className="block px-1 text-[9px] font-semibold text-[var(--faint)]">+{dayItems.length - 3} more</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 xl:sticky xl:top-[76px]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">Selected day</p>
                <h2 className="text-lg font-semibold text-[var(--text)]">{formatSelectedDate(selectedDay)}</h2>
              </div>
              <button onClick={openNew} aria-label={`Add event on ${formatSelectedDate(selectedDay)}`} className="calendar-icon-button mt-0.5 border border-[var(--border)] bg-[var(--surface-2)]"><Plus className="h-4 w-4" /></button>
            </div>

            {!loaded ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-4 text-[12px] text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading your schedule…</div>
            ) : agenda.length === 0 ? (
              <button onClick={openNew} className="group w-full rounded-2xl border border-dashed border-[var(--border-2)] px-5 py-10 text-center transition-colors hover:bg-[var(--surface-2)]">
                <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--faint)] group-hover:text-[var(--text)]"><Plus className="h-4 w-4" /></span>
                <span className="block text-[13px] font-semibold text-[var(--text)]">The day is open</span>
                <span className="mt-1 block text-[11px] text-[var(--faint)]">Add something worth protecting.</span>
              </button>
            ) : (
              <div className="space-y-2">
                {agenda.map((item, index) => <AgendaItem key={item.id} item={item} index={index} onEdit={(event) => setEditor({ open: true, event })} />)}
              </div>
            )}

            {calcomState === "loading" && enabled.calcom && <p className="mt-3 flex items-center gap-2 text-[10.5px] text-[var(--faint)]"><Loader2 className="h-3 w-3 animate-spin" /> Refreshing Cal.com</p>}
            {calcomState === "error" && enabled.calcom && <p className="mt-3 flex items-center gap-2 text-[10.5px] text-[var(--c-rose)]"><AlertCircle className="h-3 w-3" /> Cal.com is unavailable; Base events are unaffected.</p>}
            {calcomState === "unconfigured" && enabled.calcom && <p className="mt-3 text-[10.5px] text-[var(--faint)]">Add CALCOM_API_KEY to include bookings.</p>}
          </aside>
        </div>
      </div>

      {editor.open && (
        <EventEditor day={selectedDay} event={editor.event} onClose={() => setEditor({ open: false, event: null })} onSave={saveEvent} onDelete={deleteEvent} />
      )}
    </div>
  );
}

function sortScheduleItems(a: ScheduleItem, b: ScheduleItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (a.startTime || "").localeCompare(b.startTime || "") || a.title.localeCompare(b.title);
}

function AgendaItem({ item, index, onEdit }: { item: ScheduleItem; index: number; onEdit: (event: CalendarEvent) => void }) {
  const content = (
    <div className="group flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 transition-all hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]" style={{ animationDelay: `${index * 28}ms` }}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ color: item.color, background: `color-mix(in srgb, ${item.color} 12%, transparent)` }}>
        {sourceIcon(item.source)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: item.color }}>{SOURCE_LABEL[item.source]}</span>
          {item.event?.repeat !== "none" && <Repeat2 className="h-3 w-3 text-[var(--faint)]" />}
        </div>
        <p className="truncate text-[13px] font-semibold text-[var(--text)]">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[var(--faint)]">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{displayTime(item)}</span>
          {item.meta && <span className="flex min-w-0 items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{item.meta}</span>}
        </div>
        {item.detail && <p className="mt-1.5 line-clamp-2 text-[10.5px] capitalize text-[var(--muted)]">{item.detail}</p>}
      </div>
      {item.event ? <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--faint)] opacity-0 transition-opacity group-hover:opacity-100" /> : item.href ? <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--faint)]" /> : null}
    </div>
  );
  if (item.event) return <button onClick={() => onEdit(item.event!)} className="block w-full text-left">{content}</button>;
  if (item.href) return <Link href={item.href} className="block">{content}</Link>;
  return content;
}

function EventEditor({ day, event, onClose, onSave, onDelete }: {
  day: string; event: CalendarEvent | null; onClose: () => void; onSave: (draft: EventDraft) => void; onDelete: (event: CalendarEvent) => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => event ? draftFromEvent(event) : blankDraft(day));
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!draft.title.trim()) { setError("Give this event a title."); return; }
    if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) { setError("The end date must be on or after the start date."); return; }
    if (!draft.allDay && draft.startDate === draft.endDate && draft.endTime <= draft.startTime) { setError("The end time must be after the start time."); return; }
    onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 px-0 backdrop-blur-[3px] sm:items-center sm:px-4" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="event-editor-title" className="nx-slide-up max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] border border-[var(--border)] bg-[var(--bg)] p-5 elevated sm:max-w-[620px] sm:rounded-[22px] sm:p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="eyebrow mb-1">{event ? "Edit entire series" : "Protect the time"}</p>
            <h2 id="event-editor-title" className="text-xl font-semibold text-[var(--text)]">{event ? "Edit event" : "New event"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close event editor" className="calendar-icon-button"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="calendar-label">Title</span>
            <input autoFocus value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} placeholder="What’s happening?" className="calendar-field text-[16px] sm:text-sm" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="calendar-label">Starts</span><input type="date" value={draft.startDate} onChange={(e) => setDraft((current) => ({ ...current, startDate: e.target.value, endDate: current.endDate < e.target.value ? e.target.value : current.endDate }))} className="calendar-field" /></label>
            <label><span className="calendar-label">Ends</span><input type="date" min={draft.startDate} value={draft.endDate} onChange={(e) => setDraft((current) => ({ ...current, endDate: e.target.value }))} className="calendar-field" /></label>
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <span><span className="block text-[12px] font-semibold text-[var(--text)]">All-day event</span><span className="text-[10.5px] text-[var(--faint)]">Keep it above the timed agenda</span></span>
            <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft((current) => ({ ...current, allDay: e.target.checked }))} className="h-4 w-4 accent-[var(--text)]" />
          </label>
          {!draft.allDay && <div className="grid grid-cols-2 gap-3"><label><span className="calendar-label">Start time</span><input type="time" value={draft.startTime} onChange={(e) => setDraft((current) => ({ ...current, startTime: e.target.value }))} className="calendar-field" /></label><label><span className="calendar-label">End time</span><input type="time" value={draft.endTime} onChange={(e) => setDraft((current) => ({ ...current, endTime: e.target.value }))} className="calendar-field" /></label></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="calendar-label">Category</span><select value={draft.category} onChange={(e) => { const category = e.target.value as CalendarCategory; setDraft((current) => ({ ...current, category, color: CATEGORY_DEFAULTS[category] })); }} className="calendar-field"><option value="work">Work</option><option value="personal">Personal</option><option value="money">Money</option><option value="health">Health</option><option value="other">Other</option></select></label>
            <label><span className="calendar-label">Repeats</span><select value={draft.repeat} onChange={(e) => setDraft((current) => ({ ...current, repeat: e.target.value as CalendarRepeat }))} className="calendar-field"><option value="none">Doesn’t repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>
          </div>
          <fieldset><legend className="calendar-label">Colour</legend><div className="flex flex-wrap gap-2">{COLOR_OPTIONS.map((color) => <button key={color} type="button" aria-label={`${color} event colour`} aria-pressed={draft.color === color} onClick={() => setDraft((current) => ({ ...current, color }))} className={cn("h-7 w-7 rounded-full border-2 transition-transform", draft.color === color ? "scale-110 border-[var(--text)]" : "border-[var(--bg)] hover:scale-105")} style={{ background: COLORS[color], boxShadow: "0 0 0 1px var(--border)" }} />)}</div></fieldset>
          <label><span className="calendar-label">Location</span><input value={draft.location} onChange={(e) => setDraft((current) => ({ ...current, location: e.target.value }))} placeholder="Optional" className="calendar-field" /></label>
          <label><span className="calendar-label">Notes</span><textarea rows={3} value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Context, preparation, links…" className="calendar-field resize-none" /></label>
        </div>

        {error && <p role="alert" className="mt-4 flex items-center gap-2 text-[12px] font-medium text-[var(--c-rose)]"><AlertCircle className="h-4 w-4" />{error}</p>}
        {event?.repeat !== "none" && <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10.5px] text-[var(--muted)]">Changes apply to the entire repeating series.</p>}

        <div className="mt-6 flex items-center gap-2 border-t border-[var(--border)] pt-4">
          {event && <button type="button" onClick={() => onDelete(event)} className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-semibold text-[var(--c-rose)] transition-colors hover:bg-[var(--surface-2)]"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
          <div className="ml-auto flex gap-2"><button type="button" onClick={onClose} className="btn-ghost h-9 rounded-lg px-3 text-[12px] font-semibold">Cancel</button><button type="submit" className="btn-primary h-9 rounded-lg px-4 text-[12px] font-semibold">{event ? "Save changes" : "Add event"}</button></div>
        </div>
      </form>
    </div>
  );
}
