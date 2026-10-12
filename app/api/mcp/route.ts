import {NextRequest} from "next/server";
import {createMcpEngine,SERVER_INFO} from "@/packages/server/src/mcp";
import {claimAutonomyTask,readRawData,reapExpiredAutonomyLeasesAtomic,submitAutonomyResult,writeRawData} from "@/lib/mcp-data";
import {validateAccessToken} from "@/lib/mcp-oauth";
export const runtime="nodejs";
export const maxDuration=30;
const engine=createMcpEngine({claimAutonomyTask,readRawData,reapExpiredAutonomyLeasesAtomic,submitAutonomyResult,writeRawData});
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version"};
const err=(id:unknown,code:number,message:string)=>({jsonrpc:"2.0",id,error:{code,message}});
async function authorized(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const bearer = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const q = new URL(req.url).searchParams.get("token") || "";
  const staticToken = process.env.MCP_TOKEN;
  if (staticToken && (bearer === staticToken || q === staticToken)) return true;
  return !!bearer && await validateAccessToken(bearer);
}

function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } }); }

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    const origin = new URL(req.url).origin;
    return new Response(JSON.stringify(err(null, -32001, "Unauthorized.")), { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, ...CORS } });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return jsonResponse(err(null, -32700, "Parse error"), 400); }
  const batch = Array.isArray(body);
  const responses: object[] = [];
  for (const message of (batch ? body : [body]) as Parameters<typeof engine.handle>[0][]) {
    const response = await engine.handle(message);
    if (response) responses.push(response);
  }
  if (!responses.length) return new Response(null, { status: 202, headers: CORS });
  return jsonResponse(batch ? responses : responses[0]);
}

export function GET(req: NextRequest) {
  if ((req.headers.get("accept") || "").includes("text/event-stream")) return new Response("SSE stream not supported (stateless server).", { status: 405, headers: CORS });
  const configured = process.env.MCP_TOKEN ? "configured" : "NOT configured (set MCP_TOKEN)";
  return jsonResponse({ name: SERVER_INFO.name, transport: "streamable-http (POST JSON-RPC)", auth: `Bearer token (${configured})`, tools: engine.toolNames, note: "Agents can edit Base data through validated tools. Locked Notes are always excluded and protected." });
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
