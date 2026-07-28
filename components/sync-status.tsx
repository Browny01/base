"use client";

import { AlertTriangle, Check, Cloud, RefreshCw, WifiOff } from "lucide-react";
import { useBridge } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function label(
  state: ReturnType<typeof useBridge>["syncState"],
  pending: number,
  conflicts: number,
) {
  if (conflicts) return `${conflicts} sync conflict${conflicts === 1 ? "" : "s"}`;
  if (state === "offline") return pending ? `Offline · ${pending} queued` : "Offline";
  if (state === "syncing") return pending ? `Syncing ${pending} changes` : "Checking cloud";
  if (state === "error") return pending ? `Sync paused · ${pending} queued` : "Sync paused";
  return "Up to date";
}

export function SyncStatusButton() {
  const { syncState, pendingCount, conflicts, syncNow } = useBridge();
  const text = label(syncState, pendingCount, conflicts.length);
  const Icon = conflicts.length || syncState === "error"
    ? AlertTriangle
    : syncState === "offline"
      ? WifiOff
      : syncState === "syncing"
        ? RefreshCw
        : pendingCount
          ? Cloud
          : Check;

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={`${text}. Click to sync now.`}
      aria-label={`${text}. Sync now`}
      className={cn(
        "group flex h-8 items-center gap-2 rounded-full border px-2.5 text-[11px] font-semibold transition-colors",
        conflicts.length || syncState === "error"
          ? "border-[color-mix(in_srgb,var(--c-amber)_34%,var(--border))] bg-[color-mix(in_srgb,var(--c-amber)_8%,transparent)] text-[var(--c-amber)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--faint)] hover:border-[var(--border-2)] hover:text-[var(--text)]",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", syncState === "syncing" && "animate-spin")} />
      <span className="hidden lg:inline">{text}</span>
      {(pendingCount > 0 || conflicts.length > 0) && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--text)] px-1 text-[9px] text-[var(--bg)]">
          {conflicts.length || pendingCount}
        </span>
      )}
    </button>
  );
}
