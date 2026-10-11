import assert from "node:assert/strict";
import test from "node:test";
import { makePasswordVerifier } from "../lib/vault.ts";
import { verifyStoredPassword, parseVerifier } from "../lib/auth-store.ts";
import { signSession, verifySession } from "../lib/session.ts";
import { DESKTOP_API_PATHS } from "../lib/desktop-api-paths.ts";
test("onboarding Web Crypto verifier accepts correct password and rejects wrong or damaged values", async () => {
  const verifier=await makePasswordVerifier("test-only-password");
  assert.equal(await verifyStoredPassword("test-only-password",verifier),true);
  assert.equal(await verifyStoredPassword("wrong",verifier),false);
  assert.equal(await verifyStoredPassword("test-only-password",{...verifier,hash:"broken"}),false);
  assert.equal(parseVerifier("pbkdf2-aesgcm:1:a:b:c"),null);
});
test("legacy cookie signing remains compatible, expiring and fail-closed",async()=>{
  const previous=process.env.BASE_SESSION_SECRET;
  process.env.BASE_SESSION_SECRET="test-session-secret-never-used-in-production";
  try {
    const token=await signSession(); assert.ok(token);
    assert.equal(await verifySession(token),true); assert.equal(await verifySession(`${token}tampered`),false);
    assert.equal(await verifySession((await signSession(-1))!),false);
  } finally { if(previous===undefined) delete process.env.BASE_SESSION_SECRET; else process.env.BASE_SESSION_SECRET=previous; }
});
test("desktop transport cannot authorize agent, MCP, cron or production document replacement",()=>{
  for(const path of ["/api/agent/tasks","/api/mcp","/api/cron/snapshot","/api/setup","/api/data"]) assert.equal(DESKTOP_API_PATHS.has(path),false);
  assert.equal(DESKTOP_API_PATHS.has("/api/native/sync"),true);
});
