import test from "node:test";
import assert from "node:assert/strict";
import { syncV2 } from "../lib/sync-v2-server.ts";
import { diff, mergeOperations, readSlot, type Document } from "../packages/sync/src/protocol.ts";
import { isRecovery, recoverSnapshot } from "../packages/sync/src/recovery.ts";
import { FakeRedis } from "./support/fake-redis.mts";

const remote:Document={tasks:[{id:"existing",title:"Server title",future:{keep:true}},{id:"new-server",title:"New on server"}],futureRoot:{server:true}};
test("a server rollback returns an explicit snapshot without writing receipts or acknowledging an outbox",async()=>{
  const redis=new FakeRedis();redis.values.set("base:data",remote);redis.values.set("base:data:revision","1");
  const operations=diff({tasks:[]},{tasks:[{id:"offline",title:"Keep me"}]});
  const response=await syncV2(redis.redis(),{protocol:2,workspaceId:"same-account",cursor:9,operations});
  assert.ok(isRecovery(response,9));assert.deepEqual(response.data,remote);
  assert.deepEqual(response.applied,[]);assert.deepEqual(response.conflicts,[]);assert.equal(redis.writes,0);
  assert.deepEqual(redis.values.get("base:data"),remote);
});
test("reset recovery retains acknowledged and offline records, explicit deletions and new server records",()=>{
  const ancestor:Document={tasks:[{id:"existing",title:"Cached title"},{id:"acknowledged",title:"Previously synced"},{id:"deleted",title:"Delete this"}]};
  const local:Document={tasks:[{id:"existing",title:"Offline title"},{id:"acknowledged",title:"Previously synced"},{id:"offline",title:"Created offline"}],opaque:{retain:true}};
  const pending=diff(ancestor,local,()=>crypto.randomUUID(),9);
  const reset={...remote,tasks:[...(remote.tasks as Document[]),{id:"deleted",title:"Delete this"}]};
  const recovered=recoverSnapshot(local,pending,reset,1);
  const rows=recovered.document.tasks as Document[];
  assert.equal(rows.find(row=>row.id==="existing")?.title,"Offline title");
  assert.ok(rows.some(row=>row.id==="new-server"));assert.ok(rows.some(row=>row.id==="acknowledged"));assert.ok(rows.some(row=>row.id==="offline"));assert.ok(!rows.some(row=>row.id==="deleted"));
  assert.deepEqual(recovered.document.opaque,{retain:true});assert.deepEqual(recovered.document.futureRoot,{server:true});
  assert.ok(recovered.conflicts.every(c=>c.reason==="server-reset"&&c.operation.requiresReview));
  const merged=mergeOperations(reset,recovered.conflicts.map(c=>c.operation),1);
  assert.equal(merged.applied.length,0);assert.deepEqual(merged.data,reset);
});
test("recovery markers cannot bypass revision or acknowledgement validation",()=>{
  const response={protocol:2 as const,workspaceId:"same-account",revision:1,data:remote,applied:[],conflicts:[],recovery:{reason:"server-reset" as const,previousRevision:9}};
  assert.ok(isRecovery(response,9));assert.equal(isRecovery(response,8),false);
  assert.equal(isRecovery({...response,revision:9},9),false);
  assert.equal(isRecovery({...response,revision:-1},9),false);
  assert.equal(isRecovery({...response,applied:["offline"]},9),false);
  assert.equal(isRecovery({...response,data:undefined},9),false);
});
test("recovery skips matching records and never infers a deletion from absence in the old cache",()=>{
  const recovered=recoverSnapshot({tasks:[{id:"existing",title:"Server title",future:{keep:true}}]},[],remote,1);
  assert.equal(recovered.conflicts.length,0);assert.ok(readSlot(recovered.document,["tasks",{id:"new-server"}]).exists);
});

test("reset recovery does not turn normalized, unedited UI defaults into conflicts",()=>{
  const baseline:Document={tasks:[{id:"acknowledged",title:"Saved"}]};
  const local:Document={...baseline,dailyRevenueTarget:100,autonomySettings:{enabled:true},businessKPIs:[{id:"default",value:"0"}]};
  const recovered=recoverSnapshot(local,[],{tasks:[]},0,undefined,baseline);
  assert.deepEqual(recovered.conflicts.map(c=>c.operation.path[0]),["tasks"]);
  assert.deepEqual(recovered.document.businessKPIs,local.businessKPIs);
});
