import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("the configured desktop environment loads the existing D3 chart dependency",()=>{
  const config=JSON.parse(readFileSync(new URL("../apps/desktop/src-tauri/tauri.conf.json",import.meta.url),"utf8"));
  const result=spawnSync(process.execPath,["--input-type=module","-e",`${config.app.security.freezePrototype?"Object.freeze(Object.prototype);":""} const {rgb}=await import('d3-color'); if(rgb('red').formatHex()!=='#ff0000')process.exit(1);`],{cwd:new URL("..",import.meta.url),encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
});
