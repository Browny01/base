import test from "node:test";
import assert from "node:assert/strict";
import { installNoteVerifier, verifyNotePassword } from "../lib/note-lock.ts";
test("note unlocking verifies through authentication or the installed native verifier",async()=>{
  let calls=0;
  globalThis.fetch=async(_input,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.deepEqual(Object.keys(body),["password"]);return Response.json({}, {status:body.password==="account-password"?200:401});};
  assert.equal(await verifyNotePassword(""),false);assert.equal(calls,0);
  assert.equal(await verifyNotePassword("wrong-password"),false);
  assert.equal(await verifyNotePassword("account-password"),true);
  globalThis.fetch=async()=>Response.json({},{status:429});
  await assert.rejects(()=>verifyNotePassword("account-password"),/unavailable/);
  installNoteVerifier(async password=>password==="offline-password");
  assert.equal(await verifyNotePassword("offline-password"),true);
  assert.equal(await verifyNotePassword("wrong-password"),false);
});
