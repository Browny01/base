"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, Timer, Repeat2, DollarSign,
  FolderKanban, Newspaper, MoreHorizontal, X,
  Trophy, Briefcase, Sun, Moon, LayoutGrid, NotebookText, Dumbbell, MessageCircle, Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";
import { pageIsVisible } from "@/lib/page-visibility";
import { useHiddenPages } from "@/lib/use-page-visibility";

type Item = { href: string; label: string; icon: LucideIcon };

// The always-visible dock row (curated). Everything else lives in "More".
const DOCK: Item[] = [
  { href: "/",        label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat",    label: "Chat",      icon: MessageCircle   },
  { href: "/player",  label: "Personal",  icon: Trophy          },
  { href: "/gym",     label: "Gym",       icon: Dumbbell        },
  { href: "/projects",label: "Projects",  icon: FolderKanban    },
  { href: "/tasks",   label: "Tasks",     icon: CheckSquare     },
  { href: "/finance", label: "Finance",   icon: DollarSign      },
  { href: "/learn",   label: "Learn",     icon: Lightbulb       },
  { href: "/news",    label: "News",      icon: Newspaper       },
];

// The full list (shown in the More panel that expands upward).
const ALL: Item[] = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat",     label: "Chat",      icon: MessageCircle },
  { href: "/player",   label: "Personal",  icon: Trophy        },
  { href: "/gym",      label: "Gym",       icon: Dumbbell      },
  { href: "/business", label: "Business",  icon: Briefcase     },
  { href: "/projects", label: "Projects",  icon: FolderKanban  },
  { href: "/vision",   label: "Vision",    icon: LayoutGrid    },
  { href: "/notes",    label: "Notes",     icon: NotebookText  },
  { href: "/tasks",    label: "Tasks",     icon: CheckSquare   },
  { href: "/focus",    label: "Focus",     icon: Timer         },
  { href: "/habits",   label: "Habits",    icon: Repeat2       },
  { href: "/finance",  label: "Finance",   icon: DollarSign    },
  { href: "/learn",    label: "Learn",     icon: Lightbulb     },
  { href: "/news",     label: "News",      icon: Newspaper     },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

// Small, macOS-style magnification: the hovered icon grows, immediate neighbours
// grow a little. Kept subtle on purpose.
function scaleFor(hover: number | null, i: number): number {
  if (hover === null) return 1;
  const d = Math.abs(i - hover);
  return d === 0 ? 1.22 : d === 1 ? 1.1 : d === 2 ? 1.03 : 1;
}

function DockIcon({ item, active, scale, hovered, onHover }: {
  item: Item; active: boolean; scale: number; hovered: boolean; onHover: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onMouseEnter={onHover}
      className="relative flex items-end justify-center px-0.5"
      style={{ transform: `scale(${scale}) translateY(${scale > 1 ? -(scale - 1) * 14 : 0}px)`, transformOrigin: "bottom center", transition: "transform .18s cubic-bezier(.2,.7,.3,1)" }}
    >
      {/* label tooltip — shown only for the hovered icon */}
      <span className={cn("pointer-events-none absolute -top-8 left-1/2 whitespace-nowrap rounded-md bg-[var(--text)] px-2 py-1 text-[11px] font-semibold text-[var(--bg)] shadow-lg transition-opacity duration-150", hovered ? "opacity-100" : "opacity-0")} style={{ transform: `translateX(-50%) scale(${1 / scale})` }}>
        {item.label}
      </span>
      <span className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
        active ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
      )}>
        <Icon style={{ width: 21, height: 21 }} strokeWidth={active ? 2.1 : 1.85} />
      </span>
      {active && <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--text)]" aria-hidden="true" />}
    </Link>
  );
}

export function Dock() {
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const hiddenPages = useHiddenPages();
  const isDark = theme === "dark";
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const dockItems = DOCK.filter((item) => pageIsVisible(hiddenPages, item.href));
  const allItems = ALL.filter((item) => pageIsVisible(hiddenPages, item.href));

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none pb-3">
      <div className="pointer-events-auto flex flex-col items-center gap-2 max-w-[calc(100vw-24px)]">
        {/* More panel — expands upward */}
        {open && (
          <div className="glass glass-edge nx-slide-up w-[420px] max-w-full rounded-3xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">All pages</span>
              <button onClick={() => setOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--faint)] hover:bg-[var(--chip)] hover:text-[var(--text)]"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {allItems.map(({ href, label, icon: Icon }, i) => {
                const active = isActive(pathname, href);
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)}
                    className={cn("nx-slide-up flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-center",
                      active ? "border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text)]" : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}
                    style={{ animationDelay: `${i * 16}ms` }}>
                    <Icon style={{ width: 19, height: 19 }} strokeWidth={active ? 2.1 : 1.8} />
                    <span className="text-[10.5px] font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>
            <button onClick={() => { toggleTheme(); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] py-2.5 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
              {isDark ? <Sun style={{ width: 16, height: 16 }} strokeWidth={1.9} /> : <Moon style={{ width: 16, height: 16 }} strokeWidth={1.9} />}
              {isDark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}

        {/* The dock */}
        <div className="glass glass-edge flex items-end gap-0.5 rounded-[22px] border border-[var(--border)] px-2 py-1.5" onMouseLeave={() => setHover(null)}>
          {dockItems.map((item, i) => (
            <DockIcon key={item.href} item={item} active={isActive(pathname, item.href)} scale={scaleFor(hover, i)} hovered={hover === i} onHover={() => setHover(i)} />
          ))}

          <div className="mx-1 h-8 w-px shrink-0 self-center bg-[var(--border)]" />

          {/* More */}
          <button onMouseEnter={() => setHover(null)} onClick={() => setOpen((v) => !v)} title="More"
            className={cn("flex h-11 w-11 items-center justify-center rounded-2xl transition-colors", open ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:bg-[var(--chip)] hover:text-[var(--text)]")}>
            <MoreHorizontal style={{ width: 21, height: 21 }} strokeWidth={2} />
          </button>
          {/* Theme toggle */}
          <button onMouseEnter={() => setHover(null)} onClick={toggleTheme} title={isDark ? "Light mode" : "Dark mode"}
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--muted)] transition-colors hover:bg-[var(--chip)] hover:text-[var(--text)]">
            {isDark ? <Sun style={{ width: 20, height: 20 }} strokeWidth={1.85} /> : <Moon style={{ width: 20, height: 20 }} strokeWidth={1.85} />}
          </button>
        </div>
      </div>
    </div>
  );
}
