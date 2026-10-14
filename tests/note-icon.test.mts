import assert from "node:assert/strict";
import test from "node:test";
import { isNoteImage, createNoteIcon } from "../lib/note-icon.ts";

test("note icons accept bounded PNG data and reject external or active image sources",()=>{
  assert.equal(isNoteImage("data:image/png;base64,aGVsbG8="),true);
  for(const icon of ["📄","https://example.com/icon.png","data:image/svg+xml;base64,aGVsbG8=","data:image/png;base64,\" onerror=alert(1)","data:image/png;base64,"+"a".repeat(100_000)])assert.equal(isNoteImage(icon),false);
});
test("icon uploads reject unsupported types and oversized files before decoding",async()=>{
  await assert.rejects(createNoteIcon(new File(["<svg></svg>"],"icon.svg",{type:"image/svg+xml"})),/Choose a PNG/);
  await assert.rejects(createNoteIcon(new File([new Uint8Array(10_000_001)],"large.png",{type:"image/png"})),/under 10 MB/);
});
