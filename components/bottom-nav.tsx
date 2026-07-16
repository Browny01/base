"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, Timer, DollarSign,
  FolderKanban, Repeat2, Newspaper, X, MoreHorizontal,
  GraduationCap, Trophy, Briefcase, Sun, Moon, LayoutGrid, NotebookText, Dumbbell, Lock, Sparkles, Lightbulb,
  Settings, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";

type Item = { href: string; label: string; icon: LucideIcon };

// Swipeable "basics" — the row you slide through
const PRIMARY: Item[] = [
  { href: "/",        label: "Home",    icon: LayoutDashboard },
  { href: "/chat",    label: "Chat",    icon: Sparkles       },
  { href: "/lockin",  label: "Lock In", icon: Lock           },
  { href: "/tasks",   label: "Tasks",   icon: CheckSquare    },
  { href: "/focus",   label: "Focus",   icon: Timer          },
  { href: "/finance", label: "Finance", icon: DollarSign     },
  { href: "/gym",     label: "Gym",     icon: Dumbbell       },
  { href: "/habits",  label: "Habits",  icon: Repeat2        },
];

// Everything — the More sheet
const ALL: Item[] = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat",     label: "Chat",      icon: Sparkles      },
  { href: "/player",   label: "Personal",  icon: Trophy        },
  { href: "/lockin",   label: "Lock In",   icon: Lock          },
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
  { href: "/school",   label: "School",    icon: GraduationCap },
  { href: "/news",     label: "News",      icon: Newspaper     },
  { href: "/settings", label: "Settings",  icon: Settings      },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // keep the active basic in view as you move around
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname]);

  return (
    <>
      {/* More sheet */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] nx-fade" />
          <div className="relative w-full px-3 nx-slide-up" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }} onClick={e => e.stopPropagation()}>
            <div className="glass glass-edge border border-[var(--border)] rounded-[24px] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-[var(--faint)] tracking-wide uppercase">All pages</span>
                <button onClick={() => setOpen(false)} className="tap w-7 h-7 flex items-center justify-center rounded-full text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ALL.map(({ href, label, icon: Icon }, i) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link key={href} href={href} onClick={() => setOpen(false)}
                      className={cn("tap nx-slide-up flex flex-col items-center gap-1.5 py-3 rounded-2xl text-center border",
                        active ? "bg-[var(--chip)] text-[var(--text)] border-[var(--border-2)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent")}
                      style={{ animationDelay: `${i * 18}ms` }}>
                      <Icon style={{ width: 19, height: 19 }} strokeWidth={active ? 2.1 : 1.8} />
                      <span className="text-[10.5px] font-medium">{label}</span>
                    </Link>
                  );
                })}
              </div>
              <button onClick={() => { toggleTheme(); setOpen(false); }}
                className="tap mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[13px] font-medium">
                {isDark ? <Sun style={{ width: 16, height: 16 }} strokeWidth={1.9} /> : <Moon style={{ width: 16, height: 16 }} strokeWidth={1.9} />}
                {isDark ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating liquid-glass bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
        <div className="pointer-events-auto glass glass-edge border border-[var(--border)] rounded-[26px] p-1.5 flex items-center gap-1 max-w-[calc(100vw-24px)]">
          {/* swipeable basics */}
          <div ref={scrollRef} className="flex items-center gap-1 overflow-x-auto no-scrollbar snap-x scroll-smooth">
            {PRIMARY.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link key={href} href={href} ref={active ? activeRef : undefined}
                  className={cn("tap snap-center shrink-0 relative flex items-center rounded-full transition-all duration-300 ease-out",
                    active ? "gap-1.5 pl-3 pr-3.5 py-2 bg-[var(--chip)] text-[var(--text)]" : "px-2.5 py-2 text-[var(--faint)]")}>
                  <Icon style={{ width: 20, height: 20 }} strokeWidth={active ? 2.2 : 1.85} className="shrink-0" />
                  <span className={cn("text-[12px] font-semibold whitespace-nowrap overflow-hidden transition-all duration-300 ease-out",
                    active ? "max-w-[90px] opacity-100" : "max-w-0 opacity-0")}>{label}</span>
                </Link>
              );
            })}
          </div>

          <div className="w-px h-7 bg-[var(--border)] mx-0.5 shrink-0" />

          {/* More */}
          <button onClick={() => setOpen(v => !v)}
            className={cn("tap shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition-colors",
              open ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:bg-[var(--chip)]")}>
            <MoreHorizontal style={{ width: 20, height: 20 }} strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );
}
