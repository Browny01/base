"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Cloud, Copy, Database, Download, HardDrive, KeyRound, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { resolveSyncConflict, useBridge } from "@/lib/hooks";
import { cn } from "@/lib/utils";

function formatSyncTime(value: number | null) {
  if (!value) return "Not synced on this device yet";
  return `Last synced ${new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

export function OfflineSettings() {
  const { data, syncState, pendingCount, conflicts, lastSync, syncError, syncNow } = useBridge();
  const [pairToken, setPairToken] = useState("");
  const [pairing, setPairing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [storageUsage, setStorageUsage] = useState<string | null>(null);

  useEffect(() => {
    void navigator.storage?.estimate().then(({ usage, quota }) => {
      if (!usage || !quota) return;
      const usageMb = Math.max(0.1, usage / 1_048_576).toFixed(1);
      const quotaGb = (quota / 1_073_741_824).toFixed(1);
      setStorageUsage(`${usageMb} MB used · ${quotaGb} GB available`);
    });
  }, [data.updatedAt]);

  async function createPairingToken() {
    setPairing(true);
    try {
      const deviceId = `bridge-native-${crypto.randomUUID()}`;
      const response = await fetch("/api/native/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const result = await response.json() as { token?: string };
      if (!response.ok || !result.token) throw new Error("Could not create a token.");
      setPairToken(result.token);
    } finally {
      setPairing(false);
    }
  }

  async function copyToken() {
    if (!pairToken) return;
    await navigator.clipboard.writeText(pairToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function exportOfflineBackup() {
    const blob = new Blob([JSON.stringify({
      format: "bridge-offline-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      pendingChanges: pendingCount,
      conflicts,
      data,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bridge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const StateIcon = syncState === "offline" ? WifiOff : syncState === "syncing" ? RefreshCw : syncState === "error" ? AlertTriangle : Check;
  const stateLabel = syncState === "offline" ? "Offline" : syncState === "syncing" ? "Syncing" : syncState === "error" ? "Sync paused" : "All changes synced";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--text)]" strokeWidth={1.9} />
            <h2 className="text-sm font-bold text-[var(--text)]">Offline &amp; sync</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Bridge saves locally first, then reconciles changes securely across your devices.</p>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncState === "syncing"}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--text)] px-3 text-xs font-semibold text-[var(--bg)] disabled:opacity-45"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncState === "syncing" && "animate-spin")} />
          Sync now
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <StateIcon className={cn("mb-3 h-4 w-4", syncState === "syncing" && "animate-spin", syncState === "error" ? "text-[var(--c-amber)]" : "text-[var(--text)]")} />
          <p className="text-sm font-semibold text-[var(--text)]">{stateLabel}</p>
          <p className="mt-1 text-[11px] text-[var(--faint)]">{syncError || formatSyncTime(lastSync)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <Cloud className="mb-3 h-4 w-4 text-[var(--text)]" />
          <p className="text-sm font-semibold text-[var(--text)]">{pendingCount} queued</p>
          <p className="mt-1 text-[11px] text-[var(--faint)]">Edits remain on this device until acknowledged.</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
          <ShieldCheck className="mb-3 h-4 w-4 text-[var(--text)]" />
          <p className="text-sm font-semibold text-[var(--text)]">{conflicts.length} conflicts</p>
          <p className="mt-1 text-[11px] text-[var(--faint)]">Concurrent note and settings edits are never silently replaced.</p>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--c-amber)_34%,var(--border))] bg-[color-mix(in_srgb,var(--c-amber)_6%,transparent)] p-4">
          <div className="mb-3 flex items-center gap-2 text-[var(--c-amber)]">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-[0.12em]">Review concurrent edits</p>
          </div>
          <div className="space-y-2">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text)]">{conflict.operation.collection} · {conflict.operation.recordId}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--faint)]">Another device changed this after your local copy was downloaded.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void resolveSyncConflict(conflict.id, "cloud")} className="h-8 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]">Use cloud</button>
                  <button onClick={() => void resolveSyncConflict(conflict.id, "local")} className="h-8 rounded-lg bg-[var(--text)] px-3 text-xs font-semibold text-[var(--bg)]">Keep mine</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
          <HardDrive className="h-4 w-4 text-[var(--text)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">Local recovery copy</p>
          <p className="mt-0.5 text-[11px] text-[var(--faint)]">{storageUsage || "Bridge checks available device storage automatically."}</p>
        </div>
        <button onClick={exportOfflineBackup} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)]">
          <Download className="h-3.5 w-3.5" />
          Export backup
        </button>
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]"><KeyRound className="h-4 w-4 text-[var(--text)]" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text)]">Pair a native device</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--faint)]">Generate a one-year token for the Bridge iPhone or Mac offline workspace. The token only grants sync access and should be stored in that device’s Keychain.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button onClick={createPairingToken} disabled={pairing} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] disabled:opacity-45">
                {pairing ? "Generating…" : pairToken ? "Generate another token" : "Generate pairing token"}
              </button>
              {pairToken && (
                <button onClick={copyToken} className="inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)]">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy token"}
                </button>
              )}
            </div>
            {pairToken && <p className="mt-2 truncate rounded-md bg-[var(--bg)] px-2.5 py-2 font-mono text-[10px] text-[var(--faint)]">{pairToken}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
