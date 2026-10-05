"use client";

// Central registry for the keyboard cheat-sheet. Add a section here and it shows
// up in the sheet automatically — the sheet reads this and nothing else, so new
// shortcuts can be added site-wide without touching the modal.

export interface ShortcutRow {
  keys: string[];
  label: string;
}

export interface ShortcutSection {
  id: string;
  title: string;
  lead?: string;
  rows: ShortcutRow[];
  /** Only show this section on these pathname prefixes. Omit for "everywhere". */
  only?: string[];
}

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    id: "general",
    title: "General",
    rows: [
      { keys: ["⌘", "K"], label: "Search / command palette" },
      { keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
  {
    id: "create",
    title: "Create",
    rows: [
      { keys: ["⌘", "⇧", "N"], label: "New task" },
      { keys: ["⌘", "⇧", "O"], label: "New project" },
      { keys: ["⌘", "⇧", "E"], label: "New event" },
    ],
  },
  {
    id: "view",
    title: "View",
    rows: [
      { keys: ["⌘", "⇧", "D"], label: "Toggle dark / light mode" },
      { keys: ["⌘", "\\"], label: "Sidebar ↔ dock navigation" },
      { keys: ["⌘", "B"], label: "Collapse / expand sidebar" },
    ],
  },
  {
    id: "notes",
    title: "Notes",
    only: ["/notes"],
    rows: [
      { keys: ["⌘", "Z"], label: "Undo" },
      { keys: ["⌘", "⇧", "Z"], label: "Redo" },
      { keys: ["⌘", "↵"], label: "New block below" },
      { keys: ["⌘", "/"], label: "Block / slash menu" },
      { keys: ["⌘", "N"], label: "New note" },
      { keys: ["⇧", "⌥", "↑/↓"], label: "Drag a block by its ⠿ handle" },
    ],
  },
  {
    id: "nav",
    title: "Go to",
    lead: "g",
    rows: [],
  },
];

const OPEN_EVENT = "nx:open-shortcuts";

export function openShortcutSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenShortcutSheet(fn: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, fn);
  return () => window.removeEventListener(OPEN_EVENT, fn);
}