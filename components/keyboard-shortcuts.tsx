"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useBridge } from "@/lib/hooks";
import { isHidden, PAGE_BY_HREF } from "@/lib/nav-config";
// Press `g` then a key to jump around. `?` opens the cheat-sheet.
const NAV: { key: string; href: string; label: string }[] = [
  { key: "d", href: "/",            label: "Dashboard" },
  { key: "j", href: "/projects",    label: "Projects" },
  { key: "v", href: "/vision",      label: "Vision" },
  { key: "n", href: "/notes",       label: "Notes" },
  { key: "a", href: "/calendar",    label: "Calendar" },
  { key: "t", href: "/tasks",       label: "Tasks" },
  { key: "w", href: "/shopping-list", label: "Wish List" },
  { key: "e", href: "/reading-list", label: "Reading List" },
  { key: "m", href: "/watch-list",  label: "Watch List" },
  { key: "o", href: "/focus",       label: "Focus" },
  { key: "f", href: "/finance",     label: "Finance" },
  { key: "r", href: "/news",        label: "News" },
  { key: "s", href: "/settings",    label: "Settings" },
];

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || n.isContentEditable;
};

export function KeyboardShortcuts() {
  const router = useRouter();
  const { data } = useBridge();
  const [cheat, setCheat] = useState(false);
  const gArmed = useRef<number>(0);

  // Shortcuts for pages you've hidden in Settings still work (the page still
  // exists), but don't advertise them in the cheat-sheet.
  const visibleNav = NAV.filter((n) => {
    const page = PAGE_BY_HREF.get(n.href);
    return !page || !isHidden(page.key, data.navPrefs);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      if (e.key === "?") { e.preventDefault(); setCheat((v) => !v); return; }
      if (e.key === "Escape") { setCheat(false); return; }

      // `g` then key = navigate
      if (e.key === "g") { gArmed.current = Date.now(); return; }
      if (Date.now() - gArmed.current < 1200) {
        const dest = NAV.find((n) => n.key === e.key);
        gArmed.current = 0;
        if (dest) { e.preventDefault(); router.push(dest.href); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!cheat || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 bg-black/40 backdrop-blur-[2px] nx-fade" onClick={() => setCheat(false)}>
      <div className="w-full max-w-md bg-[var(--bg)] border border-[var(--border)] rounded-2xl elevated nx-pop p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Keyboard shortcuts</h2>
          <button onClick={() => setCheat(false)} className="text-[var(--faint)] hover:text-[var(--text)] text-lg leading-none">×</button>
        </div>
        <div className="space-y-1.5">
          <Row keys={["⌘", "K"]} label="Search / command palette" />
          <Row keys={["?"]} label="This cheat-sheet" />
          <div className="my-2 h-px bg-[var(--border)]" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)] pb-1">Go to — press <kbd className="mx-0.5 rounded border border-[var(--border)] px-1 text-[10px]">g</kbd> then…</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {visibleNav.map((n) => <Row key={n.key} keys={["g", n.key]} label={n.label} />)}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-[var(--text)]">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => <kbd key={i} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted)] tabular">{k}</kbd>)}
      </span>
    </div>
  );
}
