import {test} from 'node:test';
import assert from 'node:assert/strict';
import {responseOf} from '../apps/desktop/src/native.ts';
test('native no-content responses do not trigger forbidden-body browser exceptions',async()=>{
 for(const status of [204,205,304]) {
  assert.throws(()=>new Response(new Uint8Array(),{status}));
  const response=responseOf({status,contentType:'application/json',bodyBase64:'',cached:false});
  assert.equal(response.status,status);assert.equal(response.body,null);assert.equal(await response.text(),'');
 }
});
test('native response conversion preserves UTF-8 bytes, status and cached headers',async()=>{
 const response=responseOf({status:200,contentType:'application/json',bodyBase64:Buffer.from(JSON.stringify({text:'café'})).toString('base64'),cached:true});
 assert.deepEqual(await response.json(),{text:'café'});assert.equal(response.headers.get('X-Base-Cached'),'1');
});
