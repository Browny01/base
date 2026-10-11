"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getData, DEFAULT, type BaseData } from "./store";
import { startBrowserSync, sync, browserSyncStatus, commitBrowserEdit, browserSyncFailure } from "./browser-sync";
import type { BrowserSyncStatus } from "../packages/sync/src/protocol.ts";

let snapshot: BaseData = DEFAULT;
let hydrated = false;
let hydration: Promise<void> | null = null;
const listeners = new Set<() => void>();
function emit() { for (const listener of listeners) listener(); }
function refresh() { snapshot=getData();emit(); }
if(typeof window!=="undefined")window.addEventListener("base_update",refresh);
function hydrate() {
  if(hydration)return hydration;
  hydration=Promise.resolve().then(async()=>{
    try { startBrowserSync(refresh);refresh();await sync(); }
    catch(error) { browserSyncFailure(error); }
    finally { hydrated=true;emit(); }
  });
  return hydration;
}
function subscribe(listener:()=>void) { listeners.add(listener);void hydrate().catch(error=>console.error("Browser workspace recovery required",String(error)));return ()=>{listeners.delete(listener);}; }
const getServerData=()=>DEFAULT;
const getServerLoaded=()=>false;
const getServerStatus=():BrowserSyncStatus|null=>null;
export function useBase() {
  const data=useSyncExternalStore(subscribe,()=>snapshot,getServerData);
  const loaded=useSyncExternalStore(subscribe,()=>hydrated,getServerLoaded);
  const syncStatus=useSyncExternalStore(subscribe,browserSyncStatus,getServerStatus);
  const mutate=useCallback((updater:(data:BaseData)=>BaseData)=>{
    void commitBrowserEdit(updater).catch(error=>console.error("Browser edit was not saved",String(error)));
  },[]);
  return {data,mutate,loaded,syncStatus};
}
