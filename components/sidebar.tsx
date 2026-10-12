"use client";

import { BaseImage } from "@/lib/image";

import Link from "@/lib/link";
import { usePathname } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useTheme } from "@/lib/theme-context";
import { useBase } from "@/lib/hooks";
import { visiblePages, orderedKeys, DEFAULT_SIDEBAR_ORDER, SETTINGS_PAGE, type NavPage } from "@/lib/nav-config";
import { ChevronsLeft, Sun, Moon, ChevronsRight } from "lucide-react";
import { ProfileAvatar } from "./profile-avatar";
import { firstName } from "@/lib/profile";

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

function NavLink({ item, pathname, collapsed }: { item: NavPage; pathname: string; collapsed: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "base-nav-link relative flex items-center rounded-lg text-[13px] transition-colors min-h-[36px]",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active
          ? "base-nav-active text-[var(--text)] font-medium"
          : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] font-medium"
      )}
    >
      <Icon
        className="shrink-0"
        style={{ width: 18, height: 18 }}
        strokeWidth={1.65}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const { data } = useBase();
  const isDark = theme === "dark";

  const pages = visiblePages(data.navPrefs);
  const customOrder=orderedKeys(data.navPrefs).join()!==DEFAULT_SIDEBAR_ORDER.join();
  const sections: string[] = customOrder?["Workspace"]:[];
  if(!customOrder)for (const p of pages) if (!sections.includes(p.section)) sections.push(p.section);

  return (
    <aside
      className={cn(
        "base-sidebar flex flex-col h-full sticky top-0 shrink-0 transition-[width] duration-200 ease-out",
        "border-r border-[var(--border)] bg-[var(--bg-side)]",
        collapsed ? "w-[64px]" : "w-[252px]"
      )}
    >
      {/* On macOS the left of this header is occupied by the native traffic lights. */}
      <div className={cn(
        "flex items-center h-12 shrink-0 gap-2",
        collapsed ? "justify-center" : "px-3"
      )}>
        <Link href="/" aria-label="Base home" className="base-brand-mark"><BaseImage
          src="/base-icon-transparent.png"
          alt="Base"
          className="w-5 h-5 object-contain shrink-0"
        /></Link>
        {!collapsed && <span className="text-[14px] font-semibold tracking-tight">Base <span className="font-normal text-[var(--faint)]">/ Personal</span></span>}
        {!collapsed && (
          <button
            onClick={toggle}
            className="ml-auto p-1.5 rounded-md text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            aria-expanded={!collapsed}
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 px-2 py-2 flex flex-col gap-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section} className="flex flex-col gap-0.5">
            {!collapsed ? (
              <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-[var(--faint)] tracking-normal">
                {section}
              </p>
            ) : (
              <div className="mx-auto my-1 h-px w-7 bg-[var(--border)]" aria-hidden="true" />
            )}
            {pages.filter((p) => customOrder || p.section === section).map((item) => (
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
            aria-label="Expand sidebar"
            aria-expanded={!collapsed}
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        {/* Settings + theme toggle (theme sits to the right of settings) */}
        <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "flex-row")}>
          <div className={collapsed ? "" : "flex-1 min-w-0"}>
            <NavLink item={SETTINGS_PAGE} pathname={pathname} collapsed={collapsed} />
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 flex items-center justify-center rounded-[7px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors w-9 h-9"
          >
            {isDark
              ? <Sun className="shrink-0" style={{ width: 18, height: 18 }} strokeWidth={1.8} />
              : <Moon className="shrink-0" style={{ width: 18, height: 18 }} strokeWidth={1.8} />}
          </button>
        </div>
        <Link href="/settings" aria-label="Your profile" className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-[var(--surface-2)]">
          <ProfileAvatar profile={data.profile} />
          {!collapsed && <span className="min-w-0"><span className="block truncate text-[12.5px] font-medium">{firstName(data.profile) || "Your workspace"}</span><span className="block text-[11px] text-[var(--faint)]">Personal command center</span></span>}
        </Link>
      </div>
    </aside>
  );
}
