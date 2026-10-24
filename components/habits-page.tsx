"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Flame, Plus, Pencil, Archive, X, Trophy } from "lucide-react";
import { PageHeading } from "./ui/page-heading";
import { EditorDialog } from "./ui/editor-dialog";
import { useBase } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import { habitDay, habitDays, habitStreaks, nextHabitDay, setHabitLog } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/store";

function HabitForm({ habit, close, save }: { habit?: Habit; close: () => void; save: (habit: Habit) => void }) {
  const [name, setName] = useState(habit?.name ?? ""), [emoji, setEmoji] = useState(habit?.emoji ?? "🌱");
  const [type, setType] = useState(habit?.type ?? "button"), [unit, setUnit] = useState(habit?.unit ?? "");
  return <EditorDialog title={habit ? "Edit habit" : "New habit"} onClose={close}><form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; save({ ...habit, id: habit?.id ?? uid(), name: name.trim(), emoji: emoji.trim() || "🌱", type, unit: unit.trim(), reminderTime: habit?.reminderTime ?? null }); }}>
    <div className="flex justify-between"><h2 className="text-lg font-semibold">{habit ? "Edit habit" : "Start a habit"}</h2><button type="button" aria-label="Close habit editor" onClick={close}><X className="h-5 w-5"/></button></div>
    <p className="mt-1 text-sm text-[var(--muted)]">Something small you want to return to each day.</p>
    <label className="mt-5 block text-sm">Name<input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="What would you like to practise?" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"/></label>
    <div className="mt-4 grid grid-cols-[90px_1fr] gap-3"><label className="text-sm">Icon<input maxLength={32} value={emoji} onChange={event => setEmoji(event.target.value)} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-center"/></label><label className="text-sm">Track with<select value={type} onChange={event => setType(event.target.value as Habit["type"])} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"><option value="button">A daily check-in</option><option value="input">A value or amount</option></select></label></div>
    {type === "input" && <label className="mt-4 block text-sm">Unit (optional)<input maxLength={30} value={unit} onChange={event => setUnit(event.target.value)} placeholder="pages, km, glasses…" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"/></label>}
    <div className="mt-6 flex justify-end gap-2"><button type="button" className="base-button base-button-secondary" onClick={close}>Cancel</button><button className="base-button base-button-primary">Save habit</button></div>
  </form></EditorDialog>;
}

export function HabitsPage() {
  const { data, mutate } = useBase();
  const timezone = data.profile?.timezone || "UTC";
  const [today, setToday] = useState(() => habitDay(new Date(), timezone));
  const [selected, setSelected] = useState<string | null>(null), [editing, setEditing] = useState<Habit | "new" | null>(null), [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() { clearTimeout(timer); const at = new Date(); setToday(habitDay(at, timezone)); timer = setTimeout(refresh, nextHabitDay(at, timezone)); }
    const visible = () => { if (!document.hidden) refresh(); };
    refresh(); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [timezone]);
  const date = selected && selected <= today ? selected : today;
  const logsByHabit = useMemo(() => {
    const grouped = new Map<string, HabitLog[]>();
    for (const log of data.habitLogs) { const logs = grouped.get(log.habitId) ?? []; logs.push(log); grouped.set(log.habitId, logs); }
    return grouped;
  }, [data.habitLogs]);
  const habits = data.habits.filter(habit => !habit.archived), days = habitDays(today, 14);
  const complete = habits.filter(habit => logsByHabit.get(habit.id)?.some(log => log.date === date && log.completed)).length;
  const streaks = habits.map(habit => habitStreaks(logsByHabit.get(habit.id) ?? [], today));
  const longest = Math.max(0, ...streaks.map(streak => streak.best));
  function record(habit: Habit, completed: boolean, value?: string) { mutate(current => ({ ...current, habitLogs: setHabitLog(current.habitLogs, habit.id, date, completed, value, uid()) })); }
  return <div className="base-page habits-page">
    <PageHeading title="Habits & streaks" description="Small actions, a little more often."><button className="base-button base-button-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4"/>New habit</button></PageHeading>
    <div className="mb-7 grid grid-cols-3 gap-2 sm:gap-3">{[{ label: date === today ? "Today’s check-ins" : "Selected day", value: `${complete} / ${habits.length}`, Icon: Check }, { label: "Current streaks", value: `${streaks.filter(streak => streak.current > 0).length} active`, Icon: Flame }, { label: "Personal best", value: `${longest} ${longest === 1 ? "day" : "days"}`, Icon: Trophy }].map(({ label, value, Icon }) => <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-5"><div className="flex items-start gap-2 text-[11px] sm:text-xs text-[var(--muted)]"><Icon className="h-4 w-4"/>{label}</div><p className="mt-3 text-lg font-semibold tracking-tight sm:text-2xl">{value}</p></div>)}</div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium">Your daily rhythm</h2><label className="flex items-center gap-2 text-xs text-[var(--muted)]">Check-in date<input aria-label="Check-in date" type="date" max={today} value={date} onChange={event => setSelected(event.target.value || null)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"/></label></div>
    {!habits.length && <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center"><Flame className="mx-auto mb-3 h-7 w-7 text-[var(--muted)]"/><h2 className="font-medium">Build a rhythm that fits your life.</h2><p className="mt-2 text-sm text-[var(--muted)]">Create a habit, check in each day, and watch your consistency grow.</p><button className="base-button base-button-secondary mx-auto mt-5" onClick={() => setEditing("new")}>Create your first habit</button></div>}
    <div className="space-y-3">{habits.map((habit, index) => {
      const logs = logsByHabit.get(habit.id) ?? [], log = logs.find(log => log.date === date), done = logs.some(log => log.date === date && log.completed), { current, best } = streaks[index];
      return <article key={habit.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 sm:flex sm:flex-wrap"><span className="text-2xl" aria-hidden="true">{habit.emoji}</span><div className="min-w-0 flex-1"><h3 className="font-medium">{habit.name}</h3><p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><Flame className="h-3.5 w-3.5 shrink-0"/>{current} day streak · Best {best}</p></div><button aria-label={`Edit ${habit.name}`} onClick={() => setEditing(habit)} className="p-2 text-[var(--muted)]"><Pencil className="h-4 w-4"/></button><button aria-label={`Archive ${habit.name}`} onClick={() => mutate(current => ({ ...current, habits: current.habits.map(row => row.id === habit.id ? { ...row, archived: true } : row) }))} className="p-2 text-[var(--muted)]"><Archive className="h-4 w-4"/></button>
          {habit.type === "input" && <form key={`${habit.id}-${date}-${log?.value ?? ""}`} onSubmit={event => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("value") ?? "").trim(); record(habit, !!value, value); }} className="col-span-2 flex items-center gap-2"><input name="value" aria-label={`Value for ${habit.name}`} defaultValue={log?.value ?? ""} maxLength={40} placeholder={habit.unit || "Amount"} className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 text-sm"/><button className="base-button base-button-secondary">Save</button></form>}
          <button aria-label={`${done ? "Undo" : "Complete"} ${habit.name}`} aria-pressed={done} onClick={() => record(habit, !done)} className={`col-span-2 col-start-3 flex h-9 items-center justify-self-end gap-2 rounded-lg border px-3 text-xs ${done ? "border-[var(--accent)] bg-[var(--chip)]" : "border-[var(--border)]"}`}><Check className="h-3.5 w-3.5"/>{done ? "Done" : "Check in"}</button>
        </div>
        <div className="mt-5 flex gap-1.5 overflow-x-auto py-1" aria-label="Last fourteen days">{days.map(day => { const completed = logs.some(log => log.date === day && log.completed); return <button key={day} title={`${day}: ${completed ? "completed" : "no check-in"}`} aria-label={`${habit.name}, ${day}: ${completed ? "completed" : "no check-in"}`} onClick={() => setSelected(day)} className={`h-7 min-w-6 flex-1 rounded sm:min-w-0 ${completed ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"} ${date === day ? "ring-1 ring-[var(--muted)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}/>; })}</div>
        <div className="mt-2 flex justify-between text-[10px] text-[var(--faint)]"><span>{days[0].slice(5)}</span><span>Today</span></div>
      </article>;
    })}</div>
    {data.habits.some(habit => habit.archived) && <div className="mt-6"><button className="text-sm text-[var(--muted)]" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>Archived habits</button>{showArchived && data.habits.filter(habit => habit.archived).map(habit => <div key={habit.id} className="mt-2 flex items-center justify-between rounded-lg border border-[var(--border)] p-3 text-sm"><span>{habit.emoji} {habit.name}</span><button className="underline" onClick={() => mutate(current => ({ ...current, habits: current.habits.map(row => row.id === habit.id ? { ...row, archived: false } : row) }))}>Restore</button></div>)}</div>}
    {editing && <HabitForm habit={editing === "new" ? undefined : editing} close={() => setEditing(null)} save={habit => { mutate(current => ({ ...current, habits: current.habits.some(row => row.id === habit.id) ? current.habits.map(row => row.id === habit.id ? { ...row, name: habit.name, emoji: habit.emoji, type: habit.type, unit: habit.unit } : row) : [...current.habits, habit] })); setEditing(null); }}/>}
  </div>;
}
