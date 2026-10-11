import { useEffect, useRef, useState } from "react";
import { RefreshCw, CloudOff, Check, ShieldCheck, Download, Upload, Bell, ArrowRight, Laptop } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { useRouter } from "./navigation";
import { useDesktopStatus, currentWorkspace, connect, disconnect, sync, resolve, unsavedCopy, retrySave, importBackup, selectOffline, transferOffline } from "./store";
import { native } from "./native";

import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

export function DesktopAccountSettings() {
  const status = useDesktopStatus();
  const workspace = currentWorkspace();
  const [origin, setOrigin] = useState(workspace?.origin || "https://base.lucasbrown.xyz");
  const [password, setPassword] = useState("");
  const [notePassword, setNotePassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [offlineWorkspaces,setOfflineWorkspaces]=useState<{scope:string;label:string}[]>([]);
  const text = status.saving ? "Saving on this device…" : status.syncing ? "Synchronizing…" : status.local ? "Local workspace" : status.pending ? `${status.pending} changes saved locally` : "Saved on this device";
  const action = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  return <section className="base-account-settings base-settings-card">
    <div className="base-settings-card-heading"><ShieldCheck className="h-5 w-5"/><div><h2>Account & sync</h2><p>Your workspace is saved on this device. Connect your Base account to sync across devices.</p></div></div>
    <div className="base-account-summary"><Laptop className="h-5 w-5 text-[var(--muted)]"/><div className="min-w-0"><p className="text-sm font-medium break-all">{workspace?.origin || "Local workspace"}</p><p role="status" className="mt-1 text-xs text-[var(--muted)]">{text}{status.conflicts ? ` · ${status.conflicts} conflicts to review` : ""}</p></div>{!status.local&&<button className="base-button base-button-secondary ml-auto" disabled={status.syncing} onClick={()=>void sync()}><RefreshCw className="h-4 w-4"/> Sync</button>}</div>
    <div className="base-account-form">
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(async () => { await connect(origin, password); setPassword(""); }); }}>
          <label className="grid gap-1 text-sm">Service URL<input type="url" required value={origin} onChange={e => setOrigin(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /></label>
          <label className="grid gap-1 text-sm">Base password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /></label>
          <button disabled={busy || status.saving || status.hasUnsaved} className="rounded-lg bg-[var(--action)] px-3 py-2 text-sm text-[var(--on-action)]">{busy ? "Connecting…" : "Connect / renew session"}</button>
        </form>
        {status.local && <form className="my-3 grid gap-2" onSubmit={event=>{event.preventDefault();void action(async()=>{await native("set_local_note_password",{scope:workspace?.scope,password:notePassword});setNotePassword("");});}}>
          <label className="grid gap-1 text-sm">Local note password<input type="password" required autoComplete="new-password" value={notePassword} onChange={event=>setNotePassword(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2" /></label>
          <button disabled={busy} className="text-left text-xs underline">Set local note password</button>
        </form>}
        {error && <p role="alert" className="my-3 text-sm text-red-500">{error}</p>}
        </div><div className="base-account-actions">
          <button onClick={() => void action(async () => { const permission = await isPermissionGranted() ? "granted" : await requestPermission(); if (permission !== "granted") throw new Error("Notifications are disabled in system settings."); })}><Bell className="h-4 w-4"/> Enable notifications</button>
          <button onClick={() => void action(() => native("export_workspace",{ unsaved: unsavedCopy() }))}><Download className="h-4 w-4"/> Export workspace & pending edits</button>
          <button disabled={busy||status.hasUnsaved} onClick={()=>void action(importBackup)}><Upload className="h-4 w-4"/> Import workspace backup</button>
          <button onClick={()=>void action(async()=>setOfflineWorkspaces(await native("list_offline_workspaces")))}><Laptop className="h-4 w-4"/> Choose offline workspace</button>
          {!status.local&&<button disabled={busy||status.hasUnsaved} onClick={()=>void action(transferOffline)}><ArrowRight className="h-4 w-4"/> Add selected offline workspace to account</button>}
          <button onClick={() => void action(async () => { const version = await native<string | null>("check_update"); setUpdate(version); setUpdateMessage(version ? `Version ${version} is available.` : "This build is up to date."); })}>Check for updates</button>
          {!status.local && <button disabled={busy || status.hasUnsaved} onClick={() => void action(disconnect)}>Sign out to local workspace</button>}
        </div>
        {offlineWorkspaces.length>0&&<label className="my-3 grid gap-1 text-sm">Offline workspace<select value={status.local?workspace?.scope:""} onChange={event=>void action(()=>selectOffline(event.target.value))} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2"><option value="" disabled>Select a local workspace</option>{offlineWorkspaces.map(item=><option key={item.scope} value={item.scope}>{item.label}</option>)}</select></label>}
        <p className="my-2 text-xs text-[var(--muted)]">Imports open an isolated offline copy. Adding it to an account queues records; collisions and legacy deletions require review. Original snapshots and local workspaces are retained.</p>
        {updateMessage && <p role="status" className="my-2 text-xs">{updateMessage}</p>}
        {update && <button disabled={busy || status.pending > 0 || status.saving || status.hasUnsaved} onClick={() => void action(() => native("install_update"))} className="my-2 text-sm underline">Install signed update and restart</button>}
        {status.hasUnsaved && <div role="alert" className="my-3 text-sm"><p>Your unsaved edit is retained in memory. Retry saving or export it before closing Base.</p><button onClick={()=>void action(retrySave)} className="mt-2 underline">Retry saving</button></div>}
        {workspace?.conflicts.map(conflict => <div key={conflict.id} className="mt-3 rounded-lg border border-[var(--border)] p-3">
          <p className="text-sm font-medium">{conflict.operation.path.map(p => typeof p === "string" ? p : p.id).join(" / ")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{conflict.reason}. Both values remain archived after resolution.</p>
          {!conflict.operation.after.exists&&<p className="mt-1 text-xs text-[var(--muted)]">Your edit deletes this record. Keeping it applies that deletion.</p>}
          {conflict.localRecord?.exists && <p className="mt-1 text-xs text-[var(--muted)]">Keeping your edit restores the complete local record that was deleted remotely.</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><p className="text-xs font-medium">Your edit</p><pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(conflict.operation.after, null, 2)}</pre></div>
            <div><p className="text-xs font-medium">Server at conflict</p><pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(conflict.remote, null, 2)}</pre></div>
          </div>
          <div className="mt-3 flex gap-4 text-xs"><button disabled={busy} onClick={() => void action(() => resolve(conflict.id, "local"))}>Keep my edit</button><button disabled={busy} onClick={() => void action(() => resolve(conflict.id, "server"))}>Use server value</button></div>
        </div>)}
  </section>;
}

function openAccount(router: ReturnType<typeof useRouter>) {
  router.push("/settings?section=account");
  window.dispatchEvent(new CustomEvent("base:settings-section", { detail: "account" }));
}
export function DesktopSyncButton() {
  const status = useDesktopStatus();
  const router = useRouter();
  const label = status.hasUnsaved ? "An edit needs saving" : status.saving ? "Saving…" : status.conflicts ? `${status.conflicts} conflicts to review` : status.pending ? `${status.pending} changes saved locally` : status.local ? "Local workspace" : status.error ? "Offline changes retained" : "All changes synced";
  return <div className="flex items-center gap-1.5">
    <button onClick={()=>openAccount(router)} title={label} aria-label={label} className="base-sync-summary hidden lg:flex" data-attention={status.conflicts>0||status.hasUnsaved}>
      {status.pending||status.conflicts||status.hasUnsaved ? <span className="base-sync-dot"/> : <Check className="h-3 w-3"/>}<span>{label}</span>
    </button>
    <button onClick={()=>status.local||status.hasUnsaved?openAccount(router):void sync()} disabled={status.syncing} aria-label={status.local?"Connect account in Settings":"Sync now"} title={`${label} · ${status.local?"Connect account":"Sync now"}`} className="base-icon-button" data-attention={!!status.error||status.conflicts>0}>
      {status.error&&!status.syncing?<CloudOff className="h-[18px] w-[18px]"/>:<RefreshCw className={`h-[18px] w-[18px] ${status.syncing?"animate-spin":""}`}/>}
    </button>
  </div>;
}
export function DesktopFeedback() {
  const status = useDesktopStatus();
  const { toast } = useToast();
  const router = useRouter();
  const shown = useRef({ message: "", time: 0 });
  useEffect(()=>{
    if(!status.error)return;
    // Repeated bounded retries do not produce a stack of identical warnings.
    if(shown.current.message===status.error&&Date.now()-shown.current.time<60_000)return;
    shown.current={message:status.error,time:Date.now()};
    toast(status.error.replace(/^Error: /,""),{duration:9000,action:{label:"Settings",onClick:()=>openAccount(router)}});
  },[status.error,toast,router]);
  return null;
}
