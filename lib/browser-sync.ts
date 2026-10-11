"use client";
import { DEFAULT, getData, migrateAll, installLocalSnapshot, type BaseData } from "./store.ts";
import { diff, equal, overlay, readSlot, validOperation, type Document, type Operation, type Conflict, type SyncResponse, type BrowserSyncStatus } from "../packages/sync/src/protocol.ts";
import { prepareBatch } from "../packages/sync/src/upload.ts";

const KEY = "base_sync_v2";
type State = { version: 2; document: BaseData; baseline: Document | null; pending: Operation[]; conflicts: Conflict[]; resolvedConflicts?: (Conflict & { choice: "local" | "server"; resolvedAt: number })[]; revision: number; workspaceId: string | null; legacy?: BaseData };
const json = (data: BaseData) => JSON.parse(JSON.stringify(data)) as Document;
let state: State | null = null;
let unsaved: { next: State; previous: string | null } | null = null;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let rerun = false;
let announce: (() => void) | null = null;
let mutations: Promise<unknown> = Promise.resolve();
const synchronize = async () => sync();
let status: BrowserSyncStatus = { pending: 0, conflicts: [], error: "", syncing: false, synchronize, resolveConflict: resolve };
export const browserSyncStatus = () => status;
export function browserSyncFailure(error: unknown) { report({ error: `Browser workspace recovery required: ${String(error)}` }); }
function report(patch: Partial<BrowserSyncStatus> = {}) {
  status = { ...status, pending: state?.pending.length ?? 0, conflicts: state?.conflicts ?? [], hasUnsaved: !!unsaved, ...(unsaved?{retryUnsaved:retryUnsaved}:{retryUnsaved:undefined}), ...patch };
  const main=document.querySelector?.("main");if(main)main.inert=!!unsaved;
  announce?.();
}
function save(next: State) {
  // Document + queue + baseline + conflicts form ONE atomic localStorage value.
  // The old base_data/Bridge/Nexus blobs remain available for rollback.
  const previous=localStorage.getItem(KEY);
  try { localStorage.setItem(KEY,JSON.stringify(next)); }
  catch(error){unsaved={next,previous};throw error;}
  state=next;unsaved=null;
  installLocalSnapshot(next.document);report();
}
async function locked<T>(action: () => T | Promise<T>): Promise<T> {
  if(!navigator.locks)throw new Error("This browser does not support safe workspace locking. Use an updated browser or the desktop app; existing data was retained.");
  return navigator.locks.request("base:browser:sync-v2",async()=>{
    const current=localStorage.getItem(KEY);
    if(current){const parsed=JSON.parse(current) as State;if(parsed.version!==2)throw new Error("Unsupported browser workspace version.");state=parsed;}
    return action();
  });
}
export function commitBrowserEdit(updater:(data:BaseData)=>BaseData) {
  const result=mutations.then(()=>locked(()=>{
    if(!state)throw new Error("Browser storage is not ready.");
    if(unsaved)throw new Error("Editing is paused. Retry saving or export the unsaved edit before closing this page.");
    const previous=state.document,next={...updater(previous),updatedAt:Date.now()};
    const before=json(previous);
    const ancestor=overlay(overlay(state.baseline??(state.legacy?json(state.legacy):{}),state.conflicts.map(c=>c.operation)),state.pending);
    if(!Array.isArray(state.baseline?.boards)&&!state.pending.some(op=>op.path[0]==="boards"))before.boards=[];
    const operations=diff(before,json(next),()=>crypto.randomUUID(),state.revision).map(op=>op.action==="set"?{...op,before:readSlot(ancestor,op.path)}:op);
    save({...state,document:next,pending:[...state.pending,...operations]});
    failures=0;schedule();
  }));
  mutations=result.catch(error=>{report({error:`Could not save this edit: ${String(error)}`});});
  return result;
}
function schedule(delay=750) {
  if(timer)clearTimeout(timer);timer=null;
  if(document.hidden||!navigator.onLine)return;
  timer=setTimeout(()=>{timer=null;void sync();},delay);
}
export function startBrowserSync(listener: () => void) {
  announce=listener;
  if(state)return;
  const cached=localStorage.getItem(KEY);
  if(cached) {
    const parsed=JSON.parse(cached) as State;
    if(parsed.version!==2||!parsed.document||!Array.isArray(parsed.pending)||!parsed.pending.every(validOperation))throw new Error("This browser workspace needs recovery or a newer Base version. Your stored data was retained.");
    state=parsed;
  } else {
    const local=getData();
    state={version:2,document:local,baseline:null,pending:[],conflicts:[],revision:0,workspaceId:null,...(local.updatedAt?{legacy:local}:{})};
  }
  installLocalSnapshot(state.document);
  window.addEventListener("storage",event=>{
    if(event.key!==KEY)return;
    try { const parsed=JSON.parse(event.newValue??"null") as State;if(parsed?.version===2){state=parsed;installLocalSnapshot(parsed.document);report();} }
    catch(error){report({error:`Browser storage recovery required: ${String(error)}`});}
  });
  window.addEventListener("online",()=>{failures=0;schedule(0);});
  window.addEventListener("focus",()=>{failures=0;schedule(0);});
  document.addEventListener("visibilitychange",()=>{if(document.hidden){if(timer)clearTimeout(timer);timer=null;}else schedule(0);});
  report(state.legacy?{exportLegacy:()=>download("base-previous-browser-cache.json",state!.legacy!)}:{});
}
function download(name:string,value:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportBrowserWorkspace(){download("base-browser-workspace.json",{saved:state,unsaved:unsaved?.next,raw:state?undefined:localStorage.getItem(KEY),previous:state?undefined:localStorage.getItem("base_data")??localStorage.getItem("bridge_data")??localStorage.getItem("nexus_data")});}
async function retryUnsaved(){await locked(()=>{if(!unsaved)return;if(localStorage.getItem(KEY)!==unsaved.previous)throw new Error("Another tab changed the workspace. Export the unsaved copy before continuing; it was not overwritten.");save(unsaved.next);report({error:""});schedule(0);});}
export async function sync():Promise<void> {
  if(inFlight){rerun=true;return inFlight;}
  if(!state||unsaved||!navigator.onLine)return;
  inFlight=(async()=>{
    await mutations;
    report({syncing:true,error:""});
    if(!state!.workspaceId||state!.baseline===null) {
      const response=await fetch("/api/native/sync?protocol=2",{cache:"no-store",signal:AbortSignal.timeout(20_000)});
      if(!response.ok)throw new Error(`Sync unavailable (${response.status}). Your browser edits are retained.`);
      const initial=await response.json() as SyncResponse;
      if(initial.protocol!==2||!initial.workspaceId||!initial.data||Array.isArray(initial.data)||!Number.isSafeInteger(initial.revision))throw new Error("Deploy sync v2 before synchronizing this browser.");
      const initialData=initial.data;
      if(state!.workspaceId&&state!.workspaceId!==initial.workspaceId)throw new Error("Workspace identity changed. Export your browser data before switching accounts.");
      await locked(()=>{
      if(state!.baseline!==null&&state!.workspaceId===initial.workspaceId)return;
      let pending=state!.pending;
      // A pre-v2 cache has no trustworthy ancestor. Recover newer offline data
      // as conservative creates: collisions become reviewable conflicts;
      // missing records never delete somebody else's newer cloud records.
      if(state!.legacy&&(state!.legacy.updatedAt??0)>Number(initialData.updatedAt??0)) {
        const recovered=diff({},json(state!.legacy)).filter(op=>op.after.exists&&!equal(readSlot(initialData,op.path,op.action),op.after));
        pending=[...recovered,...pending];
      }
      const document=migrateAll({...DEFAULT,...overlay(initialData,pending)} as unknown as BaseData);
      save({...state!,document,baseline:initialData,workspaceId:initial.workspaceId,revision:initial.revision,pending});
      });
    }
    const sent=state!;
    const operations=await prepareBatch(sent.pending,sent.workspaceId!,async body=>{
      const response=await fetch("/api/native/sync/chunk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
      if(!response.ok)throw new Error(`Upload failed (${response.status}); your original is retained.`);
    });
    const response=await fetch("/api/native/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({protocol:2,workspaceId:sent.workspaceId,cursor:sent.revision,operations}),signal:AbortSignal.timeout(30_000)});
    if(!response.ok)throw new Error((await response.json()).error??`Sync failed (${response.status}).`);
    const result=await response.json() as SyncResponse;
    if(result.protocol!==2||result.workspaceId!==sent.workspaceId||!Number.isSafeInteger(result.revision)||result.revision<sent.revision)throw new Error("Invalid sync response; edits were retained.");
    const ids=new Set(operations.map(op=>op.id));
    if(!Array.isArray(result.applied)||!Array.isArray(result.conflicts)||[...result.applied,...result.conflicts.map(c=>c.id)].some(id=>!ids.has(id))||result.conflicts.some(c=>!validOperation(c.operation)||!equal(c.operation,sent.pending.find(op=>op.id===c.id))))throw new Error("Unknown sync acknowledgement; no edits were removed.");
    await locked(()=>{
    if(state!.workspaceId!==sent.workspaceId)throw new Error("Workspace changed during sync; your edits are retained.");
    const acknowledged=new Set([...result.applied,...result.conflicts.map(c=>c.id)]);
    const pending=state!.pending.filter(op=>!acknowledged.has(op.id));
    const baseline=result.revision>=state!.revision?(result.data??state!.baseline!):state!.baseline!;
    const incoming=result.conflicts.map(conflict=> typeof conflict.operation.path[1]==="object"&&!readSlot(baseline,conflict.operation.path.slice(0,2)).exists?{...conflict,localRecord:readSlot(json(state!.document),conflict.operation.path.slice(0,2))}:conflict);
    const conflicts=[...new Map([...state!.conflicts,...incoming].map(c=>[c.id,c])).values()];
    const document=migrateAll({...DEFAULT,...overlay(overlay(baseline,conflicts.map(c=>c.operation)),pending)} as unknown as BaseData);
    save({...state!,document,baseline,revision:Math.max(result.revision,state!.revision),pending,conflicts});failures=0;
    });
  })().catch(error=>{report({error:String(error)});if(++failures<=5)schedule(Math.min(60_000,1000*2**failures));}).finally(()=>{
    inFlight=null;report({syncing:false});const again=rerun;rerun=false;
    if(again||(!status.error&&state?.pending.length))schedule(0);
  });
  return inFlight;
}
async function resolve(id:string,choice:"local"|"server") {
  await locked(()=>{
  if(!state?.baseline)return;
  const conflict=state.conflicts.find(c=>c.id===id);if(!conflict)return;
  let op={...conflict.operation,requiresReview:false,id:crypto.randomUUID(),baseRevision:state.revision,before:readSlot(state.baseline,conflict.operation.path,conflict.operation.action)};
  if(choice==="local"&&conflict.localRecord?.exists)op={...op,path:op.path.slice(0,2),action:"set",before:readSlot(state.baseline,op.path.slice(0,2)),after:conflict.localRecord};
  if(op.before.exists&&op.after.exists&&op.before.value!==null&&op.after.value!==null&&typeof op.before.value==="object"&&typeof op.after.value==="object"&&!Array.isArray(op.before.value)&&!Array.isArray(op.after.value))op={...op,after:{exists:true,value:{...op.before.value,...op.after.value}}};
  const conflicts=state.conflicts.filter(c=>c.id!==id);
  const pending=choice==="local"?[...state.pending,op]:state.pending;
  const document=migrateAll({...DEFAULT,...overlay(overlay(state.baseline,conflicts.map(c=>c.operation)),pending)} as unknown as BaseData);
  save({...state,document,conflicts,pending,resolvedConflicts:[...(state.resolvedConflicts??[]),{...conflict,choice,resolvedAt:Date.now()}]});schedule(0);
  });
}
