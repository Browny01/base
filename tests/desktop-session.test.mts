import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { issueDesktopSession, readDesktopSession, revokeDesktopSession, workspaceIdentity } from "../lib/desktop-session.ts";
import { POST as login } from "../app/api/auth/login/route.ts";
import { NextRequest } from "next/server.js";
test("desktop login, device sessions, revocation and expiry use isolated persistence and preserve cookie auth",async()=>{
  const values=new Map<string,unknown>();
  const server=createServer(async(req,res)=>{
    let body="";for await(const chunk of req)body+=chunk;
    const decoded=JSON.parse(body) as unknown[];
    function execute(command: unknown[]) {
    const [name,key,value,...options]=command;
    let result:unknown=null;
    switch(String(name).toUpperCase()) {
      case "GET":result=values.get(String(key))??null;break;
      case "SET":if(!options.includes("nx")&&!options.includes("NX")||!values.has(String(key)))values.set(String(key),value);result="OK";break;
      case "DEL":result=values.delete(String(key))?1:0;break;
      default: return { error: `Unexpected test command ${String(name)}` };
    }
    return {result};
    }
    const result=Array.isArray(decoded[0])?decoded.map(command=>execute(command as unknown[])):execute(decoded);
    res.setHeader("content-type","application/json");res.end(JSON.stringify(result));
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const envKeys=["UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","BASE_PASSWORD","BASE_PASSWORD_HASH","BASE_SESSION_SECRET"];
  const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  const address=server.address() as {port:number};
  process.env.UPSTASH_REDIS_REST_URL=`http://127.0.0.1:${address.port}`;process.env.UPSTASH_REDIS_REST_TOKEN="test-only-redis-token";
  process.env.BASE_PASSWORD="test-password";delete process.env.BASE_PASSWORD_HASH;process.env.BASE_SESSION_SECRET="test-only-signing-key";
  try {
    const request=(body:unknown,origin?:string)=>new NextRequest("https://base.test/api/auth/login",{method:"POST",headers:{host:"base.test","content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify(body)});
    assert.equal((await login(request({password:"wrong"}))).status,401);
    assert.equal((await login(request({password:"test-password"},"https://evil.test"))).status,403);
    const web=await login(request({password:"test-password"}));assert.equal(web.status,200);assert.match(web.headers.get("set-cookie")!,/base_auth=/);assert.equal((await web.json()).token,undefined);
    const desktop=await login(request({password:"test-password",client:"desktop",deviceId:"device-test-123456789"}));assert.equal(desktop.status,200);
    const session=await desktop.json();assert.match(session.token,/^base_desktop_/);
    const auth=new Request("https://base.test/api/native/sync",{headers:{authorization:`Bearer ${session.token}`}});
    assert.equal((await readDesktopSession(auth))?.deviceId,"device-test-123456789");
    const other=await issueDesktopSession("other-device-123456");assert.ok(other);assert.notEqual(other.token,session.token.slice("base_desktop_".length));assert.equal(other.workspaceId,session.workspaceId);
    assert.equal(await workspaceIdentity(),session.workspaceId);
    assert.ok([...values.keys()].every(key=>!key.includes(session.token)),"only token hashes are stored");
    await revokeDesktopSession(auth);assert.equal(await readDesktopSession(auth),null);
    const otherAuth=new Request("https://base.test/api/native/sync",{headers:{authorization:`Bearer base_desktop_${other.token}`}});
    assert.ok(await readDesktopSession(otherAuth));
    const sessionKey=[...values.keys()].find(key=>key.startsWith("base:desktop:session:"))!;
    const stored=JSON.parse(String(values.get(sessionKey)));values.set(sessionKey,JSON.stringify({...stored,expiresAt:1}));
    assert.equal(await readDesktopSession(otherAuth),null);
  } finally {
    for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
