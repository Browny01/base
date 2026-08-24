"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, Timer, DollarSign,
  FolderKanban, Newspaper, X, MoreHorizontal,
  Sun, Moon, LayoutGrid, NotebookText, CalendarDays,
  Settings, ShoppingCart, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";

type Item = { href: string; label: string; icon: LucideIcon };

// The fixed tabs — a standard iOS tab bar. Everything else lives in "More".
const TABS: Item[] = [
  { href: "/",         label: "Home",     icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban    },
  { href: "/tasks",    label: "Tasks",    icon: CheckSquare     },
];

// Everything — the More sheet
const ALL: Item[] = [
  { href: "/",         label: "Dashboard", icon: LayoutDashboard },
  { href: "/shopping-list", label: "Wish List", icon: ShoppingCart },
  { href: "/projects", label: "Projects",  icon: FolderKanban  },
  { href: "/vision",   label: "Vision",    icon: LayoutGrid    },
  { href: "/notes",    label: "Notes",     icon: NotebookText  },
  { href: "/calendar", label: "Calendar",  icon: CalendarDays  },
  { href: "/tasks",    label: "Tasks",     icon: CheckSquare   },
  { href: "/focus",    label: "Focus",     icon: Timer         },
  { href: "/finance",  label: "Finance",   icon: DollarSign    },
  { href: "/news",     label: "News",      icon: Newspaper     },
  { href: "/settings", label: "Settings",  icon: Settings      },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

// A tab that isn't one of the fixed tabs is still "active" when its page is open,
// which we surface by lighting up the More button.
const TAB_HREFS = new Set(TABS.map((t) => t.href));

function Tab({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "tap relative flex flex-col items-center justify-center gap-0.5 w-[58px] h-[46px] rounded-[16px] transition-colors",
        active ? "text-[var(--text)]" : "text-[var(--faint)]",
      )}
    >
      {active && <span className="absolute inset-0 rounded-[16px] bg-[var(--surface-2)]" aria-hidden="true" />}
      <Icon className="relative shrink-0" style={{ width: 22, height: 22 }} strokeWidth={active ? 2.1 : 1.8} />
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const onOtherPage = !TAB_HREFS.has(pathname) && ![...TAB_HREFS].some((h) => h !== "/" && pathname.startsWith(h + "/")) && pathname !== "/";
  const moreActive = open || onOtherPage;

  return (
    <>
      {/* More sheet — the full app map */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] nx-fade" />
          <div
            className="relative w-full px-3 nx-slide-up"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 92px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass glass-edge border border-[var(--border)] rounded-[26px] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow">All pages</span>
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
                        active ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-2)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent")}
                      style={{ animationDelay: `${i * 16}ms` }}>
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

      {/* Floating liquid-glass tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <div className="pointer-events-auto glass glass-edge border border-[var(--border)] rounded-[24px] px-1.5 py-1.5 flex items-center gap-0.5">
          {TABS.map((item) => (
            <Tab key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="More"
            className={cn(
              "tap relative flex items-center justify-center w-[58px] h-[46px] rounded-[16px] transition-colors",
              moreActive ? "text-[var(--text)]" : "text-[var(--faint)]",
            )}
          >
            {moreActive && <span className="absolute inset-0 rounded-[16px] bg-[var(--surface-2)]" aria-hidden="true" />}
            <MoreHorizontal className="relative" style={{ width: 22, height: 22 }} strokeWidth={moreActive ? 2.1 : 1.8} />
          </button>
        </div>
      </div>
    </>
  );
}
