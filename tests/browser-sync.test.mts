import assert from "node:assert/strict";
import test from "node:test";
import { diff, mergeOperations, type Document, type SyncRequest } from "../packages/sync/src/protocol.ts";

test("browser writes persist a document/outbox atomically and rebase edits made during sync",async()=>{
  const storage=new Map<string,string>();let quotaFailure=false;
  const events=new EventTarget();
  Object.defineProperty(globalThis,"window",{value:events,configurable:true});
  Object.defineProperty(globalThis,"document",{value:Object.assign(new EventTarget(),{hidden:true}),configurable:true});
  Object.defineProperty(globalThis,"localStorage",{value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{if(quotaFailure)throw new Error("quota");storage.set(key,value);}},configurable:true});
  let lock:Promise<unknown>=Promise.resolve();
  const navigator={onLine:false,locks:{request:(_name:string,fn:()=>unknown)=>{const result=lock.then(fn);lock=result.catch(()=>{});return result;}}};
  Object.defineProperty(globalThis,"navigator",{value:navigator,configurable:true});
  const browser=await import("../lib/browser-sync.ts");
  browser.startBrowserSync(()=>{});
  await Promise.all([
    browser.commitBrowserEdit(data=>({...data,tasks:[...data.tasks,{id:"one",title:"Offline one",done:false,priority:"P2",tag:"work",dueDate:null,recurring:null,createdAt:"2026-10-11"}]})),
    browser.commitBrowserEdit(data=>({...data,tasks:[...data.tasks,{id:"two",title:"Offline two",done:false,priority:"P2",tag:"work",dueDate:null,recurring:null,createdAt:"2026-10-11"}]})),
  ]);
  const stored=JSON.parse(storage.get("base_sync_v2")!);
  assert.equal(stored.document.tasks.length,2);assert.equal(stored.pending.filter((op:{path:string[]})=>op.path[0]==="tasks").length,2);
  const saved=storage.get("base_sync_v2");quotaFailure=true;
  await assert.rejects(()=>browser.commitBrowserEdit(data=>({...data,dailyRevenueTarget:200})),/quota/);
  assert.equal(storage.get("base_sync_v2"),saved);assert.equal(browser.browserSyncStatus().hasUnsaved,true);quotaFailure=false;
  await browser.browserSyncStatus().retryUnsaved!();assert.equal(JSON.parse(storage.get("base_sync_v2")!).document.dailyRevenueTarget,200);
  let remote:Document={tasks:[{id:"cloud",title:"Cloud"}],future:{keep:true}},revision=0;
  let pause:(()=>void)|null=null;let started:(()=>void)|null=null;
  const reached=new Promise<void>(resolve=>{started=resolve;});
  const release=new Promise<void>(resolve=>{pause=resolve;});
  globalThis.fetch=async(input,init)=>{
    if(String(input).includes("?protocol=2"))return Response.json({protocol:2,workspaceId:"browser-test-workspace",revision,data:remote});
    const body=JSON.parse(String(init!.body)) as SyncRequest;
    started!();await release;
    const result=mergeOperations(remote,body.operations,revision);remote=result.data;revision++;
    return Response.json({protocol:2,workspaceId:body.workspaceId,revision,...result});
  };
  navigator.onLine=true;
  const syncing=browser.sync();await reached;
  await browser.commitBrowserEdit(data=>({...data,tasks:data.tasks.map(task=>task.id==="one"?{...task,title:"Edited during network request"}:task)}));
  pause!();await syncing;
  const rebased=JSON.parse(storage.get("base_sync_v2")!);
  assert.equal(rebased.pending.length,1);
  assert.equal(rebased.document.tasks.find((task:{id:string})=>task.id==="one").title,"Edited during network request");
  assert.deepEqual(rebased.document.future,{keep:true});
  await browser.sync();assert.equal(browser.browserSyncStatus().pending,0);
  assert.equal(browser.browserSyncStatus().conflicts.length,0);
  assert.equal(remote.dailyRevenueTarget,200);
  assert.equal((remote.tasks as Document[]).find(task=>task.id==="one")?.title,"Edited during network request");
  assert.ok(diff({},remote).length>0);
  await browser.commitBrowserEdit(data=>({...data,tasks:data.tasks.map(task=>task.id==="one"?{...task,title:"Local conflict"}:task)}));
  (remote.tasks as Document[]).find(task=>task.id==="one")!.title="Remote conflict";revision++;
  await browser.sync();
  const conflict=browser.browserSyncStatus().conflicts[0];assert.ok(conflict);
  await browser.browserSyncStatus().resolveConflict(conflict.id,"local");
  await browser.sync();
  const resolved=JSON.parse(storage.get("base_sync_v2")!);
  assert.equal(resolved.conflicts.length,0,JSON.stringify({conflicts:resolved.conflicts,error:browser.browserSyncStatus().error}));assert.equal(resolved.resolvedConflicts.length,1);
  assert.equal(resolved.resolvedConflicts[0].remote.value,"Remote conflict");
  assert.equal(resolved.resolvedConflicts[0].operation.after.value,"Local conflict");
  assert.equal((remote.tasks as Document[]).find(task=>task.id==="one")!.title,"Local conflict");
});
