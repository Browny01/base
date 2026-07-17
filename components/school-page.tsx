"use client";

import { useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import type { SchoolDay, PeriodKey, ProjectColor } from "@/lib/store";
import {
  CalendarDays, Table2, Plus, Trash2, ChevronLeft,
  ChevronRight, Check, X, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: SchoolDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const PERIODS: PeriodKey[] = ["P1", "P2", "P3", "P4", "P5", "P6"];

type SlotType = "period" | "break" | "tutor";
interface RowDef { key: string; label: string; type: SlotType; skipFriday?: boolean }

const ROWS: RowDef[] = [
  { key: "P1",      label: "Period 1", type: "period" },
  { key: "P2",      label: "Period 2", type: "period" },
  { key: "TUTOR",   label: "Tutor",    type: "tutor",  skipFriday: true },
  { key: "BREAK_A", label: "Break",    type: "break",  skipFriday: true },
  { key: "P3",      label: "Period 3", type: "period" },
  { key: "P4",      label: "Period 4", type: "period" },
  { key: "BREAK_B", label: "Break",    type: "break" },
  { key: "P5",      label: "Period 5", type: "period" },
  { key: "P6",      label: "Period 6", type: "period" },
];

const EXAM_COLORS: { value: ProjectColor; bg: string; dot: string }[] = [
  { value: "indigo",  bg: "bg-[var(--chip)]",  dot: "bg-[var(--text)]"  },
  { value: "red",     bg: "bg-[var(--chip)]",     dot: "bg-[var(--text)]"     },
  { value: "emerald", bg: "bg-[var(--chip)]", dot: "bg-[var(--text)]" },
  { value: "yellow",  bg: "bg-[var(--chip)]",  dot: "bg-[var(--text)]"  },
  { value: "purple",  bg: "bg-[var(--chip)]",  dot: "bg-[var(--text)]"  },
  { value: "cyan",    bg: "bg-[var(--chip)]",    dot: "bg-[var(--text)]"    },
  { value: "orange",  bg: "bg-[var(--chip)]",  dot: "bg-[var(--text)]"  },
  { value: "pink",    bg: "bg-[var(--chip)]",    dot: "bg-[var(--text)]"    },
];

function colorDot(c?: ProjectColor) {
  return EXAM_COLORS.find(x => x.value === c)?.dot ?? "bg-[var(--text)]";
}
function colorBg(c?: ProjectColor) {
  return EXAM_COLORS.find(x => x.value === c)?.bg ?? "bg-[var(--chip)]";
}

// ── Timetable view ────────────────────────────────────────────────────────────

function TimetableView() {
  const { data, mutate } = useBridge();
  const [editing, setEditing] = useState<{ day: SchoolDay; period: PeriodKey } | null>(null);
  const [draft, setDraft] = useState("");

  function getSubject(day: SchoolDay, p: PeriodKey): string {
    return data.timetable?.[day]?.[p] ?? "";
  }

  function saveSubject(day: SchoolDay, p: PeriodKey, value: string) {
    mutate(d => ({
      ...d,
      timetable: {
        ...d.timetable,
        [day]: { ...(d.timetable?.[day] ?? {}), [p]: value.trim() },
      },
    }));
    setEditing(null);
  }

  function startEdit(day: SchoolDay, p: PeriodKey) {
    setDraft(getSubject(day, p));
    setEditing({ day, period: p });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left pr-3 pb-2 w-24 text-[var(--muted)] text-xs uppercase tracking-widest font-semibold"></th>
            {DAYS.map(d => (
              <th key={d} className="pb-2 text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-widest px-1">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, ri) => (
            <tr key={row.key} className={ri > 0 ? "border-t border-[var(--border)]" : ""}>
              {/* Row label */}
              <td className={cn(
                "pr-3 py-2 text-xs font-semibold whitespace-nowrap",
                row.type === "period" ? "text-[var(--muted)]" : "text-[var(--faint)]"
              )}>
                {row.type === "break" && (
                  <span className="inline-block w-full text-center text-[10px] uppercase tracking-widest">— Break —</span>
                )}
                {row.type === "tutor" && (
                  <span className="text-[var(--text)]">Tutor</span>
                )}
                {row.type === "period" && row.label}
              </td>

              {/* Day cells */}
              {DAYS.map(day => {
                const isFriSkip = row.skipFriday && day === "Fri";

                if (row.type === "break") {
                  return (
                    <td key={day} className="px-1 py-1.5">
                      <div className="h-6 rounded bg-[var(--chip)] border border-[var(--border)]" />
                    </td>
                  );
                }

                if (row.type === "tutor") {
                  return (
                    <td key={day} className="px-1 py-1.5 text-center">
                      {isFriSkip
                        ? <span className="text-[var(--faint)] text-xs">—</span>
                        : <span className="text-xs text-[var(--text)] font-medium">Tutor</span>
                      }
                    </td>
                  );
                }

                // Period cell (editable)
                const p = row.key as PeriodKey;
                const isEditing = editing?.day === day && editing.period === p;
                const subject = getSubject(day, p);

                return (
                  <td key={day} className="px-1 py-1">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveSubject(day, p, draft);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none"
                          placeholder="Subject…"
                        />
                        <button onClick={() => saveSubject(day, p, draft)} className="text-[var(--text)] hover:text-[var(--text)] shrink-0"><Check className="w-3 h-3" /></button>
                        <button onClick={() => setEditing(null)} className="text-[var(--muted)] hover:text-[var(--text)] shrink-0"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(day, p)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-xs transition-all group",
                          subject
                            ? "bg-[var(--chip)] text-[var(--text)] border border-[var(--border-2)] hover:border-[var(--border-2)]"
                            : "text-[var(--faint)] border border-dashed border-[var(--border)] hover:border-[var(--border)] hover:text-[var(--muted)]"
                        )}
                      >
                        {subject || (
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Pencil className="w-2.5 h-2.5 inline" />
                          </span>
                        )}
                        {subject && <Pencil className="w-2.5 h-2.5 float-right opacity-0 group-hover:opacity-60 mt-0.5" />}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-[var(--faint)] mt-3">Click any period cell to add or edit the subject.</p>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView() {
  const { data, mutate } = useBridge();
  const [cursor, setCursor] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ subject: "", time: "", notes: "", color: "indigo" as ProjectColor });

  const { year, month } = cursor;
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  // Build calendar grid (Mon-Sun, so shift: Mon=0...Sun=6)
  // firstDay is Sun=0, Mon=1... convert to Mon-based: (firstDay+6)%7
  const offset = (firstDay + 6) % 7;

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function examsOn(d: number) {
    return (data.exams ?? []).filter(e => e.date === dateStr(d));
  }

  function addExam() {
    if (!form.subject.trim() || !selected) return;
    mutate(d => ({
      ...d,
      exams: [...(d.exams ?? []), {
        id: uid(), subject: form.subject.trim(), date: selected,
        time: form.time || undefined, notes: form.notes.trim() || undefined, color: form.color,
      }],
    }));
    setForm({ subject: "", time: "", notes: "", color: "indigo" });
    setShowAdd(false);
  }

  function deleteExam(id: string) {
    mutate(d => ({ ...d, exams: (d.exams ?? []).filter(e => e.id !== id) }));
  }

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });
  const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const selectedExams = selected ? (data.exams ?? []).filter(e => e.date === selected) : [];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(c => {
          const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() };
        })} className="p-1.5 rounded-lg hover:bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-[var(--text)]">{monthName}</span>
        <button onClick={() => setCursor(c => {
          const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() };
        })} className="p-1.5 rounded-lg hover:bg-[var(--chip)] text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {WEEK_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest pb-1">
            {l}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`pre-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const ds = dateStr(day);
          const exams = examsOn(day);
          const isToday = ds === today;
          const isSel = ds === selected;
          const dayOfWeek = (offset + i) % 7; // 0=Mon...6=Sun
          const isWeekend = dayOfWeek >= 5;

          return (
            <button
              key={day}
              onClick={() => { setSelected(isSel ? null : ds); setShowAdd(false); }}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-start p-1 text-xs transition-all",
                isSel && "ring-2 ring-[var(--border-2)]",
                isToday && !isSel && "bg-[var(--chip)] border border-[var(--border-2)]",
                !isToday && !isSel && "hover:bg-[var(--chip)]",
                isWeekend ? "text-[var(--faint)]" : "text-[var(--text)]"
              )}
            >
              <span className={cn("font-medium leading-none mb-1", isToday && "text-[var(--text)]")}>{day}</span>
              <div className="flex gap-0.5 flex-wrap justify-center">
                {exams.slice(0, 3).map(e => (
                  <span key={e.id} className={cn("w-1.5 h-1.5 rounded-full", colorDot(e.color))} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected date panel */}
      {selected && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text)]">
              {new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add exam
            </button>
          </div>

          {showAdd && (
            <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  autoFocus
                  placeholder="Subject / exam name"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addExam()}
                  className="col-span-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
                />
                <input
                  type="time"
                  value={form.time}
                  onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none"
                />
                <input
                  placeholder="Notes (optional)"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none"
                />
              </div>
              {/* Color picker */}
              <div className="flex gap-1.5 flex-wrap">
                {EXAM_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setForm(f => ({ ...f, color: c.value }))}
                    className={cn("w-5 h-5 rounded-full transition-all", c.dot,
                      form.color === c.value ? "ring-2 ring-[var(--text)] ring-offset-1 ring-offset-[var(--bg)]" : "opacity-60 hover:opacity-90"
                    )}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors px-3 py-1.5">Cancel</button>
                <button onClick={addExam} className="text-xs bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] px-4 py-1.5 rounded-lg transition-colors font-medium">Add</button>
              </div>
            </div>
          )}

          {selectedExams.length === 0 && !showAdd && (
            <p className="text-sm text-[var(--faint)]">No exams on this day.</p>
          )}
          <div className="space-y-2">
            {selectedExams.map(e => (
              <div key={e.id} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 group", colorBg(e.color))}>
                <span className={cn("w-2 h-2 rounded-full shrink-0", colorDot(e.color))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{e.subject}</p>
                  {(e.time || e.notes) && (
                    <p className="text-xs text-[var(--muted)] truncate">{[e.time, e.notes].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <button onClick={() => deleteExam(e.id)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--text)] transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming exams list */}
      {(data.exams ?? []).length > 0 && (
        <div>
          <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Upcoming</p>
          <div className="space-y-1.5">
            {[...(data.exams ?? [])]
              .filter(e => e.date >= new Date().toISOString().split("T")[0])
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5)
              .map(e => (
                <div key={e.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 group">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", colorDot(e.color))} />
                  <span className="flex-1 text-sm text-[var(--text)] truncate">{e.subject}</span>
                  <span className="text-xs text-[var(--muted)] shrink-0">
                    {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <button onClick={() => deleteExam(e.id)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--text)] transition-all shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notes / Homework panel ────────────────────────────────────────────────────

function NotesPanel() {
  const { data, mutate } = useBridge();
  const [input, setInput] = useState("");

  const notes = data.schoolNotes ?? [];

  function addNote() {
    if (!input.trim()) return;
    mutate(d => ({
      ...d,
      schoolNotes: [...(d.schoolNotes ?? []), { id: uid(), text: input.trim(), done: false, createdAt: new Date().toISOString() }],
    }));
    setInput("");
  }

  function toggleNote(id: string) {
    mutate(d => ({
      ...d,
      schoolNotes: (d.schoolNotes ?? []).map(n => n.id === id ? { ...n, done: !n.done } : n),
    }));
  }

  function deleteNote(id: string) {
    mutate(d => ({ ...d, schoolNotes: (d.schoolNotes ?? []).filter(n => n.id !== id) }));
  }

  const open = notes.filter(n => !n.done);
  const done = notes.filter(n => n.done);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 h-fit">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-3 tracking-tight">Homework & Notes</h3>

      {/* Quick add */}
      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addNote()}
          placeholder="Add reminder or note…"
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors min-w-0"
        />
        <button
          onClick={addNote}
          className="p-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] rounded-lg transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Open notes */}
      {open.length === 0 && done.length === 0 && (
        <p className="text-sm text-[var(--faint)] text-center py-4">No reminders yet.</p>
      )}
      <div className="space-y-1.5">
        {open.map(note => (
          <div key={note.id} className="flex items-start gap-2.5 group">
            <button
              onClick={() => toggleNote(note.id)}
              className="w-4 h-4 mt-0.5 rounded border border-[var(--border)] flex items-center justify-center shrink-0 hover:border-[var(--border-2)] transition-colors"
            />
            <p className="flex-1 text-sm text-[var(--text)] leading-snug break-words">{note.text}</p>
            <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all shrink-0 mt-0.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Done notes */}
      {done.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
          {done.map(note => (
            <div key={note.id} className="flex items-start gap-2.5 group opacity-50">
              <button
                onClick={() => toggleNote(note.id)}
                className="w-4 h-4 mt-0.5 rounded border border-[var(--border-2)] bg-[var(--chip)] flex items-center justify-center shrink-0"
              >
                <Check className="w-2.5 h-2.5 text-[var(--text)]" />
              </button>
              <p className="flex-1 text-sm text-[var(--muted)] line-through leading-snug break-words">{note.text}</p>
              <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all shrink-0 mt-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SchoolPage() {
  const [view, setView] = useState<"timetable" | "calendar">("timetable");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">School</h1>

        {/* Toggle */}
        <div className="flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1">
          <button
            onClick={() => setView("timetable")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              view === "timetable"
                ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <Table2 className="w-4 h-4" />
            Timetable
          </button>
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              view === "calendar"
                ? "bg-[var(--text)] text-[var(--bg)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Main view */}
        <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          {view === "timetable"
            ? <TimetableView />
            : <CalendarView />
          }
        </div>

        {/* Right panel */}
        <div className="lg:w-64 xl:w-72 shrink-0">
          <NotesPanel />
        </div>
      </div>
    </div>
  );
}
