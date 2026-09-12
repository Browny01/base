"use client";

import {
  LayoutDashboard, ShoppingCart, BookOpen, Play,
  FolderKanban, LayoutGrid, NotebookText, CalendarDays,
  CheckSquare, Timer, DollarSign, Wallet, Newspaper, Settings,
  type LucideIcon,
} from "lucide-react";

// Single source of truth for every page in the app. All nav surfaces
// (sidebar, dock, mobile bottom bar, command palette, keyboard shortcuts)
// consume this, so "hide this page" and reordering work everywhere.
export interface NavPage {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;          // sidebar grouping; "" = never listed in a group
  keywords: string;         // for the command palette
  defaultHidden?: boolean;  // hidden from nav unless enabled in Settings
}

export const ALL_PAGES: NavPage[] = [
  { key: "dashboard",   href: "/",             label: "Dashboard",   icon: LayoutDashboard, section: "Command",  keywords: "home overview" },
  { key: "wishlist",    href: "/shopping-list", label: "Wish List",   icon: ShoppingCart,   section: "Personal", keywords: "shopping wishlist clothes tech gear buy want" },
  { key: "readinglist", href: "/reading-list", label: "Reading List", icon: BookOpen,       section: "Personal", keywords: "books reading to-read library" },
  { key: "watchlist",   href: "/watch-list",  label: "Watch List",   icon: Play,           section: "Personal", keywords: "movies shows films watchlist" },
  { key: "projects",    href: "/projects",    label: "Projects",     icon: FolderKanban,   section: "Build",    keywords: "roadmap docs kanban" },
  { key: "vision",      href: "/vision",      label: "Vision",       icon: LayoutGrid,     section: "Build",    keywords: "board collage moodboard" },
  { key: "notes",       href: "/notes",       label: "Notes",        icon: NotebookText,   section: "Build",    keywords: "wiki docs pages" },
  { key: "calendar",    href: "/calendar",    label: "Calendar",     icon: CalendarDays,   section: "Systems",  keywords: "events agenda schedule bookings dates" },
  { key: "tasks",       href: "/tasks",       label: "Tasks",        icon: CheckSquare,    section: "Systems",  keywords: "todo kanban" },
  { key: "focus",       href: "/focus",       label: "Focus",        icon: Timer,          section: "Systems",  keywords: "pomodoro timer" },
  { key: "finance",     href: "/finance",     label: "Finance",      icon: DollarSign,     section: "Intel",    keywords: "money wallet crypto" },
  { key: "money",       href: "/money",       label: "Money",        icon: Wallet,         section: "Intel",    keywords: "cash income expenses", defaultHidden: true },
  { key: "news",        href: "/news",        label: "News",         icon: Newspaper,      section: "Intel",    keywords: "markets headlines" },
];

export const PAGE_BY_KEY = new Map(ALL_PAGES.map((p) => [p.key, p]));
export const PAGE_BY_HREF = new Map(ALL_PAGES.map((p) => [p.href, p]));

// Settings is reachable from every nav surface but never hides.
export const SETTINGS_PAGE: NavPage = {
  key: "settings", href: "/settings", label: "Settings", icon: Settings,
  section: "", keywords: "preferences appearance theme navigation",
};

export const DEFAULT_SIDEBAR_ORDER = ALL_PAGES.map((p) => p.key);
export const DEFAULT_BOTTOM_TABS = ["dashboard", "projects", "tasks"];

// The always-visible desktop dock row (everything else sits in "More").
export const DEFAULT_DOCK = ["dashboard", "projects", "tasks", "finance", "news"];

// Which pages are navigation prefs:
//   hiddenPages  — pages switched off everywhere (global)
//   sidebarOrder — display order for the sidebar / More sheets
//   bottomTabs   — the fixed tabs on the mobile bottom bar
export interface NavPrefs {
  hiddenPages: string[];
  sidebarOrder: string[];
  bottomTabs: string[];
}

export const DEFAULT_NAV_PREFS: NavPrefs = {
  hiddenPages: ALL_PAGES.filter((p) => p.defaultHidden).map((p) => p.key),
  sidebarOrder: DEFAULT_SIDEBAR_ORDER,
  bottomTabs: DEFAULT_BOTTOM_TABS,
};

// Merge the user's sidebar order with the canonical list so a stale/missing
// entry can never drop a page (their order is preserved either way).
export function orderedKeys(prefs?: Partial<NavPrefs>): string[] {
  const base = prefs?.sidebarOrder?.length ? prefs.sidebarOrder : DEFAULT_SIDEBAR_ORDER;
  const seen = new Set(base);
  const merged = [...base];
  for (const p of ALL_PAGES) if (!seen.has(p.key)) merged.push(p.key);
  return merged;
}

export function visiblePages(prefs?: Partial<NavPrefs>): NavPage[] {
  const hidden = new Set(prefs?.hiddenPages ?? DEFAULT_NAV_PREFS.hiddenPages);
  const out: NavPage[] = [];
  for (const key of orderedKeys(prefs)) {
    const p = PAGE_BY_KEY.get(key);
    if (p && !hidden.has(key)) out.push(p);
  }
  return out;
}

export function isHidden(key: string, prefs?: Partial<NavPrefs>): boolean {
  return new Set(prefs?.hiddenPages ?? DEFAULT_NAV_PREFS.hiddenPages).has(key);
}