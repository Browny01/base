import test from "node:test";
import assert from "node:assert/strict";
import { syncV2 } from "../lib/sync-v2-server.ts";
import { expandOperations, chunkKey } from "../lib/staged-sync.ts";
import { createHash } from "node:crypto";
import { safeWriteBaseData, StaleBaseWriteError } from "../lib/autonomy-persistence.ts";
import type { BaseData } from "../lib/store.ts";
import { diff, type Document, type SyncRequest } from "../packages/sync/src/protocol.ts";
import { FakeRedis } from "./support/fake-redis.mts";
const request=(operations:SyncRequest["operations"],cursor=0):SyncRequest=>({protocol:2,workspaceId:"workspace-test",cursor,operations});
test("receipt prevents a delayed retry from overwriting subsequent remote edits",async()=>{
  const redis=new FakeRedis();const initial:Document={tasks:[{id:"t",title:"before"}]};redis.values.set("base:data",initial);
  const ops=diff(initial,{tasks:[{id:"t",title:"local"}]});
  const first=await syncV2(redis.redis(),request(ops));assert.equal(first.applied.length,1);
  redis.values.set("base:data",{tasks:[{id:"t",title:"later"}]});redis.values.set("base:data:revision","2");
  const retried=await syncV2(redis.redis(),request(ops));assert.deepEqual(retried.data?.tasks,[{id:"t",title:"later"}]);assert.equal(redis.writes,1);
});
test("legacy whole-document writers cannot overwrite a newer desktop revision",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",{tasks:[],dataRevision:2,future:{keep:true}});
  await assert.rejects(()=>safeWriteBaseData(redis.redis(),{tasks:[],dataRevision:1} as unknown as BaseData,false),StaleBaseWriteError);
  assert.deepEqual(redis.values.get("base:data"),{tasks:[],dataRevision:2,future:{keep:true}});
});
test("server atomically retries contention and merges the concurrent field",async()=>{
  const redis=new FakeRedis();const initial:Document={tasks:[{id:"t",title:"before",done:false}]};redis.values.set("base:data",initial);
  redis.onContention=()=>{redis.values.set("base:data",{tasks:[{id:"t",title:"before",done:true}]});redis.values.set("base:data:revision","1");};
  const result=await syncV2(redis.redis(),request(diff(initial,{tasks:[{id:"t",title:"new",done:false}]})));
  assert.deepEqual(result.data?.tasks,[{id:"t",title:"new",done:true}]);assert.equal(result.revision,2);
});
test("delete tombstones survive cursor advancement across queued batches",async()=>{
  const redis=new FakeRedis();const initial:Document={tasks:[{id:"t",title:"old"}]};redis.values.set("base:data",initial);
  const deletion=await syncV2(redis.redis(),request(diff(initial,{tasks:[]})));
  const oldCreate=diff({tasks:[]},initial,()=>"old-create",0);
  const result=await syncV2(redis.redis(),request(oldCreate,deletion.revision));
  assert.equal(result.conflicts[0].reason,"tombstone");assert.deepEqual(result.data?.tasks,[]);
  const restored=await syncV2(redis.redis(),request(diff({tasks:[]},initial,()=>"explicit-restore",result.revision),result.revision));
  assert.equal(restored.conflicts.length,0);assert.deepEqual(restored.data?.tasks,initial.tasks);
});
test("receipt rejects a reused ID with different content",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",{tasks:[]});
  const ops=diff({tasks:[]},{tasks:[{id:"t",title:"a"}]});await syncV2(redis.redis(),request(ops));
  await assert.rejects(()=>syncV2(redis.redis(),request([{...ops[0],after:{exists:true,value:{id:"t",title:"tampered"}}}])),/reused/);
});
test("receipts accept equivalent operations with reordered JSON object keys",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",{tasks:[]});
  const ops=diff({tasks:[]},{tasks:[{id:"t",title:"original",future:{b:2,a:1}}]});
  await syncV2(redis.redis(),request(ops));
  const reverse=(value:unknown):unknown=>Array.isArray(value)?value.map(reverse):value!==null&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
  const retry=await syncV2(redis.redis(),request(reverse(ops) as SyncRequest["operations"]));
  assert.deepEqual(retry.applied,[ops[0].id]);assert.equal(redis.writes,1);
  assert.deepEqual(retry.data?.tasks,[{id:"t",title:"original",future:{b:2,a:1}}]);
});
test("owner and autonomy execution protections remain enforced",async()=>{
  const redis=new FakeRedis();const initial:Document={tasks:[{id:"t",title:"Autonomy",tag:"night-auto",done:false,executionState:"queued",executionOwner:"agent"}],autonomySettings:{paused:true}};
  redis.values.set("base:data",initial);
  const changed=structuredClone(initial);(changed.tasks as Document[])[0].done=true;(changed.autonomySettings as Document).paused=false;
  const result=await syncV2(redis.redis(),request(diff(initial,changed)));
  assert.equal(result.applied.length,0);assert.equal(result.conflicts.length,2);assert.deepEqual(result.data,initial);
});
test("unchanged pull does not write or retransmit a full snapshot",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",{tasks:[]});redis.values.set("base:data:revision","5");
  const result=await syncV2(redis.redis(),request([],5));assert.equal(result.data,undefined);assert.equal(redis.writes,0);
});
test("first pull includes legacy data even when both cursors are zero",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",{tasks:[{id:"legacy",title:"retained"}]});
  const result=await syncV2(redis.redis(),{...request([]),full:true});
  assert.deepEqual(result.data?.tasks,[{id:"legacy",title:"retained"}]);assert.equal(redis.writes,0);
});
test("staged attachments verify integrity and preserve Unicode across byte chunks",async()=>{
  const redis=new FakeRedis();const operations=diff({projectFiles:[]},{projectFiles:[{id:"f",dataUrl:"💾".repeat(300_000)}]});
  const bytes=Buffer.from(JSON.stringify(operations[0]));const uploadId=createHash("sha256").update(bytes).digest("hex");
  const size=750_000,parts=Math.ceil(bytes.length/size);
  for(let i=0;i<parts;i++)redis.values.set(chunkKey("workspace",uploadId,i),bytes.subarray(i*size,(i+1)*size).toString("base64"));
  assert.deepEqual(await expandOperations(redis.redis(),"workspace",[{id:operations[0].id,uploadId,parts}]),operations);
  await assert.rejects(()=>expandOperations(redis.redis(),"other-workspace",[{id:operations[0].id,uploadId,parts}]),/expired/);
  redis.values.set(chunkKey("workspace",uploadId,0),"corrupted");
  await assert.rejects(()=>expandOperations(redis.redis(),"workspace",[{id:operations[0].id,uploadId,parts}]),/integrity/);
});
