"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useTheme } from "@/lib/theme-context";
import {
  LayoutDashboard, CheckSquare, Timer, Repeat2, DollarSign,
  FolderKanban, Newspaper, ChevronsLeft, Settings,
  GraduationCap, Trophy, Briefcase, Sun, Moon, LayoutGrid, NotebookText, Dumbbell, Lock, Sparkles, Lightbulb,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavSection = { label: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Command",
    items: [
      { href: "/",     label: "Dashboard", icon: LayoutDashboard },
      { href: "/chat", label: "Chat",      icon: Sparkles        },
    ],
  },
  {
    label: "Personal",
    items: [
      { href: "/player", label: "Personal", icon: Trophy   },
      { href: "/lockin", label: "Lock In",  icon: Lock     },
      { href: "/gym",    label: "Gym",      icon: Dumbbell },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/business", label: "Business", icon: Briefcase    },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/vision",   label: "Vision",   icon: LayoutGrid   },
      { href: "/notes",    label: "Notes",    icon: NotebookText },
    ],
  },
  {
    label: "Systems",
    items: [
      { href: "/tasks",  label: "Tasks",  icon: CheckSquare },
      { href: "/focus",  label: "Focus",  icon: Timer       },
      { href: "/habits", label: "Habits", icon: Repeat2     },
    ],
  },
  {
    label: "Intel",
    items: [
      { href: "/finance", label: "Finance", icon: DollarSign    },
      { href: "/learn",   label: "Learn",   icon: Lightbulb     },
      { href: "/school",  label: "School",  icon: GraduationCap },
      { href: "/news",    label: "News",    icon: Newspaper     },
    ],
  },
];

const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center rounded-[7px] text-[13.5px] transition-colors min-h-[34px]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
          : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] font-normal"
      )}
    >
      {active && !collapsed && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden="true" />}
      <Icon
        className="shrink-0"
        style={{ width: 17, height: 17 }}
        strokeWidth={active ? 2.1 : 1.8}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <aside
      className={cn(
        "flex flex-col h-full sticky top-0 shrink-0 transition-all duration-200 ease-out",
        "border-r border-[var(--border)] bg-[var(--bg)]",
        collapsed ? "w-[64px]" : "w-[252px]"
      )}
    >
      {/* Brand */}
      <div className={cn(
        "flex items-center h-14 shrink-0",
        collapsed ? "justify-center" : "px-4 gap-2.5"
      )}>
        <div
          className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center shrink-0 text-white text-[13px] font-bold"
          style={{ background: "var(--accent)" }}
        >
          N
        </div>
        {!collapsed && (
          <>
            <span className="text-[15px] font-semibold text-[var(--text)] tracking-tight">
              Bridge
            </span>
            <button
              onClick={toggle}
              className="ml-auto p-1.5 -mr-1 rounded-md text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
              title="Collapse sidebar"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-2 flex flex-col gap-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            {!collapsed ? (
              <p className="px-2.5 pt-1 pb-1.5 text-[10.5px] font-semibold text-[var(--faint)] tracking-[0.14em] uppercase">
                {section.label}
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-7 bg-[var(--border)]" aria-hidden="true" />
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-2.5 flex flex-col gap-1">
        {collapsed && (
          <button
            onClick={toggle}
            className="mx-auto flex items-center justify-center w-9 h-9 rounded-[7px] text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
            title="Expand sidebar"
          >
            <ChevronsLeft className="w-4 h-4 rotate-180" />
          </button>
        )}

        {/* Settings + theme toggle (theme sits to the right of settings) */}
        <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "flex-row")}>
          <div className={collapsed ? "" : "flex-1 min-w-0"}>
            <NavLink item={SETTINGS_ITEM} pathname={pathname} collapsed={collapsed} />
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 flex items-center justify-center rounded-[7px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors w-9 h-9"
          >
            {isDark
              ? <Sun className="shrink-0" style={{ width: 17, height: 17 }} strokeWidth={1.8} />
              : <Moon className="shrink-0" style={{ width: 17, height: 17 }} strokeWidth={1.8} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
