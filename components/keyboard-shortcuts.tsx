"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useBridge } from "@/lib/hooks";
import { isHidden, PAGE_BY_HREF } from "@/lib/nav-config";
import { SHORTCUT_SECTIONS, onOpenShortcutSheet } from "@/lib/shortcuts";
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
  const pathname = usePathname();
  const { data } = useBridge();
  const [cheat, setCheat] = useState(false);
  const gArmed = useRef(0);

  // Shortcuts for pages you've hidden in Settings still work (the page still
  // exists), but don't advertise them in the cheat-sheet.
  const visibleNav = NAV.filter((n) => {
    const page = PAGE_BY_HREF.get(n.href);
    return !page || !isHidden(page.key, data.navPrefs);
  });

  useEffect(() => onOpenShortcutSheet(() => setCheat(true)), []);

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

  const sections = SHORTCUT_SECTIONS.map((s) => {
    if (!s.only) return s;
    if (!s.only.some((p) => pathname?.startsWith(p))) return null;
    return { ...s, rows: s.id === "nav" ? visibleNav.map((n) => ({ keys: ["g", n.key], label: n.label })) : s.rows };
  }).filter((s): s is NonNullable<typeof s> => !!s);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 bg-black/40 backdrop-blur-[2px] nx-fade" onClick={() => setCheat(false)}>
      <div className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-[var(--bg)] border border-[var(--border)] rounded-2xl elevated nx-pop p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[var(--text)]">Keyboard shortcuts</h2>
          <button onClick={() => setCheat(false)} className="text-[var(--faint)] hover:text-[var(--text)] text-lg leading-none">×</button>
        </div>
        <div className="space-y-1.5">
          {sections.map((s, i) => (
            <div key={s.id}>
              {(i > 0 || s.id !== "general") && <div className="my-2 h-px bg-[var(--border)]" />}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)] pb-1">
                {s.title}
                {s.lead && <> — press <kbd className="mx-0.5 rounded border border-[var(--border)] px-1 text-[10px]">{s.lead}</kbd> then…</>}
              </p>
              <div className={cn2(s.rows.length)}>
                {s.rows.map((r) => <Row key={r.keys.join("") + r.label} keys={r.keys} label={r.label} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function cn2(n: number) {
  return n > 2 ? "grid grid-cols-2 gap-x-4 gap-y-1.5" : "grid grid-cols-1 gap-y-1.5";
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