"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useBase } from "@/lib/hooks";
import { exportBrowserWorkspace } from "@/lib/browser-sync";
export function BrowserSyncStatus() {
  const { syncStatus }=useBase();const [open,setOpen]=useState(false);const [error,setError]=useState("");
  if(!syncStatus)return null;
  const action=async(fn:()=>Promise<unknown>)=>{try{setError("");await fn();}catch(error){setError(String(error));}};
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="max-w-40 truncate rounded-lg px-2 py-1 text-xs text-[var(--muted)]">{syncStatus.conflicts.length?`${syncStatus.conflicts.length} conflicts`:syncStatus.error?"Sync needs attention":syncStatus.syncing?"Syncing…":syncStatus.pending?`${syncStatus.pending} saved locally`:"Sync"}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[140] bg-black/40"/><Dialog.Content className="fixed left-1/2 top-1/2 z-[141] max-h-[80vh] w-[min(600px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <Dialog.Title className="text-lg font-semibold">Browser synchronization</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-[var(--muted)]">{syncStatus.pending} pending edits are saved in this browser. Conflicting edits remain archived until you choose how to resolve them.</Dialog.Description>
      {(syncStatus.error||error)&&<p role="alert" className="my-3 text-sm">{error||syncStatus.error}</p>}
      {syncStatus.hasUnsaved&&<p role="alert" className="my-2 text-sm">An edit could not be saved. Its full copy is retained in memory; export it or retry saving before closing this page.</p>}
      {syncStatus.retryUnsaved&&<button onClick={()=>void action(syncStatus.retryUnsaved!)} className="my-2 text-sm underline">Retry saving</button>}
      <div className="my-4 flex flex-wrap gap-4 text-sm"><button onClick={()=>void syncStatus.synchronize()}>Sync now</button><button onClick={exportBrowserWorkspace}>Export workspace</button>{syncStatus.exportLegacy&&<button onClick={syncStatus.exportLegacy}>Export previous browser cache</button>}</div>
      {syncStatus.conflicts.map(conflict=><div key={conflict.id} className="my-3 rounded-lg border border-[var(--border)] p-3">
        <p className="text-sm font-medium">{conflict.operation.path.map(p=>typeof p==="string"?p:p.id).join(" / ")}</p>
        <div className="my-2 grid gap-3 sm:grid-cols-2"><div><p className="text-xs">Your edit</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(conflict.operation.after,null,2)}</pre></div><div><p className="text-xs">Server at conflict</p><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(conflict.remote,null,2)}</pre></div></div>
        <div className="flex gap-4 text-xs"><button onClick={()=>void action(()=>syncStatus.resolveConflict(conflict.id,"local"))}>Keep my edit</button><button onClick={()=>void action(()=>syncStatus.resolveConflict(conflict.id,"server"))}>Use server value</button></div>
      </div>)}
      <Dialog.Close className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Close</Dialog.Close>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
