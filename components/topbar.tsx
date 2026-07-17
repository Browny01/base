"use client";

import Link from "next/link";
import { CommandBar } from "@/components/command-bar";

export function TopBar() {
  return (
    <header
      className="sticky top-0 z-30 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="h-14 flex items-center gap-3 px-3 sm:px-4">
        {/* Brand mark — mobile always; desktop only in dock mode (sidebar carries it otherwise) */}
        <Link href="/" className="flex md:hidden items-center gap-2 shrink-0">
          <img src="/icon.png" alt="Bridge" className="w-[24px] h-[24px] rounded-[6px]" />
        </Link>
        <Link href="/" className="nx-desktop-dock shrink-0">
          <span className="flex items-center gap-2">
            <img src="/icon.png" alt="Bridge" className="w-[24px] h-[24px] rounded-[6px]" />
            <span className="text-[15px] font-semibold text-[var(--text)] tracking-tight">Bridge</span>
          </span>
        </Link>

        {/* Centered command / search trigger */}
        <div className="flex-1 flex justify-center">
          <CommandBar />
        </div>

        {/* Right: account */}
        <div className="flex items-center shrink-0">
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
