import { lockForUpdate, updateProgress } from "./update-lock";
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Download, RefreshCw } from "lucide-react";
import { native } from "./native";
import { flushLocalWrites, useDesktopStatus } from "./store";
export function ApplicationUpdates() {
  const status = useDesktopStatus();
  const downloaded = useRef(0);
  const [version, setVersion] = useState<string | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let dispose: (() => void) | undefined, active = true;
    void listen<{ chunk?: number; total?: number; installing: boolean }>("base:update-progress", ({ payload }) => {
      if (payload.installing) { setMessage("Installing… Base will restart automatically."); updateProgress("Installing… Base will restart automatically."); }
      else { downloaded.current += payload.chunk ?? 0; const message = payload.total ? `Downloading… ${Math.min(100, Math.round(downloaded.current / payload.total * 100))}%` : "Downloading update…"; setMessage(message); updateProgress(message); }
    }).then(stop => { if (active) dispose = stop; else stop(); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; dispose?.(); };
  }, []);
  async function action(install: boolean) {
    setBusy(true); setError("");
    const unlock = install ? lockForUpdate() : undefined;
    try {
      if (install) { downloaded.current = 0; await flushLocalWrites(); setMessage("Downloading update…"); await native("install_update"); }
      else { const next = await native<string | null>("check_update"); setVersion(next); setMessage(next ? `Base ${next} is available.` : "You have the latest available release for this platform."); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { unlock?.(); setBusy(false); }
  }
  return <section className="my-4 rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-medium">App updates</h3><p className="mt-1 text-xs text-[var(--muted)]">Download a verified release and restart Base. Your saved workspaces and offline edits stay on this device.</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} className="base-button base-button-secondary" onClick={() => void action(false)}><RefreshCw className="h-4 w-4" /> Check for updates</button>{version && <button disabled={busy || status.saving || status.hasUnsaved} className="base-button base-button-primary" onClick={() => void action(true)}><Download className="h-4 w-4" /> Update & restart</button>}</div>{message && <p role="status" className="mt-3 text-xs">{message}</p>}{error && <p role="alert" className="mt-3 text-xs text-[var(--c-rose)]">{error}</p>}</section>;
}
