"use client";

import { useState, useMemo, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import type { Course, CourseModule, CourseLesson, CourseLevel, QuizQuestion } from "@/lib/store";
import { CHAT_MODELS, DEFAULT_CHAT_SETTINGS, modelLabel, localProviderOf, type ChatModel } from "@/lib/chat-models";
import { discoverOllama, discoverBridge, streamOllama, streamBridge, type LocalModel } from "@/lib/local-chat";
import { buildLearnPrompt, extractCourseJson, normalizeCourse, type Level } from "@/lib/learn-gen";
import { mdToHtml } from "@/lib/markdown";
import {
  GraduationCap, Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft, Check, Sparkles, Loader2,
  PanelLeft, PanelLeftClose, BookOpen, Link2, Trophy, RotateCcw, CircleCheck, Circle, X,
  ArrowLeft, ArrowRight, Gamepad2, Maximize2, Wand2,
} from "lucide-react";

const LEVELS: CourseLevel[] = ["beginner", "intermediate", "advanced"];
const LEARN_MODELS = CHAT_MODELS.filter((m) => m.provider === "gemini" || m.provider === "perplexity");
const DEFAULT_LEARN_MODEL = "perplexity/sonar";

const SUGGESTIONS: { cat: string; items: { emoji: string; topic: string; blurb: string }[] }[] = [
  { cat: "Games & strategy", items: [
    { emoji: "🃏", topic: "Poker strategy", blurb: "Ranges, pot odds, GTO, bankroll" },
    { emoji: "♟️", topic: "Chess tactics & openings", blurb: "Principles, tactics, endgames" },
    { emoji: "🎲", topic: "Blackjack & card counting", blurb: "Basic strategy, counting, edge" },
    { emoji: "🀄", topic: "Backgammon", blurb: "Pip count, doubling, equity" },
  ] },
  { cat: "Money", items: [
    { emoji: "📈", topic: "Options trading", blurb: "Greeks, spreads, risk" },
    { emoji: "₿", topic: "Crypto & DeFi", blurb: "Wallets, chains, yield, risk" },
    { emoji: "💰", topic: "Investing & index funds", blurb: "Budgeting, compounding, tax" },
  ] },
  { cat: "Tech", items: [
    { emoji: "🦀", topic: "Rust programming", blurb: "Ownership, borrowing, async" },
    { emoji: "🧠", topic: "Machine learning", blurb: "Models, training, evaluation" },
    { emoji: "🏗️", topic: "System design", blurb: "Scaling, caching, databases" },
    { emoji: "🗄️", topic: "SQL & databases", blurb: "Joins, indexes, tuning" },
  ] },
  { cat: "Mind & life", items: [
    { emoji: "🤝", topic: "Negotiation", blurb: "Leverage, anchoring, tactics" },
    { emoji: "🎤", topic: "Public speaking", blurb: "Structure, delivery, nerves" },
    { emoji: "🏛️", topic: "Stoicism", blurb: "Principles and daily practice" },
    { emoji: "🥗", topic: "Nutrition science", blurb: "Macros, energy, myths" },
  ] },
  { cat: "Creative", items: [
    { emoji: "🎼", topic: "Music theory", blurb: "Scales, chords, progressions" },
    { emoji: "📷", topic: "Photography", blurb: "Exposure, composition, light" },
    { emoji: "✍️", topic: "Screenwriting", blurb: "Structure, character, dialogue" },
  ] },
];

type Suggestion = { emoji: string; topic: string; blurb: string };
const ALL_SUGGESTIONS: Suggestion[] = SUGGESTIONS.flatMap((g) => g.items);
const ROW_TOP = ALL_SUGGESTIONS.filter((_, i) => i % 2 === 0);
const ROW_BOTTOM = ALL_SUGGESTIONS.filter((_, i) => i % 2 === 1);

function MarqueeRow({ items, reverse, onPick }: { items: Suggestion[]; reverse?: boolean; onPick: (s: Suggestion) => void }) {
  return (
    <div className="nx-marquee-row overflow-hidden">
      <div className={cn("nx-marquee py-1", reverse && "nx-marquee-rev")}>
        {[...items, ...items].map((s, i) => (
          <button key={i} onClick={() => onPick(s)} className="shrink-0 w-52 mr-3 text-left bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-3.5 hover:border-[var(--border-2)] hover:bg-[var(--chip)] transition-colors">
            <span className="text-2xl">{s.emoji}</span>
            <span className="block text-[14px] font-semibold text-[var(--text)] mt-2 leading-tight">{s.topic}</span>
            <span className="block text-[12px] text-[var(--faint)] mt-1 leading-snug">{s.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const progressOf = (c: Course) => {
  const lessons = c.modules.flatMap((m) => m.lessons);
  const done = lessons.filter((l) => l.done).length;
  return { done, total: lessons.length, pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0 };
};
const flatLessons = (c: Course) => c.modules.flatMap((m) => m.lessons.map((l) => ({ moduleId: m.id, lesson: l })));

export function LearnPage() {
  const { data, mutate } = useBridge();
  const courses = useMemo(() => [...(data.courses ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.courses]);

  const chatSettings = data.chatSettings ?? DEFAULT_CHAT_SETTINGS;

  // discover local Ollama / bridge models running on the user's machine
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [oll, br] = await Promise.all([discoverOllama(chatSettings.ollamaUrl), discoverBridge(chatSettings.bridgeUrl, chatSettings.bridgeToken)]);
      if (alive) setLocalModels([...oll, ...br]);
    })();
    return () => { alive = false; };
  }, [chatSettings.ollamaUrl, chatSettings.bridgeUrl, chatSettings.bridgeToken]);

  // Only models enabled in Settings show in the picker; local models always appear.
  const enabledSet = useMemo(() => new Set(chatSettings.enabledModelIds), [chatSettings.enabledModelIds]);
  const learnModels = useMemo(() => {
    const cloud = LEARN_MODELS.filter((m) => enabledSet.has(m.id));
    const base = cloud.length ? cloud : LEARN_MODELS;
    const locals: ChatModel[] = localModels.map((m) => ({ id: m.id, label: m.label, provider: m.provider, enabled: true, note: m.note }));
    return [...base, ...locals];
  }, [enabledSet, localModels]);
  const defaultLearnModel = learnModels.find((m) => m.provider === "perplexity")?.id || learnModels[0]?.id || DEFAULT_LEARN_MODEL;

  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // new-course flow
  const [configuring, setConfiguring] = useState<{ topic: string; specifics: string } | null>(null);
  const [level, setLevel] = useState<CourseLevel>("beginner");
  const [model, setModel] = useState(defaultLearnModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // interactive generation
  const [genFor, setGenFor] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<{ html: string; title: string } | null>(null);

  const active = courses.find((c) => c.id === activeCourseId) ?? null;
  const activeLesson = active && activeLessonId ? active.modules.flatMap((m) => m.lessons).find((l) => l.id === activeLessonId) ?? null : null;
  const activeModuleId = active && activeLessonId ? active.modules.find((m) => m.lessons.some((l) => l.id === activeLessonId))?.id ?? null : null;

  const patch = (id: string, fn: (c: Course) => Course) => mutate((d) => ({ ...d, courses: (d.courses ?? []).map((c) => (c.id === id ? fn(c) : c)) }));
  const remove = (id: string) => { mutate((d) => ({ ...d, courses: (d.courses ?? []).filter((c) => c.id !== id) })); if (activeCourseId === id) { setActiveCourseId(null); setActiveLessonId(null); } };
  const openCourse = (id: string) => { setActiveCourseId(id); setActiveLessonId(null); setConfiguring(null); setSidebarOpen(false); };
  const backToCourses = () => { setActiveCourseId(null); setActiveLessonId(null); };
  const newCourse = () => { setActiveCourseId(null); setActiveLessonId(null); setConfiguring(null); setError(""); setSidebarOpen(false); };
  const selectLesson = (lid: string) => { setActiveLessonId(lid); setSidebarOpen(false); };

  async function generate() {
    if (!configuring || !configuring.topic.trim() || busy) return;
    const topic = configuring.topic.trim();
    const specifics = configuring.specifics.trim();
    setBusy(true); setError("");
    try {
      const local = localProviderOf(model);
      let overview = "", modules: CourseModule[] = [], sources: string[] = [];

      if (local) {
        // Local models can't be reached by the server — generate in the browser.
        // First give the model web access via Perplexity (server-side search).
        let webContext = "";
        try {
          const wr = await fetch("/api/websearch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: `${topic}${specifics ? " — " + specifics : ""}: key concepts, current best practices and facts for building a course` }) });
          const wj = await wr.json();
          if (wj.ok && wj.text) { webContext = wj.text; sources = Array.isArray(wj.sources) ? wj.sources : []; }
        } catch { /* no key / offline → generate from the model's own knowledge */ }

        const prompt = buildLearnPrompt(topic, specifics, level as Level, webContext);
        let acc = "";
        const onDelta = (t: string) => { acc += t; };
        const ctrl = new AbortController();
        const msgs = [{ role: "user" as const, content: prompt }];
        if (local === "ollama") await streamOllama(chatSettings.ollamaUrl || "http://localhost:11434", model, msgs, "", onDelta, ctrl.signal, { format: "json", think: false });
        else await streamBridge(chatSettings.bridgeUrl || "", model, msgs, "", onDelta, ctrl.signal, chatSettings.bridgeToken);

        const parsed = extractCourseJson(acc);
        if (!parsed) { setError("The local model didn't return a usable course (it needs to output clean JSON). Try again or use a larger local model / a cloud model."); setBusy(false); return; }
        const norm = normalizeCourse(parsed);
        overview = norm.overview; modules = norm.modules as CourseModule[];
        if (modules.length === 0) { setError("The generated course had no lessons. Try again."); setBusy(false); return; }
      } else {
        const res = await fetch("/api/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, specifics, level, model }) });
        const j = await res.json();
        if (!j.ok) { setError(j.error || "Couldn't generate the course."); setBusy(false); return; }
        overview = j.overview || ""; modules = j.modules as CourseModule[]; sources = j.sources || [];
      }

      const now = new Date().toISOString();
      const course: Course = { id: uid(), topic, specifics: specifics || undefined, level, overview, modules, sources, model, status: "ready", createdAt: now, updatedAt: now };
      mutate((d) => ({ ...d, courses: [course, ...(d.courses ?? [])] }));
      openCourse(course.id); setConfiguring(null);
    } catch (e) { setError(String((e as Error).message || e)); }
    setBusy(false);
  }

  async function generateInteractive(course: Course, moduleId: string, lesson: CourseLesson) {
    setGenFor(lesson.id); setError("");
    try {
      // Interactive widgets are built server-side; local models aren't reachable there,
      // so fall back to a fast cloud model when the course was made with a local one.
      const genModel = localProviderOf(course.model) ? "gemini-2.5-flash" : course.model;
      const res = await fetch("/api/learn/interactive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: course.topic, lessonTitle: lesson.title, lessonContent: lesson.content, idea: lesson.interactiveIdea, model: genModel }) });
      const j = await res.json();
      if (j.ok) patch(course.id, (c) => ({ ...c, updatedAt: new Date().toISOString(), modules: c.modules.map((m) => m.id !== moduleId ? m : { ...m, lessons: m.lessons.map((l) => l.id === lesson.id ? { ...l, interactive: j.html, interactiveTitle: j.title } : l) }) }));
      else setError(j.error || "Couldn't build the interactive.");
    } catch (e) { setError(String((e as Error).message || e)); }
    setGenFor(null);
  }

  const toggleLesson = (mid: string, lid: string) => patch(active!.id, (c) => ({ ...c, updatedAt: new Date().toISOString(), modules: c.modules.map((m) => m.id !== mid ? m : { ...m, lessons: m.lessons.map((l) => l.id === lid ? { ...l, done: !l.done } : l) }) }));
  const answerQuiz = (mid: string, lid: string, qid: string, choice: number) => patch(active!.id, (c) => ({ ...c, updatedAt: new Date().toISOString(), modules: c.modules.map((m) => m.id !== mid ? m : { ...m, lessons: m.lessons.map((l) => l.id !== lid ? l : { ...l, quiz: (l.quiz ?? []).map((q) => q.id === qid ? { ...q, chosen: choice } : q) }) }) }));

  // prev/next
  const flat = active ? flatLessons(active) : [];
  const idx = flat.findIndex((x) => x.lesson.id === activeLessonId);
  const goto = (d: number) => { const n = flat[idx + d]; if (n) setActiveLessonId(n.lesson.id); };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-[var(--bg)] relative">
      {sidebarOpen && <div className="md:hidden fixed inset-0 top-14 z-40 bg-black/40 backdrop-blur-[2px] nx-fade" onClick={() => setSidebarOpen(false)} />}

      {collapsed && (
        <div className="hidden md:flex flex-col items-center gap-1 w-12 shrink-0 border-r border-[var(--border)] py-2">
          <button onClick={() => setCollapsed(false)} title="Expand" className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><PanelLeft className="w-4 h-4" /></button>
          <button onClick={newCourse} title="New course" className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><Plus className="w-4 h-4" /></button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={cn(
        "border-r border-[var(--border)] flex-col bg-[var(--bg)] w-72 shrink-0",
        collapsed ? "flex md:hidden" : "flex",
        "max-md:fixed max-md:top-14 max-md:bottom-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl transition-transform duration-200 ease-out",
        sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
      )}>
        <div className="flex items-center gap-1.5 h-12 px-2.5 shrink-0 border-b border-[var(--border)]">
          {active ? (
            <button onClick={backToCourses} className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-[13px] font-semibold text-[var(--text)] px-1 py-1 rounded-md hover:bg-[var(--chip)]"><ChevronLeft className="w-4 h-4 shrink-0 text-[var(--muted)]" /><span className="truncate">{active.topic}</span></button>
          ) : (
            <span className="flex items-center gap-2 flex-1 text-sm font-semibold text-[var(--text)] px-1"><GraduationCap className="w-4 h-4" /> Learning</span>
          )}
          <button onClick={newCourse} title="New course" className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><Plus className="w-4 h-4" /></button>
          <button onClick={() => setCollapsed(true)} title="Collapse" className="hidden md:flex p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><PanelLeftClose className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {active ? (
            <>
              <button onClick={() => setActiveLessonId(null)} className={cn("w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-left transition-colors", !activeLessonId ? "bg-[var(--chip)] text-[var(--text)] font-medium" : "text-[var(--muted)] hover:bg-[var(--surface-2)]")}><BookOpen className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /> Overview</button>
              {active.modules.map((m, i) => <SidebarModule key={m.id} module={m} index={i} activeLessonId={activeLessonId} openByDefault={i === 0 || m.id === activeModuleId} onSelect={selectLesson} />)}
            </>
          ) : courses.length === 0 ? (
            <p className="px-2 py-3 text-[12.5px] text-[var(--faint)]">No courses yet. Pick a topic to generate one.</p>
          ) : courses.map((c) => {
            const p = progressOf(c);
            return (
              <div key={c.id} className="group flex items-center gap-1 rounded-md pr-1 text-[var(--muted)] hover:bg-[var(--surface-2)]">
                <button onClick={() => openCourse(c.id)} className="flex-1 py-2 px-2 min-w-0 text-left">
                  <span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /><span className="truncate text-[13px] font-medium text-[var(--text)]">{c.topic}</span></span>
                  <span className="flex items-center gap-1.5 mt-1 pl-[22px]"><span className="flex-1 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden"><span className="block h-full bg-[var(--text)]" style={{ width: `${p.pct}%` }} /></span><span className="text-[10px] text-[var(--faint)] tabular-nums">{p.pct}%</span></span>
                </button>
                <button onClick={() => remove(c.id)} title="Delete" className="p-1 rounded text-[var(--faint)] hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 h-12 px-3 sm:px-4 shrink-0 border-b border-[var(--border)]">
          <button onClick={() => setSidebarOpen(true)} title="Menu" className="md:hidden p-1.5 -ml-1 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"><PanelLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-[var(--text)] truncate">{active ? (activeLesson ? activeLesson.title : active.topic) : "New course"}</span>
          {active && <span className="ml-auto text-[11px] text-[var(--faint)] capitalize hidden sm:block">{active.level} · {modelLabel(active.model)}</span>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!active ? (
            <NewCourseScreen {...{ configuring, setConfiguring, level, setLevel, model, setModel, busy, error, generate, models: learnModels }} />
          ) : activeLesson ? (
            <LessonPlayer course={active} moduleId={activeModuleId!} lesson={activeLesson} pos={idx + 1} total={flat.length}
              onToggle={() => toggleLesson(activeModuleId!, activeLesson.id)}
              onAnswer={(qid, ch) => answerQuiz(activeModuleId!, activeLesson.id, qid, ch)}
              onPrev={idx > 0 ? () => goto(-1) : undefined} onNext={idx < flat.length - 1 ? () => goto(1) : undefined}
              genInteractive={() => generateInteractive(active, activeModuleId!, activeLesson)} generating={genFor === activeLesson.id}
              onFullscreen={() => activeLesson.interactive && setFullscreen({ html: activeLesson.interactive, title: activeLesson.interactiveTitle || "Interactive" })} error={error} />
          ) : (
            <CourseOverview course={active} onStart={() => { const f = flat[0]; if (f) setActiveLessonId(f.lesson.id); }} onDelete={() => remove(active.id)} onReset={() => patch(active.id, resetProgress)} progress={progressOf(active)} />
          )}
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8" onClick={() => setFullscreen(null)}>
          <div className="w-full max-w-5xl h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><span className="flex items-center gap-2 text-sm font-semibold text-white"><Gamepad2 className="w-4 h-4" /> {fullscreen.title}</span><button onClick={() => setFullscreen(null)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button></div>
            <iframe sandbox="allow-scripts allow-pointer-lock" srcDoc={fullscreen.html} title={fullscreen.title} className="flex-1 w-full rounded-xl border border-white/15 bg-[#0f0f12]" />
          </div>
        </div>
      )}
    </div>
  );
}

function resetProgress(c: Course): Course {
  return { ...c, updatedAt: new Date().toISOString(), modules: c.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, done: false, quiz: (l.quiz ?? []).map((q) => ({ ...q, chosen: undefined })) })) })) };
}

// ── sidebar module group ────────────────────────────────────────────────────────
function SidebarModule({ module, index, activeLessonId, openByDefault, onSelect }: { module: CourseModule; index: number; activeLessonId: string | null; openByDefault: boolean; onSelect: (lid: string) => void }) {
  const [open, setOpen] = useState(openByDefault);
  const done = module.lessons.filter((l) => l.done).length;
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)]">
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" />}
        <span className="flex items-center justify-center w-5 h-5 rounded bg-[var(--chip)] text-[10px] font-bold text-[var(--text)] shrink-0">{index + 1}</span>
        <span className="flex-1 truncate text-[12.5px] font-medium text-left text-[var(--text)]">{module.title}</span>
        <span className="text-[10px] text-[var(--faint)] tabular-nums">{done}/{module.lessons.length}</span>
      </button>
      {open && <div className="ml-3 pl-2 border-l border-[var(--border)]">{module.lessons.map((l) => (
        <button key={l.id} onClick={() => onSelect(l.id)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-left transition-colors", l.id === activeLessonId ? "bg-[var(--chip)] text-[var(--text)] font-medium" : "text-[var(--muted)] hover:bg-[var(--surface-2)]")}>
          {l.done ? <CircleCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" /> : <Circle className="w-3.5 h-3.5 shrink-0 text-[var(--faint)]" />}
          <span className="truncate">{l.title}</span>
        </button>
      ))}</div>}
    </div>
  );
}

// ── new course screen (custom input + suggestion carousel + config) ─────────────────
function NewCourseScreen({ configuring, setConfiguring, level, setLevel, model, setModel, busy, error, generate, models }: {
  configuring: { topic: string; specifics: string } | null; setConfiguring: (v: { topic: string; specifics: string } | null) => void;
  level: CourseLevel; setLevel: (v: CourseLevel) => void; model: string; setModel: (v: string) => void; busy: boolean; error: string; generate: () => void; models: ChatModel[];
}) {
  const [custom, setCustom] = useState("");
  if (configuring) return <ConfigPanel configuring={configuring} setConfiguring={setConfiguring} level={level} setLevel={setLevel} model={model} setModel={setModel} busy={busy} error={error} generate={generate} models={models} />;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="text-center mb-7">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--chip)] border border-[var(--border)] mx-auto mb-4"><GraduationCap className="w-6 h-6 text-[var(--text)]" strokeWidth={1.8} /></span>
        <h1 className="text-xl font-bold text-[var(--text)] tracking-tight">What do you want to learn?</h1>
        <p className="text-sm text-[var(--faint)] mt-1">Type any topic or pick a suggestion — the AI researches it into an interactive course.</p>
      </div>

      <div className="flex gap-2 max-w-xl mx-auto mb-8">
        <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) setConfiguring({ topic: custom.trim(), specifics: "" }); }} placeholder="e.g. Poker strategy, Rust, Renaissance art…" className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" />
        <button onClick={() => custom.trim() && setConfiguring({ topic: custom.trim(), specifics: "" })} disabled={!custom.trim()} className="px-4 py-2.5 bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-40 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"><ArrowRight className="w-4 h-4" /></button>
      </div>

      <div className="space-y-3 -mx-4 sm:-mx-6">
        <MarqueeRow items={ROW_TOP} reverse onPick={(s) => setConfiguring({ topic: s.topic, specifics: "" })} />
        <MarqueeRow items={ROW_BOTTOM} onPick={(s) => setConfiguring({ topic: s.topic, specifics: "" })} />
      </div>
    </div>
  );
}

function ConfigPanel({ configuring, setConfiguring, level, setLevel, model, setModel, busy, error, generate, models }: {
  configuring: { topic: string; specifics: string }; setConfiguring: (v: { topic: string; specifics: string } | null) => void;
  level: CourseLevel; setLevel: (v: CourseLevel) => void; model: string; setModel: (v: string) => void; busy: boolean; error: string; generate: () => void; models: ChatModel[];
}) {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => !busy && setConfiguring(null)} className="flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)] mb-5"><ArrowLeft className="w-4 h-4" /> Back to suggestions</button>
      <h1 className="text-lg font-bold text-[var(--text)] tracking-tight mb-4">Configure your course</h1>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold mb-1.5 block">Topic</label>
          <input value={configuring.topic} onChange={(e) => setConfiguring({ ...configuring, topic: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" />
        </div>
        <div>
          <label className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold mb-1.5 block">Specifics <span className="normal-case tracking-normal">(optional)</span></label>
          <textarea value={configuring.specifics} onChange={(e) => setConfiguring({ ...configuring, specifics: e.target.value })} rows={2} placeholder="Focus, goals, what you already know…" className="w-full resize-none bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-[14px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" />
        </div>
        <div>
          <label className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold mb-1.5 block">Difficulty</label>
          <div className="flex gap-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-1">
            {LEVELS.map((lv) => <button key={lv} onClick={() => setLevel(lv)} className={cn("flex-1 py-1.5 rounded-lg text-[12.5px] font-medium capitalize transition-colors", level === lv ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}>{lv}</button>)}
          </div>
        </div>
        <div>
          <label className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold mb-1.5 block">Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-[13.5px] text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]">
            {models.filter((m) => m.provider !== "ollama" && m.provider !== "bridge").map((m) => <option key={m.id} value={m.id}>{m.label}{m.note ? ` — ${m.note}` : ""}</option>)}
            {models.some((m) => m.provider === "ollama" || m.provider === "bridge") && (
              <optgroup label="On your machine">
                {models.filter((m) => m.provider === "ollama" || m.provider === "bridge").map((m) => <option key={m.id} value={m.id}>{m.label}{m.note ? ` — ${m.note}` : ""}</option>)}
              </optgroup>
            )}
          </select>
          <p className="text-[11px] text-[var(--faint)] mt-1">Sonar / Perplexity do live web research. Gemini is fast &amp; free. Local models run on your machine and get web access via Perplexity.</p>
        </div>
        {error && <p className="text-[13px] text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={generate} disabled={busy || !configuring.topic.trim()} className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-40 rounded-xl text-sm font-semibold transition-colors">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Researching &amp; building…</> : <><Sparkles className="w-4 h-4" /> Generate course</>}
        </button>
        {busy && <p className="text-center text-[12px] text-[var(--faint)]">{localProviderOf(model) ? "Local models run on your machine — this can take a few minutes." : "This can take up to a minute."}</p>}
      </div>
    </div>
  );
}

// ── course overview ─────────────────────────────────────────────────────────────────
function CourseOverview({ course, onStart, onDelete, onReset, progress }: { course: Course; onStart: () => void; onDelete: () => void; onReset: () => void; progress: { done: number; total: number; pct: number } }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]">{progress.pct === 100 ? <Trophy className="w-4 h-4 text-amber-500" /> : <GraduationCap className="w-4 h-4 text-[var(--muted)]" />} {progress.done}/{progress.total} lessons · {progress.pct}%</span>
          <div className="flex items-center gap-3">
            <button onClick={onReset} className="flex items-center gap-1 text-[11.5px] text-[var(--faint)] hover:text-[var(--text)]"><RotateCcw className="w-3 h-3" /> Reset</button>
            <button onClick={onDelete} className="flex items-center gap-1 text-[11.5px] text-[var(--faint)] hover:text-red-500"><Trash2 className="w-3 h-3" /> Delete</button>
          </div>
        </div>
        <div className="h-2 rounded-full bg-[var(--bg)] overflow-hidden"><div className="h-full bg-[var(--text)] transition-all duration-500" style={{ width: `${progress.pct}%` }} /></div>
      </div>
      {course.overview && <div className="nx-md text-[var(--text)]" dangerouslySetInnerHTML={{ __html: mdToHtml(course.overview) }} />}
      <button onClick={onStart} className="flex items-center gap-2 px-4 py-2.5 bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] rounded-xl text-sm font-semibold transition-colors">{progress.done > 0 ? "Continue" : "Start course"} <ArrowRight className="w-4 h-4" /></button>
      <div className="space-y-2">
        {course.modules.map((m, i) => (
          <div key={m.id} className="border border-[var(--border)] rounded-xl px-4 py-3">
            <p className="text-[13.5px] font-semibold text-[var(--text)]"><span className="text-[var(--faint)]">{i + 1}.</span> {m.title}</p>
            {m.summary && <p className="text-[12px] text-[var(--faint)] mt-0.5">{m.summary}</p>}
            <p className="text-[11px] text-[var(--faint)] mt-1">{m.lessons.length} lessons</p>
          </div>
        ))}
      </div>
      {course.sources && course.sources.length > 0 && <SourcesList urls={course.sources} />}
    </div>
  );
}

// ── lesson player ───────────────────────────────────────────────────────────────────
function LessonPlayer({ course, lesson, pos, total, onToggle, onAnswer, onPrev, onNext, genInteractive, generating, onFullscreen, error }: {
  course: Course; moduleId: string; lesson: CourseLesson; pos: number; total: number;
  onToggle: () => void; onAnswer: (qid: string, ch: number) => void; onPrev?: () => void; onNext?: () => void;
  genInteractive: () => void; generating: boolean; onFullscreen: () => void; error: string;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-[var(--faint)] uppercase tracking-widest">Lesson {pos} of {total}</span>
        <button onClick={onToggle} className={cn("flex items-center gap-1.5 text-[12.5px] font-medium rounded-lg px-2.5 py-1 transition-colors", lesson.done ? "text-emerald-500 bg-emerald-500/10" : "text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]")}>{lesson.done ? <><CircleCheck className="w-3.5 h-3.5" /> Completed</> : <><Circle className="w-3.5 h-3.5" /> Mark complete</>}</button>
      </div>
      <h1 className="text-xl font-bold text-[var(--text)] tracking-tight">{lesson.title}</h1>
      {lesson.content && <div className="nx-md" dangerouslySetInnerHTML={{ __html: mdToHtml(lesson.content) }} />}

      {lesson.keyPoints && lesson.keyPoints.length > 0 && (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3.5">
          <p className="text-[10px] font-semibold text-[var(--faint)] uppercase tracking-widest mb-2">Key points</p>
          <ul className="space-y-1.5">{lesson.keyPoints.map((k, i) => <li key={i} className="flex gap-2 text-[13.5px] text-[var(--text)]"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-1" /> {k}</li>)}</ul>
        </div>
      )}

      {/* Interactive artifact */}
      <div>
        {lesson.interactive ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text)]"><Gamepad2 className="w-4 h-4 text-[var(--muted)]" /> {lesson.interactiveTitle || "Interactive practice"}</span>
              <div className="flex items-center gap-2">
                <button onClick={onFullscreen} title="Fullscreen" className="p-1 rounded text-[var(--faint)] hover:text-[var(--text)]"><Maximize2 className="w-3.5 h-3.5" /></button>
                <button onClick={genInteractive} disabled={generating} className="flex items-center gap-1 text-[11.5px] text-[var(--faint)] hover:text-[var(--text)] disabled:opacity-50"><RotateCcw className={cn("w-3 h-3", generating && "animate-spin")} /> Regenerate</button>
              </div>
            </div>
            <iframe sandbox="allow-scripts allow-pointer-lock" srcDoc={lesson.interactive} title={lesson.interactiveTitle || "Interactive"} className="w-full h-[460px] rounded-xl border border-[var(--border)] bg-[#0f0f12]" />
          </div>
        ) : (
          <button onClick={genInteractive} disabled={generating} className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[var(--border-2)] rounded-xl text-[13px] font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-60 transition-colors">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Building an interactive…</> : <><Wand2 className="w-4 h-4" /> {lesson.interactiveIdea ? `Try it: ${lesson.interactiveIdea}` : "Generate interactive practice"}</>}
          </button>
        )}
        {error && generating === false && <p className="text-[12px] text-red-500 mt-2">{error}</p>}
      </div>

      {lesson.quiz && lesson.quiz.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-[var(--faint)] uppercase tracking-widest">Check yourself</p>
          {lesson.quiz.map((q) => <QuizView key={q.id} q={q} onAnswer={(ch) => onAnswer(q.id, ch)} />)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
        <button onClick={onPrev} disabled={!onPrev} className="flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed"><ArrowLeft className="w-4 h-4" /> Previous</button>
        {!lesson.done ? <button onClick={() => { onToggle(); onNext?.(); }} className="text-[13px] font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-lg px-4 py-2">Complete{onNext ? " & continue" : ""}</button> : <span className="text-[12px] text-emerald-500 flex items-center gap-1"><Check className="w-4 h-4" /> Done</span>}
        <button onClick={onNext} disabled={!onNext} className="flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed">Next <ArrowRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function QuizView({ q, onAnswer }: { q: QuizQuestion; onAnswer: (choice: number) => void }) {
  const answered = typeof q.chosen === "number";
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3.5">
      <p className="text-[13.5px] font-medium text-[var(--text)] mb-2">{q.q}</p>
      <div className="space-y-1.5">
        {q.options.map((opt, i) => {
          const isChosen = q.chosen === i, isCorrect = i === q.answer, show = answered && (isChosen || isCorrect);
          return (
            <button key={i} onClick={() => onAnswer(i)} className={cn("w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border text-[13px] transition-colors",
              !answered && "border-[var(--border)] hover:bg-[var(--chip)] text-[var(--text)]",
              answered && show && isCorrect && "border-emerald-500/50 bg-emerald-500/10 text-[var(--text)]",
              answered && show && isChosen && !isCorrect && "border-red-500/50 bg-red-500/10 text-[var(--text)]",
              answered && !show && "border-[var(--border)] text-[var(--faint)]")}>
              <span className="flex-1">{opt}</span>
              {answered && isCorrect && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
              {answered && isChosen && !isCorrect && <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            </button>
          );
        })}
      </div>
      {answered && q.explanation && <p className="text-[12px] text-[var(--muted)] mt-2 pl-1">{q.chosen === q.answer ? "✓ Correct. " : "Not quite. "}{q.explanation}</p>}
    </div>
  );
}

function SourcesList({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState(false);
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return (
    <div className="border border-[var(--border)] rounded-2xl p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text)]"><ChevronRight className={cn("w-4 h-4 transition-transform", open && "rotate-90")} /><Link2 className="w-4 h-4" /> Research sources <span className="text-[var(--faint)]">({urls.length})</span></button>
      {open && <div className="mt-2 space-y-1.5 pl-6">{urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener" className="flex items-center gap-2 text-[12.5px] text-[var(--muted)] hover:text-[var(--text)]"><img src={`https://www.google.com/s2/favicons?domain=${host(u)}&sz=32`} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" /><span className="truncate">{host(u)}</span></a>)}</div>}
    </div>
  );
}
