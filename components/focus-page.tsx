"use client";

import { useState, useEffect, useRef } from "react";
import { useNexus } from "@/lib/hooks";
import { uid, getToday, formatTime } from "@/lib/utils";
import type { TaskTag } from "@/lib/store";
import { Play, Pause, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { label: "Pomodoro", mins: 25 },
  { label: "Flow", mins: 50 },
  { label: "Deep", mins: 90 },
];

const TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];

export function FocusPage() {
  const { data, mutate } = useNexus();
  const [modeIdx, setModeIdx] = useState(0);
  const [seconds, setSeconds] = useState(MODES[0].mins * 60);
  const [running, setRunning] = useState(false);
  const [lockIn, setLockIn] = useState(false);
  const [tag, setTag] = useState<TaskTag>("@work");
  const [notes, setNotes] = useState("");
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSecs = MODES[modeIdx].mins * 60;
  const progress = ((totalSecs - seconds) / totalSecs) * 100;

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            logSession(MODES[modeIdx].mins);
            try { new Audio("/chime.mp3").play(); } catch {}
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function start() {
    if (!running && seconds === totalSecs) setSessionStart(Date.now());
    setRunning(true);
  }

  function pause() {
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setSeconds(MODES[modeIdx].mins * 60);
    setSessionStart(null);
  }

  function selectMode(idx: number) {
    setRunning(false);
    setModeIdx(idx);
    setSeconds(MODES[idx].mins * 60);
    setSessionStart(null);
  }

  function logSession(durationMins: number) {
    mutate((d) => ({
      ...d,
      focusSessions: [
        ...d.focusSessions,
        { id: uid(), durationMins, tag, notes, date: getToday() },
      ],
    }));
  }

  function logManual() {
    const elapsed = sessionStart ? Math.round((Date.now() - sessionStart) / 60000) : MODES[modeIdx].mins;
    logSession(elapsed);
    reset();
    setNotes("");
  }

  const circumference = 2 * Math.PI * 110;
  const dash = circumference * (1 - progress / 100);

  const todaySessions = data.focusSessions.filter((s) => s.date === getToday());
  const todayMins = todaySessions.reduce((s, f) => s + f.durationMins, 0);

  return (
    <div className={cn("min-h-screen transition-colors", lockIn ? "bg-[var(--text)]" : "bg-[var(--surface)]")}>
      <div className={cn("p-6 max-w-xl mx-auto", lockIn && "flex flex-col items-center justify-center min-h-screen")}>
        {!lockIn && (
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Deep Work</h1>
              <p className="text-sm text-[var(--muted)]">Today: {todayMins}m focused</p>
            </div>
            <button onClick={() => setLockIn(true)} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        )}

        {lockIn && (
          <button
            onClick={() => setLockIn(false)}
            className="absolute top-4 right-4 text-[var(--faint)] hover:text-[var(--text)] transition-colors"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        )}

        {/* Mode Selector */}
        {!lockIn && (
          <div className="flex gap-2 mb-8 bg-[var(--surface)] p-1 rounded-lg">
            {MODES.map((m, i) => (
              <button
                key={m.label}
                onClick={() => selectMode(i)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                  modeIdx === i ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]"
                )}
              >
                {m.label}
                <span className="block text-xs opacity-60">{m.mins}m</span>
              </button>
            ))}
          </div>
        )}

        {/* Circle Timer */}
        <div className="flex justify-center mb-8">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" width="256" height="256" viewBox="0 0 256 256">
              <circle cx="128" cy="128" r="110" fill="none" style={{ stroke: "var(--border)" }} strokeWidth="6" />
              <circle
                cx="128"
                cy="128"
                r="110"
                fill="none"
                style={{ stroke: running ? "var(--text)" : "var(--border-2)" }}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dash}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="text-center">
              <p className="text-5xl font-mono font-bold text-[var(--text)]">{formatTime(seconds)}</p>
              <p className="text-sm text-[var(--muted)] mt-1">{MODES[modeIdx].label}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={reset}
            className="p-3 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={running ? pause : start}
            className="px-10 py-3 rounded-full bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] font-semibold flex items-center gap-2 transition-colors"
          >
            {running ? <><Pause className="w-5 h-5" /> Pause</> : <><Play className="w-5 h-5" /> Start</>}
          </button>
          {sessionStart && !running && (
            <button
              onClick={logManual}
              className="p-3 rounded-full bg-[var(--chip)] border border-[var(--border-2)] text-[var(--text)] hover:bg-[var(--chip-2)] transition-colors text-xs px-4"
            >
              Log
            </button>
          )}
        </div>

        {/* Session Context */}
        {!lockIn && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Context Tag</label>
              <div className="flex gap-1 flex-wrap">
                {TAGS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full border transition-colors",
                      tag === t
                        ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)]"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1 block">Session Notes</label>
              <input
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
                placeholder="What are you working on?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Today's Sessions */}
        {!lockIn && todaySessions.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Today&apos;s Sessions</h2>
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm">
                  <span className="text-[var(--text)]">{s.notes || "—"}</span>
                  <div className="flex items-center gap-3 text-[var(--muted)]">
                    <span>{s.tag}</span>
                    <span className="font-mono text-[var(--text)]">{s.durationMins}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
