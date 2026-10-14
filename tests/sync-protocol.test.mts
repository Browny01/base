import assert from "node:assert/strict";
import test from "node:test";
import { absent, present, diff, mergeOperations, overlay, readSlot, writeSlot, validOperation, type Document, type Operation } from "../packages/sync/src/protocol.ts";
let sequence = 0;
const id = () => `op-${++sequence}`;
const seed = (): Document => ({ tasks: [{ id: "a", title: "before", done: false, unknown: { keep: 1 } }], future: { retained: true } });
test("path copies preserve the original snapshot and detach incoming values", () => {
  const before:Document={wikiPages:[{id:"p",blocks:[{id:"b",text:"old"}]},{id:"untouched",blocks:[]}],future:{keep:true}};
  const original=structuredClone(before);
  const incoming={text:"new",style:{bold:true}};
  const op:Operation={id:"copy",baseRevision:0,path:["wikiPages",{id:"p"},"blocks",{id:"b"},"text"],action:"set",before:present("old"),after:present(incoming)};
  const result=writeSlot(before,op)!;
  incoming.style.bold=false;
  assert.deepEqual(before,original);
  assert.deepEqual(readSlot(result,op.path),present({text:"new",style:{bold:true}}));
  assert.equal(result.future,before.future);
  assert.equal((result.wikiPages as Document[])[1],(before.wikiPages as Document[])[1]);
  const second=writeSlot(result,{...op,id:"second",after:present("again")})!;
  assert.deepEqual(readSlot(result,op.path),present({text:"new",style:{bold:true}}));
  assert.deepEqual(readSlot(second,op.path),present("again"));
  assert.deepEqual(before,original);
});
test("field patches merge disjoint concurrent edits and preserve unknown fields", () => {
  const base = seed();
  const local = structuredClone(base); (local.tasks as Document[])[0].title = "local";
  const remote = structuredClone(base); (remote.tasks as Document[])[0].done = true;
  const result = mergeOperations(remote, diff(base,local,id),1);
  assert.equal(result.conflicts.length,0);
  assert.deepEqual(result.data.tasks,[{id:"a",title:"local",done:true,unknown:{keep:1}}]);
  assert.deepEqual(result.data.future,{retained:true});
});
test("same-field conflicts preserve base, local and remote values", () => {
  const base=seed(); const local=structuredClone(base); const remote=structuredClone(base);
  (local.tasks as Document[])[0].title="local"; (remote.tasks as Document[])[0].title="remote";
  const result=mergeOperations(remote,diff(base,local,id),4);
  assert.equal(result.conflicts[0].operation.before.exists,true);
  assert.deepEqual(result.conflicts[0].remote,present("remote"));
  assert.deepEqual(result.conflicts[0].operation.after,present("local"));
  assert.equal((result.data.tasks as Document[])[0].title,"remote");
});
test("deleted records cannot be resurrected by stale nested edits", () => {
  const base=seed(); const local=structuredClone(base); (local.tasks as Document[])[0].title="edited";
  const result=mergeOperations({tasks:[]},diff(base,local,id),2);
  assert.equal(result.applied.length,0); assert.equal(result.conflicts.length,1);
  assert.deepEqual(result.data.tasks,[]);
});
test("delete versus concurrent edit is a conflict, never a silent delete", () => {
  const base=seed(); const remote=structuredClone(base); (remote.tasks as Document[])[0].title="concurrent";
  const result=mergeOperations(remote,diff(base,{...base,tasks:[]},id),3);
  assert.equal(result.conflicts.length,1); assert.equal((result.data.tasks as Document[]).length,1);
});
test("retry creates one record and retrying already-applied values is safe", () => {
  const before={tasks:[]}; const after={tasks:[{id:"b",title:"new"}]}; const operations=diff(before,after,id);
  const first=mergeOperations(before,operations,0); const second=mergeOperations(first.data,operations,1);
  assert.deepEqual(second.data,after); assert.equal(second.conflicts.length,0);
});
test("nested block edits merge and explicit reorder preserves concurrent additions", () => {
  const before: Document={wikiPages:[{id:"p",blocks:[{id:"a",text:"A"},{id:"b",text:"B"}]}]};
  const after: Document={wikiPages:[{id:"p",blocks:[{id:"b",text:"B"},{id:"a",text:"changed"}]}]};
  const operations=diff(before,after,id);
  assert.ok(operations.every(validOperation));
  assert.deepEqual(mergeOperations(before,operations,0).data,after);
  const remote=structuredClone(before); ((remote.wikiPages as Document[])[0].blocks as Document[]).push({id:"c",text:"concurrent"});
  const merged=mergeOperations(remote,operations,1);
  assert.equal(merged.conflicts.length,1,"concurrent array ordering requires review");
  assert.equal((((merged.data.wikiPages as Document[])[0]).blocks as Document[]).length,3);
});
test("all supported roots persist offline edits including non-ID arrays", () => {
  const before:Document={calendarEvents:[],shoppingList:[],watchList:[],readingList:[],projectFiles:[],portfolioSnapshots:[],bodyMetrics:{weightLog:[]},dailyRevenueTarget:100};
  const after:Document={calendarEvents:[{id:"e"}],shoppingList:[{id:"s"}],watchList:[{id:"w"}],readingList:[{id:"r"}],projectFiles:[{id:"f",future:true}],portfolioSnapshots:[{date:"2026-10-11",value:100}],bodyMetrics:{weightLog:[{date:"2026-10-11",kg:80}]},dailyRevenueTarget:200};
  const operations=diff(before,after,id);
  assert.ok(operations.every(validOperation)); assert.deepEqual(overlay(before,operations),after);
});
test("operations reject prototype pollution, malformed paths and identity changes", () => {
  const good:Operation={id:"safe",baseRevision:0,path:["tasks",{id:"a"},"title"],action:"set",before:absent,after:present("a")};
  assert.equal(validOperation(good),true);
  for(const path of [["__proto__"],["tasks","constructor"],["tasks",{id:"a"},"id"],["apiKey"],[]]) assert.equal(validOperation({...good,path}),false);
  assert.equal(validOperation({...good,after:present(JSON.parse('{"__proto__":{"polluted":true}}'))}),false);
  assert.equal(validOperation({...good,baseRevision:-1}),false);
  assert.deepEqual(readSlot({},["tasks",{id:"missing"}]),absent);
});
test("random record edits round-trip through diff and apply without losing fields", () => {
  let random=42; const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
  for(let run=0;run<100;run++) {
    const before:Document={tasks:Array.from({length:20},(_,i)=>({id:`t${i}`,title:`task${i}`,done:false,future:i}))};
    const after=structuredClone(before); const rows=after.tasks as Document[];
    rows[next()%rows.length].done=true; rows[next()%rows.length].title="changed"; rows.splice(next()%rows.length,1); rows.push({id:`new${run}`,title:"new",done:false}); rows.reverse();
    const operations=diff(before,after,id);
    assert.ok(operations.every(validOperation)); assert.deepEqual(mergeOperations(before,operations,0).data,after);
  }
});
