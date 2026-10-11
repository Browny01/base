"use client";

import type { ReactNode } from "react";
import Link from "@/lib/link";
import { Keyboard, Plus, ChevronDown } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { CommandBar } from "@/components/command-bar";
import { openShortcutSheet } from "@/lib/shortcuts";
import { useBase } from "@/lib/hooks";
import { initialOf } from "@/lib/profile";
import { BrowserSyncStatus } from "./browser-sync-status";
import { usePathname } from "@/lib/navigation";
import { PAGE_BY_HREF, SETTINGS_PAGE } from "@/lib/nav-config";
import { useQuickActions } from "@/lib/quick-actions";

export function TopBar({ syncControl }: { syncControl?: ReactNode }) {
  const { data } = useBase();
  const path = usePathname();
  const quick = useQuickActions();
  const current = path.startsWith("/projects/") ? data.projects.find(project=>project.id===path.slice(10))?.name || "Project" : path === "/settings" ? SETTINGS_PAGE.label : PAGE_BY_HREF.get(path)?.label || "Workspace";

  return (
    <header
      className="base-topbar sticky top-0 z-30 shrink-0 bg-[var(--surface)] border-b border-[var(--border)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-12 flex items-center gap-3 px-3 sm:px-5">
        <nav aria-label="Breadcrumb" className="hidden md:flex min-w-0 items-center gap-2 text-xs">
          <Link href="/" className="text-[var(--muted)]">Base</Link><span aria-hidden="true" className="text-[var(--faint)]">/</span><span className="truncate max-w-44 font-medium" aria-current="page">{current}</span>
        </nav>
        {/* Centered command / search trigger */}
        <div className="flex-1 min-w-0 flex justify-end">
          <CommandBar />
        </div>

        {/* Right: shortcuts + account */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Dropdown.Root><Dropdown.Trigger className="base-button base-button-secondary hidden sm:flex" aria-label="Create new item"><Plus className="h-3.5 w-3.5"/> New <ChevronDown className="h-3 w-3"/></Dropdown.Trigger>
            <Dropdown.Portal><Dropdown.Content align="end" sideOffset={6} className="base-menu" aria-label="Create new item">
              <Dropdown.Item className="base-menu-item" onSelect={quick.newTask}>New task <kbd>⇧ N</kbd></Dropdown.Item>
              <Dropdown.Item className="base-menu-item" onSelect={quick.newEvent}>New event <kbd>⇧ E</kbd></Dropdown.Item>
              <Dropdown.Item className="base-menu-item" onSelect={quick.newProject}>New project <kbd>⇧ O</kbd></Dropdown.Item>
            </Dropdown.Content></Dropdown.Portal>
          </Dropdown.Root>
          {syncControl ?? <BrowserSyncStatus />}
          <button
            onClick={openShortcutSheet}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <Keyboard className="w-[18px] h-[18px]" />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            title={data.profile?.name ? `Settings — ${data.profile.name}` : "Settings"}
            className="w-11 h-11 md:w-8 md:h-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[12px] font-semibold text-[var(--text)] hover:border-[var(--border-2)] transition-colors"
          >
            {initialOf(data.profile)}
          </Link>
        </div>
      </div>
    </header>
  );
}
