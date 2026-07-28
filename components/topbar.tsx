"use client";

import Link from "next/link";
import { CommandBar } from "@/components/command-bar";
import { SyncStatusButton } from "@/components/sync-status";

export function TopBar() {
  return (
    <header
      className="sticky top-0 z-30 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-14 flex items-center gap-3 px-3 sm:px-4">
        {/* Centered command / search trigger */}
        <div className="flex-1 flex justify-center">
          <CommandBar />
        </div>

        {/* Right: local/cloud state + account */}
        <div className="flex items-center gap-2 shrink-0">
          <SyncStatusButton />
          <Link
            href="/settings"
            title="Settings"
            className="w-8 h-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[12px] font-semibold text-[var(--text)] hover:border-[var(--border-2)] transition-colors"
          >
            L
          </Link>
        </div>
      </div>
    </header>
  );
}
