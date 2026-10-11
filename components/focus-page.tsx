"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import { useAppActive } from "@/lib/activity";
import { PageHeading } from "./ui/page-heading";
import { remainingFocusSeconds, elapsedFocusMinutes } from "@/lib/focus-clock";
import { useBase } from "@/lib/hooks";
import { uid, getToday, formatTime } from "@/lib/utils";
import { TASK_TAGS, taskTagLabel, type TaskTag } from "@/lib/store";
import { Play, Pause, RotateCcw, Maximize2, Minimize2, Timer, Clock3, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { label: "Pomodoro", mins: 25 },
  { label: "Flow", mins: 50 },
  { label: "Deep", mins: 90 },
];

const TAGS = TASK_TAGS;

export function FocusPage() {
  const { data, mutate } = useBase();
  const active=useAppActive();
  const [modeIdx, setModeIdx] = useState(0);
  const [seconds, setSeconds] = useState(MODES[0].mins * 60);
  const [running, setRunning] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [tag, setTag] = useState<TaskTag>("work");
  const [notes, setNotes] = useState("");
  const deadline = useRef<number | null>(null);
  const completed = useRef(false);
  const [sessionStarted,setSessionStarted] = useState(false);

  const totalSecs = MODES[modeIdx].mins * 60;
  const progress = ((totalSecs - seconds) / totalSecs) * 100;

  const finish = useEffectEvent(() => {
    if (completed.current) return;
    completed.current=true;
    setRunning(false);setSeconds(0);deadline.current=null;setSessionStarted(false);
    logSession(MODES[modeIdx].mins);
    window.dispatchEvent(new Event("base:focus-complete"));
    void new Audio("/chime.mp3").play().catch(()=>{});
  });
  useEffect(() => {
    if (!running || deadline.current===null) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    let completion: ReturnType<typeof setTimeout>;
    const update = () => {
      const left=remainingFocusSeconds(deadline.current ?? Date.now(),Date.now());
      if(left===0) { finish(); return; }
      if(active&&!document.hidden)setSeconds(left);
    };
    const scheduleCompletion = () => {
      const left=remainingFocusSeconds(deadline.current ?? Date.now(),Date.now());
      if(!left){finish();return;}
      completion=setTimeout(scheduleCompletion,left*1000);
    };
    const visibility = () => {
      if(interval)clearInterval(interval);
      update();
      if(active&&!document.hidden)interval=setInterval(update,1000);
    };
    visibility();scheduleCompletion();
    document.addEventListener("visibilitychange",visibility);
    return () => { if(interval)clearInterval(interval);clearTimeout(completion);document.removeEventListener("visibilitychange",visibility); };
  }, [running,active]);

  function start() {
    if(seconds===0)return;
    deadline.current=Date.now()+seconds*1000;completed.current=false;setSessionStarted(true);
    setRunning(true);
  }

  function pause() {
    if(deadline.current!==null)setSeconds(remainingFocusSeconds(deadline.current,Date.now()));
    deadline.current=null;
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setSeconds(MODES[modeIdx].mins * 60);
    deadline.current=null;setSessionStarted(false);
  }

  function selectMode(idx: number) {
    setRunning(false);
    setModeIdx(idx);
    setSeconds(MODES[idx].mins * 60);
    deadline.current=null;setSessionStarted(false);
  }

  function logSession(durationMins: number) {
    mutate((d) => ({
      ...d,
      focusSessions: [
        ...d.focusSessions,
        { id: uid(), durationMins, tag, notes, date: getToday(data.profile?.timezone) },
      ],
    }));
  }

  function logManual() {
    const left=running&&deadline.current!==null?remainingFocusSeconds(deadline.current,Date.now()):seconds;
    const elapsed = sessionStarted ? elapsedFocusMinutes(totalSecs,left) : MODES[modeIdx].mins;
    logSession(elapsed);
    reset();
    setNotes("");
  }

  const circumference = 2 * Math.PI * 110;
  const dash = circumference * (1 - progress / 100);

  const todaySessions = data.focusSessions.filter((s) => s.date === getToday(data.profile?.timezone));
  const todayMins = todaySessions.reduce((s, f) => s + f.durationMins, 0);

  const recentSessions=[...data.focusSessions].reverse().slice(0,20);
  return <div className={cn("base-page focus-page",immersive&&"base-focus-immersive")}>
    {!immersive&&<PageHeading title="Focus" description="Give one thing your full attention."><button aria-label="Enter distraction-free focus" onClick={()=>setImmersive(true)} className="base-button base-button-secondary"><Maximize2 className="h-4 w-4"/> Full screen</button></PageHeading>}
    {immersive&&<button onClick={()=>setImmersive(false)} aria-label="Leave distraction-free focus" className="base-focus-exit base-icon-button"><Minimize2 className="h-5 w-5"/></button>}
    {!immersive&&<div className="base-focus-stats">
      <div><span><Clock3 className="h-4 w-4"/> Focused today</span><strong>{todayMins}<small> min</small></strong></div>
      <div><span><CheckCircle2 className="h-4 w-4"/> Sessions completed</span><strong>{todaySessions.length}</strong></div>
      <div><span><Timer className="h-4 w-4"/> Next session</span><strong>{MODES[modeIdx].mins}<small> min · {MODES[modeIdx].label}</small></strong></div>
    </div>}
    <div className="base-focus-workspace">
      <section className="base-focus-timer">
        {!immersive&&<div className="base-focus-modes" role="group" aria-label="Focus duration">{MODES.map((mode,index)=><button key={mode.label} aria-pressed={modeIdx===index} onClick={()=>selectMode(index)}><span>{mode.label}</span><small>{mode.mins} min</small></button>)}</div>}
        <div className="base-focus-clock"><svg aria-hidden="true" className="-rotate-90" viewBox="0 0 256 256"><circle cx="128" cy="128" r="110" fill="none" stroke="var(--border)" strokeWidth="3"/><circle cx="128" cy="128" r="110" fill="none" stroke="var(--action)" strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dash}/></svg><div><p className="base-eyebrow">{running?"In progress":sessionStarted?"Paused":"Ready when you are"}</p><p className="base-focus-time" role="timer" aria-label="Time remaining">{formatTime(seconds)}</p><p className="text-sm text-[var(--muted)]">{MODES[modeIdx].label} session</p></div></div>
        <div className="base-focus-controls"><button onClick={reset} aria-label="Reset timer" className="base-icon-button"><RotateCcw className="h-4 w-4"/></button><button onClick={running?pause:start} disabled={!running&&seconds===0} className="base-button base-button-primary">{running?<><Pause className="h-4 w-4"/> Pause session</>:<><Play className="h-4 w-4"/> {sessionStarted?"Resume session":"Start session"}</>}</button>{sessionStarted&&!running&&<button onClick={logManual} className="base-button base-button-secondary">Log session</button>}</div>
        {!immersive&&<p className="base-focus-caption">A little space between you and the noise.</p>}
      </section>
      {!immersive&&<aside className="base-focus-context"><p className="base-eyebrow">Your intention</p><h2>What matters right now?</h2><p className="text-sm text-[var(--muted)]">Set a direction for this session. Everything else can wait.</p><label htmlFor="focus-intention">Session notes</label><textarea id="focus-intention" rows={4} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="One thing I want to move forward…"/><p className="mt-5 mb-2 text-xs font-medium">Context</p><div className="flex flex-wrap gap-2">{TAGS.map(item=><button key={item.value} aria-pressed={tag===item.value} onClick={()=>setTag(item.value)} className={cn("base-focus-tag",tag===item.value&&"base-focus-tag-active")}>{item.label}</button>)}</div><div className="base-focus-tip"><p className="text-xs font-medium">Make room for deep work</p><p className="mt-1 text-xs text-[var(--muted)]">Close what you don’t need. Pick a small finish line. Take a break when the timer ends.</p></div></aside>}
    </div>
    {!immersive&&<section className="base-focus-history"><div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-sm font-semibold">Recent sessions</h2><span className="text-xs text-[var(--muted)]">{data.focusSessions.length} total</span></div>{!recentSessions.length?<div className="base-empty"><Timer className="mx-auto mb-3 h-6 w-6"/><h2>Your first session starts here.</h2><p>Completed sessions will appear in your history.</p></div>:<div>{recentSessions.map(session=><div key={session.id} className="base-focus-history-row"><span className="base-focus-history-icon"><CheckCircle2 className="h-4 w-4"/></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] font-medium">{session.notes||`${taskTagLabel(session.tag)} session`}</strong><small className="text-[var(--muted)]">{session.date} · {taskTagLabel(session.tag)}</small></span><span className="text-sm tabular-nums">{session.durationMins}<small className="text-[var(--muted)]"> min</small></span></div>)}</div>}</section>}
  </div>;
}
