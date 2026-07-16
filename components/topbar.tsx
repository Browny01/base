"use client";

import { CommandBar } from "@/components/command-bar";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 h-12 flex items-center gap-3 px-3 sm:px-4 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]">
      {/* Brand mark — mobile only (sidebar carries it on desktop) */}
      <div className="flex md:hidden items-center gap-2 shrink-0">
        <img src="/icon.png" alt="Bridge" className="w-[24px] h-[24px] rounded-[6px]" />
      </div>

      {/* Centered command trigger */}
      <div className="flex-1 flex justify-center">
        <CommandBar />
      </div>

      {/* Right spacer to keep the trigger visually centered */}
      <div className="hidden md:block w-[60px] shrink-0" />
    </header>
  );
}
