"use client";

import { NoteIcon } from "./note-icon";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { writeStored } from "@/lib/prefs";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, usePathname } from "@/lib/navigation";
import { getData } from "@/lib/store";
import { useTheme } from "@/lib/theme-context";
import { useNavMode } from "@/lib/nav-mode-context";
import { useBase } from "@/lib/hooks";
import {
  FolderKanban, Search, CornerDownLeft, LayoutGrid, LayoutDashboard,
  type LucideIcon, Sun, Moon, PanelBottom, CalendarDays, CheckSquare, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { visiblePages, SETTINGS_PAGE, type NavPage } from "@/lib/nav-config";
import { useQuickActions } from "@/lib/quick-actions";

type Item =
  | { kind: "page"; key: string; label: string; icon: LucideIcon; href: string; keywords?: string }
  | { kind: "action"; key: string; label: string; icon: LucideIcon; keywords?: string; run: () => void }
  | { kind: "wiki"; key: string; label: string; emoji: string; id: string }
  | { kind: "board"; key: string; label: string; id: string }
  | { kind: "task"; key: string; label: string; id: string; keywords?: string }
  | { kind: "project"; key: string; label: string; id: string; keywords?: string };

export function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const { mode, setMode } = useNavMode();
  const { data } = useBase();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId=useId();
  const isMac=useSyncExternalStore(()=>()=>{},()=>/Mac|iPhone|iPad/.test(navigator.platform),()=>false);

  const openPalette = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);

  // Projects, notes pages + vision boards, snapshotted from local data when the palette opens.
  const dyn = useMemo(() => {
    if (!open) return { projects: [] as Item[], wiki: [] as Item[], boards: [] as Item[], tasks: [] as Item[] };
    const d = getData();
    return {
      projects: (d.projects ?? []).map((p): Item => ({ kind: "project", key: `project:${p.id}`, id: p.id, label: p.name || "Untitled project", keywords: `${p.category ?? ""} ${p.status ?? ""} roadmap milestone` })),
      wiki: (d.wikiPages ?? []).filter((p) => !p.deletedAt).map((p): Item => ({ kind: "wiki", key: `wiki:${p.id}`, id: p.id, label: p.title || "Untitled", emoji: p.icon || "📄" })),
      boards: (d.boards ?? []).map((b): Item => ({ kind: "board", key: `board:${b.id}`, id: b.id, label: b.name || "Untitled board" })),
      tasks: d.tasks.map((task): Item=>({kind:"task",key:`task:${task.id}`,id:task.id,label:task.title,keywords:`${task.tag} ${task.dueDate || ""}`})),
    };
  }, [open]);

  const pageItems = useMemo<Item[]>(() => {
    const pages: NavPage[] = [...visiblePages(data.navPrefs), SETTINGS_PAGE];
    return pages.map((p) => ({ kind: "page", key: `page:${p.href}`, label: p.label, icon: p.icon, href: p.href, keywords: p.keywords } as Item));
  }, [data.navPrefs]);

  // Quick actions — commands, not destinations.
  const quick = useQuickActions();
  const actions = useMemo<Item[]>(() => [
    { kind: "action", key: "act:newevent", label: "New event", icon: CalendarDays, keywords: "create add calendar schedule", run: quick.newEvent },
    { kind: "action", key: "act:newtask", label: "New task", icon: CheckSquare, keywords: "create add todo", run: quick.newTask },
    { kind: "action", key: "act:newproject", label: "New project", icon: FolderKanban, keywords: "create add", run: quick.newProject },
    { kind: "action", key: "act:theme", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode", icon: theme === "dark" ? Sun : Moon, keywords: "theme dark light appearance", run: toggleTheme },
    { kind: "action", key: "act:nav", label: mode === "dock" ? "Use sidebar navigation" : "Use dock navigation", icon: mode === "dock" ? LayoutDashboard : PanelBottom, keywords: "dock sidebar navigation layout", run: () => setMode(mode === "dock" ? "sidebar" : "dock") },
  ], [quick, theme, toggleTheme, mode, setMode]);

  // Filter each group, then flatten in the SAME order they're rendered so keyboard
  // navigation (results[active]) lines up with the rendered rows.
  const { acts, pages, projects, notes, boards, tasks, results } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (it: Item) => !q || (it.label + " " + ("keywords" in it ? it.keywords ?? "" : "")).toLowerCase().includes(q);
    const acts = q ? actions.filter(match) : actions;   // always show actions, filtered by query
    const pages = pageItems.filter(match);
    const projects = dyn.projects.filter(match).slice(0,q?50:5);
    const notes = dyn.wiki.filter(match).slice(0,q?50:5);
    const boards = dyn.boards.filter(match).slice(0,q?50:5);
    const tasks = q ? dyn.tasks.filter(match).slice(0,50) : [];
    return { acts, pages, projects, notes, boards, tasks, results: [...acts, ...pages, ...tasks, ...projects, ...notes, ...boards] };
  }, [query, dyn, actions, pageItems]);

  // ⌘K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const openItem = (it: Item) => {
    setOpen(false);
    if (it.kind === "action") { it.run(); return; }
    if (it.kind === "page") { router.push(it.href); return; }
    if (it.kind === "project") { router.push(`/projects/${it.id}`); return; }
    if (it.kind === "task") {
      writeStored("base_task_search",it.label);
      window.dispatchEvent(new CustomEvent("base:search-tasks",{detail:it.label}));
      router.push("/tasks");return;
    }
    if (it.kind === "wiki") {
      try { localStorage.setItem("base_wiki_active", it.id); } catch {}
      window.dispatchEvent(new CustomEvent("base:open-wiki", { detail: it.id }));
      router.push("/notes");
      return;
    }
    // board
    try { localStorage.setItem("base_vision_active", it.id); } catch {}
    window.dispatchEvent(new CustomEvent("base:open-vision", { detail: it.id }));
    router.push("/vision");
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[active]) openItem(results[active]); }
  };
  useEffect(()=>{
    if(open)document.getElementById(`${listId}-${results[active]?.key}`)?.scrollIntoView({block:"nearest"});
  },[active,open,listId,results]);

  // Render one result row; `idx` is its global index in `results`.
  const renderRow = (it: Item, idx: number) => {
    const isActive = idx === active;
    const isCurrent = it.kind === "page" && (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href));
    const Icon = it.kind === "page" || it.kind === "action" ? it.icon : it.kind === "task" ? CheckSquare : it.kind === "project" ? FolderKanban : LayoutGrid;
    return (
      <button
        key={it.key}
        id={`${listId}-${it.key}`} role="option" aria-selected={isActive}
        onMouseEnter={() => setActive(idx)}
        onClick={() => openItem(it)}
        className={cn("w-full flex items-center gap-3 px-2.5 h-10 rounded-lg text-left transition-colors", isActive ? "bg-[var(--chip)]" : "bg-transparent")}
      >
        <span className={cn("flex items-center justify-center w-7 h-7 rounded-md border shrink-0 text-[15px]", isActive ? "border-[var(--border-2)] bg-[var(--bg)]" : "border-[var(--border)] bg-[var(--surface-2)]")}>
          {it.kind === "wiki" ? <NoteIcon value={it.emoji}/> : <Icon className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />}
        </span>
        <span className="text-[13.5px] text-[var(--text)] font-medium truncate">{it.label}</span>
        {isCurrent && <span className="text-[11px] text-[var(--faint)] border border-[var(--border)] rounded px-1.5 py-0.5">Current</span>}
        {isActive && <CornerDownLeft className="ml-auto w-3.5 h-3.5 text-[var(--faint)] shrink-0" strokeWidth={2} />}
      </button>
    );
  };

  const renderSection = (label: string, items: Item[], offset: number) =>
    items.length ? (
      <div key={label}>
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-[var(--faint)] uppercase tracking-wide">{label}</p>
        {items.map((it, i) => renderRow(it, offset + i))}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPalette}
        className="group flex items-center gap-2 h-11 md:h-8 min-w-0 w-full max-w-[280px] px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--faint)] hover:bg-[var(--chip)] hover:border-[var(--border-2)] transition-colors"
      >
        <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        <span className="text-[13px] text-[var(--muted)] truncate">Search or jump to…</span>
        <kbd className="ml-auto hidden md:flex items-center gap-0.5 text-[11px] font-medium text-[var(--faint)] tabular">
          <span className="text-[12px]">{isMac?"⌘":"Ctrl"}</span>K
        </kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/30 nx-fade" />
          <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }} onKeyDown={onListKey} className="fixed top-[calc(env(safe-area-inset-top)+1rem)] sm:top-[12dvh] left-1/2 -translate-x-1/2 z-[101] flex flex-col w-[calc(100%-2rem)] max-w-[560px] max-h-[calc(100dvh-env(safe-area-inset-top)-2rem)] bg-[var(--bg)] border border-[var(--border)] rounded-xl overflow-hidden elevated nx-pop">
            <Dialog.Title className="sr-only">Search your workspace</Dialog.Title>
            <div className="flex items-center gap-2.5 px-4 h-12 shrink-0 border-b border-[var(--border)]">
              <Search className="w-4 h-4 text-[var(--faint)] shrink-0" strokeWidth={2} />
              <input ref={inputRef} role="combobox" aria-expanded={open} aria-controls={listId} aria-activedescendant={results[active]?`${listId}-${results[active].key}`:undefined} aria-autocomplete="list" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} placeholder="Search tasks, projects, notes…" aria-label="Search your workspace" className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--text)] placeholder-[var(--faint)] outline-none" />
              <Dialog.Close aria-label="Close search" className="flex w-11 h-11 shrink-0 items-center justify-center rounded-lg text-[var(--faint)] hover:text-[var(--text)]"><X className="w-4 h-4" /></Dialog.Close>
            </div>

            <div id={listId} role="listbox" aria-label="Search results" className="min-h-0 max-h-[360px] overflow-y-auto overscroll-contain p-1.5">
              {results.length === 0 ? (
                <div className="px-3 py-10 text-center"><p className="text-[13px] text-[var(--muted)]">No results for &quot;{query}&quot;</p></div>
              ) : (
                <>
                  {renderSection("Actions", acts, 0)}
                  {renderSection("Pages", pages, acts.length)}
                  {renderSection("Tasks", tasks, acts.length + pages.length)}
                  {renderSection("Projects", projects, acts.length + pages.length + tasks.length)}
                  {renderSection("Notes", notes, acts.length + pages.length + tasks.length + projects.length)}
                  {renderSection("Vision boards", boards, acts.length + pages.length + tasks.length + projects.length + notes.length)}
                </>
              )}
            </div>

            <div className="hidden md:flex shrink-0 items-center gap-4 px-4 h-9 border-t border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--faint)]">
              <span className="flex items-center gap-1"><kbd className="font-medium">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="font-medium">↵</kbd> open</span>
              <span className="flex items-center gap-1"><kbd className="font-medium">esc</kbd> close</span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
