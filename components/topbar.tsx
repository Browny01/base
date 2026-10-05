"use client";

import Link from "next/link";
import { Keyboard } from "lucide-react";
import { CommandBar } from "@/components/command-bar";
import { openShortcutSheet } from "@/lib/shortcuts";
import { useBase } from "@/lib/hooks";
import { initialOf } from "@/lib/profile";

export function TopBar() {
  const { data } = useBase();

  return (
    <header
      className="sticky top-0 z-30 shrink-0 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-14 flex items-center gap-3 px-3 sm:px-4">
        {/* Centered command / search trigger */}
        <div className="flex-1 min-w-0 flex justify-center">
          <CommandBar />
        </div>

        {/* Right: shortcuts + account */}
        <div className="flex items-center gap-1.5 shrink-0">
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
