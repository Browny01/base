import test from "node:test";
import assert from "node:assert/strict";
import { importOperations } from "../packages/sync/src/import.ts";
import { mergeOperations, validOperation } from "../packages/sync/src/protocol.ts";
test("imported records preserve IDs and collide safely with cloud records",()=>{
  const local={tasks:[{id:"t",title:"local",future:true}]};
  const operations=importOperations(local,{tasks:[]});assert.ok(operations.every(validOperation));
  const result=mergeOperations({tasks:[{id:"t",title:"cloud"}]},operations,1);
  assert.equal(result.conflicts.length,1);assert.deepEqual(result.data.tasks,[{id:"t",title:"cloud"}]);
  assert.deepEqual(mergeOperations({tasks:[]},operations,1).data,local);
});
test("legacy pending deletes never remove cloud data without review",()=>{
  const source={document:{tasks:[]},pending:[{id:"old",collection:"tasks",recordId:"t",action:"delete"}]};
  const operations=importOperations({tasks:[]},{tasks:[]},source);assert.ok(operations.every(validOperation));
  const result=mergeOperations({tasks:[{id:"t"}]},operations,1);
  assert.equal(result.conflicts.length,1);assert.deepEqual(result.data.tasks,[{id:"t"}]);
});
test("a recreated record supersedes its earlier legacy deletion intent",()=>{
  const source={pending:[{collection:"tasks",recordId:"t",action:"delete"},{collection:"tasks",recordId:"t",action:"upsert"}]};
  const operations=importOperations({tasks:[{id:"t",title:"restored"}]},{tasks:[]},source);
  assert.equal(operations.length,1);assert.equal(operations[0].after.exists,true);
});
