"use client";

import { useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, getToday, calcStreak } from "@/lib/utils";
import type { HabitType } from "@/lib/store";
import { Plus, Trash2, Flame, ChevronDown, ChevronUp, Type, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label: "Body",      emojis: ["🏃","💪","🧘","🏋️","🚴","🏊","🤸","🚶","🧗","⚽"] },
  { label: "Mind",      emojis: ["📚","✍️","💻","🧠","🎯","💡","📝","🎓","🔍","📖"] },
  { label: "Health",    emojis: ["💧","🥗","😴","💊","🍎","❤️","🥦","🥤","🫁","🧘"] },
  { label: "Creative",  emojis: ["🎵","🎨","🎸","🎬","📸","🎭","🖌️","🎹","🎤","🪄"] },
  { label: "Life",      emojis: ["☕","🌱","🧹","🔥","⭐","🏆","☀️","🌙","🙏","💰"] },
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-11 h-11 flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xl hover:border-[var(--border)] transition-colors"
      >
        {value}
      </button>

      {open && (
        <div className="absolute left-0 top-13 mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 shadow-2xl w-64">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label} className="mb-2.5 last:mb-0">
              <p className="text-[10px] text-[var(--faint)] uppercase tracking-widest font-semibold mb-1.5">{g.label}</p>
              <div className="grid grid-cols-10 gap-0.5">
                {g.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onChange(e); setOpen(false); }}
                    className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-md text-base hover:bg-[var(--chip)] transition-colors",
                      value === e && "bg-[var(--chip)]"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {/* Custom emoji input */}
          <div className="pt-2 border-t border-[var(--border)] mt-1">
            <input
              placeholder="Or type any emoji…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
              onChange={(ev) => { if ([...ev.target.value].length === 1) { onChange(ev.target.value); setOpen(false); } }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function HabitsPage() {
  const { data, mutate } = useBridge();
  const today = getToday();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formEmoji, setFormEmoji] = useState("⭐");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<HabitType>("button");
  const [formUnit, setFormUnit] = useState("");
  const [formReminder, setFormReminder] = useState("");

  function addHabit() {
    if (!formName.trim()) return;
    mutate((d) => ({
      ...d,
      habits: [
        ...d.habits,
        {
          id: uid(),
          name: formName.trim(),
          emoji: formEmoji,
          type: formType,
          unit: formUnit.trim() || undefined,
          reminderTime: formReminder || null,
        },
      ],
    }));
    setFormName("");
    setFormEmoji("⭐");
    setFormType("button");
    setFormUnit("");
    setFormReminder("");
    setShowForm(false);
  }

  function deleteHabit(id: string) {
    mutate((d) => ({
      ...d,
      habits: d.habits.filter((h) => h.id !== id),
      habitLogs: d.habitLogs.filter((l) => l.habitId !== id),
    }));
  }

  // Button habit: toggle done/undone
  function toggleHabit(habitId: string) {
    const existing = data.habitLogs.find((l) => l.habitId === habitId && l.date === today);
    mutate((d) => {
      if (existing) {
        return {
          ...d,
          habitLogs: d.habitLogs.map((l) =>
            l.id === existing.id ? { ...l, completed: !l.completed } : l
          ),
        };
      }
      return {
        ...d,
        habitLogs: [...d.habitLogs, { id: uid(), habitId, date: today, completed: true }],
      };
    });
  }

  // Input habit: save value
  function setInputValue(habitId: string, value: string) {
    const existing = data.habitLogs.find((l) => l.habitId === habitId && l.date === today);
    mutate((d) => {
      const log = { id: uid(), habitId, date: today, completed: value.trim().length > 0, value };
      if (existing) {
        return { ...d, habitLogs: d.habitLogs.map((l) => l.id === existing.id ? { ...l, ...log, id: l.id } : l) };
      }
      return { ...d, habitLogs: [...d.habitLogs, log] };
    });
  }

  const completedToday = data.habits.filter((h) =>
    data.habitLogs.some((l) => l.habitId === h.id && l.date === today && l.completed)
  ).length;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Habits</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--muted)]">{completedToday}/{data.habits.length} today</span>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Habit
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-[var(--chip)] rounded-full h-1.5 mb-7">
        <div
          className="bg-[var(--text)] h-1.5 rounded-full transition-all"
          style={{ width: data.habits.length ? `${(completedToday / data.habits.length) * 100}%` : "0%" }}
        />
      </div>

      {/* New habit form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">New Habit</h2>

          {/* Emoji + Name */}
          <div className="flex gap-3 items-start">
            <EmojiPicker value={formEmoji} onChange={setFormEmoji} />
            <input
              autoFocus
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
              placeholder="Habit name…"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHabit()}
            />
          </div>

          {/* Type selector */}
          <div>
            <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormType("button")}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left",
                  formType === "button"
                    ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
                )}
              >
                <MousePointerClick className="w-4 h-4 shrink-0" />
                <div>
                  <p className="leading-tight">Button</p>
                  <p className="text-[10px] opacity-60 leading-tight mt-0.5">Click to complete</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormType("input")}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left",
                  formType === "input"
                    ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
                )}
              >
                <Type className="w-4 h-4 shrink-0" />
                <div>
                  <p className="leading-tight">Input</p>
                  <p className="text-[10px] opacity-60 leading-tight mt-0.5">Enter a value</p>
                </div>
              </button>
            </div>
          </div>

          {/* Unit (input habits only) */}
          {formType === "input" && (
            <div>
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-1.5 block">
                Unit <span className="normal-case tracking-normal opacity-60">(optional, e.g. "glasses", "km", "pages")</span>
              </label>
              <input
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
                placeholder="glasses"
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
              />
            </div>
          )}

          {/* Reminder */}
          <div>
            <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-1.5 block">
              Reminder <span className="normal-case tracking-normal opacity-60">(optional)</span>
            </label>
            <input
              type="time"
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none w-36"
              value={formReminder}
              onChange={(e) => setFormReminder(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addHabit}
              className="px-5 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors"
            >
              Add Habit
            </button>
          </div>
        </div>
      )}

      {/* Habit list */}
      {data.habits.length === 0 ? (
        <div className="text-center py-16 text-[var(--faint)]">
          <Flame className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No habits yet. Add one to start your streak!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.habits.map((habit) => {
            const logs = data.habitLogs.filter((l) => l.habitId === habit.id);
            const todayLog = logs.find((l) => l.date === today);
            const streak = calcStreak(logs);
            const done = todayLog?.completed ?? false;

            return (
              <div
                key={habit.id}
                className={cn(
                  "bg-[var(--surface)] border rounded-xl p-4 transition-colors",
                  done ? "border-[var(--border-2)]" : "border-[var(--border)]"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Emoji / button toggle for button habits */}
                  {habit.type === "button" ? (
                    <button
                      onClick={() => toggleHabit(habit.id)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-all border",
                        done
                          ? "bg-[var(--chip)] border-[var(--border-2)] ring-1 ring-[var(--border-2)]"
                          : "bg-[var(--chip)] border-[var(--border)] hover:bg-[var(--chip)]"
                      )}
                      title={done ? "Mark as incomplete" : "Mark as complete"}
                    >
                      {habit.emoji}
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 bg-[var(--chip)] border border-[var(--border)]">
                      {habit.emoji}
                    </div>
                  )}

                  {/* Name + streak */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "font-medium text-sm",
                        done ? "text-[var(--text)]" : "text-[var(--text)]"
                      )}>
                        {habit.name}
                      </span>
                      {streak > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-[var(--text)] font-medium">
                          <Flame className="w-3 h-3" />
                          {streak}d
                        </span>
                      )}
                      {habit.type === "input" && (
                        <span className="text-[10px] text-[var(--faint)] bg-[var(--chip)] border border-[var(--border)] px-1.5 py-0.5 rounded-md uppercase tracking-wide font-semibold">
                          Input
                        </span>
                      )}
                    </div>
                    {habit.reminderTime && (
                      <p className="text-xs text-[var(--faint)] mt-0.5">⏰ {habit.reminderTime}</p>
                    )}
                  </div>

                  {/* 7-day heatmap */}
                  <div className="flex gap-1 shrink-0">
                    {last7.map((d) => {
                      const log = logs.find((l) => l.date === d);
                      return (
                        <div
                          key={d}
                          title={d}
                          className={cn(
                            "w-3 h-3 rounded-sm",
                            log?.completed ? "bg-[var(--text)]" : "bg-[var(--chip)]"
                          )}
                        />
                      );
                    })}
                  </div>

                  <button
                    onClick={() => deleteHabit(habit.id)}
                    className="text-[var(--faint)] hover:text-[var(--text)] transition-colors shrink-0 ml-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Input habit field */}
                {habit.type === "input" && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={`Enter ${habit.unit || "value"}…`}
                      defaultValue={todayLog?.value ?? ""}
                      key={today + habit.id} // re-mount when date changes
                      onBlur={(e) => setInputValue(habit.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className={cn(
                        "flex-1 bg-[var(--surface-2)] border rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none transition-colors",
                        done ? "border-[var(--border-2)] focus:border-[var(--border-2)]" : "border-[var(--border)] focus:border-[var(--border-2)]"
                      )}
                    />
                    {habit.unit && (
                      <span className="text-xs text-[var(--muted)] shrink-0">{habit.unit}</span>
                    )}
                    {done && (
                      <span className="text-xs text-[var(--text)] shrink-0 font-medium">✓</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
