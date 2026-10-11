/** Isolated HTTP fixture for testing the real desktop transport and API routes.
 * Never loads .env.local or connects to production. All persistence is in RAM. */
import { createServer } from "node:http";
import { NextRequest } from "next/server.js";
import { FakeRedis } from "./fake-redis.mts";
import { POST as login } from "../../app/api/auth/login/route.ts";
import { POST as sync } from "../../app/api/native/sync/route.ts";
import { POST as chunk } from "../../app/api/native/sync/chunk/route.ts";
import { GET as session, DELETE as logout } from "../../app/api/auth/desktop/route.ts";

const redis = new FakeRedis();
redis.values.set("base:data",{ tasks:[{id:"cloud-task",title:"Cloud fixture task",done:false,priority:"P2",tag:"work",dueDate:null,recurring:null,createdAt:"2026-10-11T00:00:00Z"}], profile:{name:"Native Test",timezone:"UTC",timezoneOffsetMinutes:0,onboardedAt:"2026-10-11T00:00:00Z"}, future:{retained:true} });
const encode = (value:unknown) => value !== null && typeof value === "object" ? JSON.stringify(value) : value;
const redisServer=createServer(async(req,res)=>{
  let body="";for await(const part of req)body+=part;
  async function execute(command:unknown[]) {
    const [name,key,value,...options]=command;
    switch(String(name).toUpperCase()) {
      case "GET":return {result:encode(await redis.get(String(key)))};
      case "SET":await redis.set(String(key),value,{nx:options.some(v=>String(v).toUpperCase()==="NX")});return {result:"OK"};
      case "DEL":return {result:redis.values.delete(String(key))?1:0};
      case "MGET":return {result:(await redis.mget(...command.slice(1).map(String))).map(encode)};
      case "HMGET":return {result:command.slice(2).map(field=>redis.hashes.get(String(key))?.get(String(field))??null)};
      case "EVAL":{
        const count=Number(value),keys=command.slice(3,3+count).map(String),args=command.slice(3+count).map(String);
        return {result:await redis.eval(String(key),keys,args)};
      }
      default:return {error:`Unsupported fixture command ${String(name)}`};
    }
  }
  try {
    const decoded=JSON.parse(body) as unknown[];
    const result=Array.isArray(decoded[0])?await Promise.all(decoded.map(command=>execute(command as unknown[]))):await execute(decoded);
    res.setHeader("content-type","application/json");res.end(JSON.stringify(result));
  } catch {res.statusCode=500;res.end(JSON.stringify({error:"Fixture Redis request failed"}));}
});
await new Promise<void>(resolve=>redisServer.listen(3457,"127.0.0.1",resolve));
process.env.UPSTASH_REDIS_REST_URL="http://127.0.0.1:3457";
process.env.UPSTASH_REDIS_REST_TOKEN="fixture-redis-token";
process.env.BASE_PASSWORD="fixture-password";
delete process.env.BASE_PASSWORD_HASH;delete process.env.BRIDGE_PASSWORD_HASH;
process.env.BASE_SESSION_SECRET="fixture-session-signing-key";
let offline=false;
const service=createServer(async(req,res)=>{
  let body="";for await(const part of req)body+=part;
  const pathname=new URL(req.url!,"http://127.0.0.1:3456").pathname;
  if(pathname==="/test/control"){
    if(req.method==="POST") {
      const control=JSON.parse(body);if(typeof control.offline==="boolean")offline=control.offline;
      if(control.patch){const data=typeof redis.values.get("base:data")==="string"?JSON.parse(String(redis.values.get("base:data"))):redis.values.get("base:data");redis.values.set("base:data",{...(data as object),...control.patch});redis.values.set("base:data:revision",String(Number(redis.values.get("base:data:revision")??0)+1));}
    }
    res.setHeader("content-type","application/json");res.end(JSON.stringify({offline,data:redis.values.get("base:data"),revision:redis.values.get("base:data:revision")}));return;
  }
  if(offline){res.statusCode=503;res.end('{"error":"Fixture network outage"}');return;}
  try {
    const request=new NextRequest(`http://127.0.0.1:3456${req.url}`,{method:req.method,headers:new Headers(req.headers as Record<string,string>),...(req.method!=="GET"?{body}:{})});
    const response=pathname==="/api/auth/login"?await login(request):pathname==="/api/native/sync"?await sync(request):pathname==="/api/native/sync/chunk"?await chunk(request):pathname==="/api/auth/desktop"?req.method==="DELETE"?await logout(request):await session(request):Response.json({ok:true,articles:[]});
    res.statusCode=response.status;for(const [key,value]of response.headers)res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
});
await new Promise<void>(resolve=>service.listen(3456,"127.0.0.1",resolve));
console.log("Isolated native fixture listening at http://127.0.0.1:3456 (no production access).");
process.on("SIGTERM",()=>{service.closeAllConnections();redisServer.closeAllConnections();service.close();redisServer.close();});
