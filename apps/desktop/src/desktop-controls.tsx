import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDesktopStatus, currentWorkspace, connect, disconnect, sync, resolve, unsavedCopy, retrySave, importBackup, selectOffline, transferOffline } from "./store";
import { native } from "./native";
import { useTheme } from "@/lib/theme-context";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

export function DesktopControls() {
  const status = useDesktopStatus();
  const workspace = currentWorkspace();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("https://base.lucasbrown.xyz");
  const [password, setPassword] = useState("");
  const [notePassword, setNotePassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [offlineWorkspaces,setOfflineWorkspaces]=useState<{scope:string;label:string}[]>([]);
  const { setTheme } = useTheme();
  const text = status.saving ? "Saving on this device…" : status.syncing ? "Synchronizing…" : status.local ? "Local workspace" : status.pending ? `${status.pending} changes saved locally` : "Saved on this device";
  const action = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-1.5 text-[11px]">
      <span role="status" aria-live="polite" className="text-[var(--muted)]">{text}{status.conflicts ? ` · ${status.conflicts} conflicts to review` : ""}</span>
      <div className="flex items-center gap-3">
        {!status.local && <button onClick={() => void sync()} disabled={status.syncing}>Sync now</button>}
        <button onClick={() => setOpen(true)} className="font-medium">{status.conflicts ? "Review conflicts" : status.local ? "Connect account" : "Account & sync"}</button>
      </div>
    </div>
    {status.error && <div role="alert" className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">{status.error}</div>}
    <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[140] bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[141] max-h-[85vh] w-[min(640px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <Dialog.Title className="text-lg font-semibold">Desktop account & sync</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-[var(--muted)]">Your workspace and pending changes stay on this device. Connect to the same Base service on each device.</Dialog.Description>
        <p className="my-3 break-all text-xs text-[var(--muted)]">{workspace?.origin || "Local workspace — available offline"}</p>
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
        <div className="my-4 flex flex-wrap gap-3 text-xs">
          <button onClick={() => setTheme("system")}>Follow system appearance</button>
          <button onClick={() => void action(async () => { const permission = await isPermissionGranted() ? "granted" : await requestPermission(); if (permission !== "granted") throw new Error("Notifications are disabled in system settings."); })}>Enable notifications</button>
          <button onClick={() => void action(() => native("export_workspace",{ unsaved: unsavedCopy() }))}>Export workspace & pending edits</button>
          <button disabled={busy||status.hasUnsaved} onClick={()=>void action(importBackup)}>Import workspace backup</button>
          <button onClick={()=>void action(async()=>setOfflineWorkspaces(await native("list_offline_workspaces")))}>Choose offline workspace</button>
          {!status.local&&<button disabled={busy||status.hasUnsaved} onClick={()=>void action(transferOffline)}>Add selected offline workspace to account</button>}
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
        <Dialog.Close className="mt-5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </>;
}
