import { NextRequest } from "next/server";
import type { NexusData } from "@/lib/store";
import { readRawData, sanitize, noteToText, isReadableNote } from "@/lib/mcp-data";
import { validateAccessToken } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const maxDuration = 30;

const SERVER_INFO = { name: "nexus", title: "Nexus — Personal Data", version: "1.0.0" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

// Accepts either the static MCP_TOKEN (Desktop/API clients) or an OAuth access
// token issued by /api/mcp/token (claude.ai web via the OAuth flow).
async function authorized(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const bearer = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const q = new URL(req.url).searchParams.get("token") || "";
  const staticToken = process.env.MCP_TOKEN;
  if (staticToken && (bearer === staticToken || q === staticToken)) return true;
  if (bearer && (await validateAccessToken(bearer))) return true;
  return false;
}

// ── Tools ─────────────────────────────────────────────────────────────────────────
type Tool = { name: string; description: string; inputSchema: object; run: (a: Record<string, unknown>, d: NexusData) => unknown };
const obj = (props: object = {}, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });

const TOOLS: Tool[] = [
  {
    name: "get_overview",
    description: "High-level snapshot of everything in the Nexus dashboard: counts per section and key stats. Start here.",
    inputSchema: obj(),
    run: (_a, d) => ({
      tasks: { total: d.tasks?.length ?? 0, open: (d.tasks ?? []).filter((t) => !t.done).length },
      habits: d.habits?.length ?? 0,
      goals: d.goals?.length ?? 0,
      projects: (d.projects ?? []).length,
      workouts: d.workouts?.length ?? 0,
      lockInSessions: d.lockInSessions?.length ?? 0,
      playerSkills: d.playerSkills?.length ?? 0,
      wallets: d.wallets?.length ?? 0,
      notes: { readable: (d.wikiPages ?? []).length, locked_hidden: 0 },
      folders: (d.wikiFolders ?? []).length,
      exams: d.exams?.length ?? 0,
    }),
  },
  { name: "get_tasks", description: "The user's tasks. Optionally filter by status ('open'|'done'|'all') or tag.", inputSchema: obj({ status: { type: "string", enum: ["open", "done", "all"] }, tag: { type: "string" } }),
    run: (a, d) => {
      let ts = d.tasks ?? [];
      if (a.status === "open") ts = ts.filter((t) => !t.done);
      else if (a.status === "done") ts = ts.filter((t) => t.done);
      if (typeof a.tag === "string") ts = ts.filter((t) => t.tag === a.tag);
      return ts;
    } },
  { name: "get_habits", description: "Habits being tracked plus their most recent completion logs.", inputSchema: obj(),
    run: (_a, d) => ({ habits: d.habits ?? [], recentLogs: [...(d.habitLogs ?? [])].slice(-60) }) },
  { name: "get_goals", description: "Goals grouped by period (daily / weekly / monthly / yearly).", inputSchema: obj(),
    run: (_a, d) => {
      const g = d.goals ?? [];
      return { daily: g.filter((x) => x.period === "daily"), weekly: g.filter((x) => x.period === "weekly"), monthly: g.filter((x) => x.period === "monthly"), yearly: g.filter((x) => x.period === "yearly") };
    } },
  { name: "get_finance", description: "Financial data: income/spending entries, totals, crypto wallets, and the latest portfolio value.", inputSchema: obj(),
    run: (_a, d) => {
      const e = d.incomeEntries ?? [];
      const income = e.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0);
      const spent = e.filter((x) => x.type === "spent").reduce((s, x) => s + x.amount, 0);
      const snaps = d.portfolioSnapshots ?? [];
      return { totals: { income, spent, net: income - spent }, dailyRevenueTarget: d.dailyRevenueTarget, entries: e, wallets: d.wallets ?? [], latestPortfolio: snaps[snaps.length - 1] ?? null };
    } },
  { name: "get_projects", description: "Projects with their milestones, notes and links.", inputSchema: obj(),
    run: (_a, d) => (d.projects ?? []).map((p) => ({ ...p, milestones: (d.milestones ?? []).filter((m) => m.projectId === p.id), notes: (d.projectNotes ?? []).filter((n) => n.projectId === p.id), links: (d.projectLinks ?? []).filter((l) => l.projectId === p.id) })) },
  { name: "get_workouts", description: "Gym workouts, most recent first. Optionally limit the count.", inputSchema: obj({ limit: { type: "number" } }),
    run: (a, d) => [...(d.workouts ?? [])].sort((x, y) => y.date.localeCompare(x.date)).slice(0, typeof a.limit === "number" ? a.limit : 20) },
  { name: "get_lockin", description: "Lock-In focus sessions (tasks, dates, completion). Summary of active and archived sessions.", inputSchema: obj(),
    run: (_a, d) => (d.lockInSessions ?? []).map((s) => ({ id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, archived: s.archived, tasks: s.tasks, completions: s.completions.length })) },
  { name: "get_player", description: "The user's self-improvement 'player' profile: skills, current/target scores, and domains.", inputSchema: obj(),
    run: (_a, d) => d.playerSkills ?? [] },
  { name: "get_school", description: "School data: exams, timetable, and school notes.", inputSchema: obj(),
    run: (_a, d) => ({ exams: d.exams ?? [], timetable: d.timetable ?? {}, notes: d.schoolNotes ?? [] }) },
  { name: "get_business", description: "Business metrics: social stats and KPIs.", inputSchema: obj(),
    run: (_a, d) => ({ socialStats: d.socialStats ?? [], kpis: d.businessKPIs ?? [] }) },
  {
    name: "list_notes",
    description: "List the user's notes pages (titles, folders, structure). Locked pages are never included. Use get_note for full content.",
    inputSchema: obj(),
    run: (_a, d) => {
      const folders = new Map((d.wikiFolders ?? []).map((f) => [f.id, f.name]));
      return {
        folders: (d.wikiFolders ?? []).map((f) => f.name),
        pages: (d.wikiPages ?? []).map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon, folder: p.folderId ? folders.get(p.folderId) ?? null : null, parentId: p.parentId, updatedAt: p.updatedAt })),
      };
    },
  },
  {
    name: "get_note",
    description: "Full plain-text content of a single notes page by id. Locked pages are private and will be refused.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    // Uses RAW data so it can detect (and refuse) locked pages explicitly.
    run: (a, d) => {
      const raw = (d as NexusData & { __raw?: NexusData }).__raw ?? d;
      const p = (raw.wikiPages ?? []).find((x) => x.id === a.id);
      if (!p || p.deletedAt) return { error: "not_found" };
      if (p.locked) return { error: "locked", message: "This note is locked; its contents are private and cannot be read." };
      return { id: p.id, title: p.title, icon: p.icon, description: p.description, content: noteToText(p) };
    },
  },
  {
    name: "search",
    description: "Search across notes (title + content), tasks, projects and goals for a keyword. Locked notes are excluded.",
    inputSchema: obj({ query: { type: "string" } }, ["query"]),
    run: (a, d) => {
      const q = String(a.query || "").toLowerCase();
      if (!q) return { matches: [] };
      const notes = (d.wikiPages ?? []).filter((p) => (p.title + " " + noteToText(p)).toLowerCase().includes(q)).map((p) => ({ type: "note", id: p.id, title: p.title || "Untitled" }));
      const tasks = (d.tasks ?? []).filter((t) => t.title.toLowerCase().includes(q)).map((t) => ({ type: "task", title: t.title, done: t.done }));
      const projects = (d.projects ?? []).filter((p) => (p.name + " " + p.description).toLowerCase().includes(q)).map((p) => ({ type: "project", name: p.name }));
      const goals = (d.goals ?? []).filter((g) => g.text.toLowerCase().includes(q)).map((g) => ({ type: "goal", text: g.text, period: g.period }));
      return { matches: [...notes, ...tasks, ...projects, ...goals] };
    },
  },
];

// ── Data (sanitized; get_note gets raw attached for its locked-check) ──────────────
let cache: { at: number; data: NexusData } | null = null;
async function loadData(): Promise<NexusData | null> {
  if (cache && Date.now() - cache.at < 3000) return cache.data;
  const raw = await readRawData();
  if (!raw) return null;
  const s = sanitize(raw) as NexusData & { __raw?: NexusData };
  s.__raw = raw; // internal handle for get_note's locked detection
  cache = { at: Date.now(), data: s };
  return s;
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────────────────
type RpcReq = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };
const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg: RpcReq): Promise<object | null> {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification (e.g. notifications/initialized) → no response

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: (params?.protocolVersion as string) || "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: SERVER_INFO,
        instructions: "Read-only access to the user's Nexus personal dashboard. Locked notes pages are private and excluded. Use get_overview first.",
      });
    case "ping": return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call": {
      const name = params?.name as string;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(id, -32602, `Unknown tool: ${name}`);
      const data = await loadData();
      if (!data) return ok(id, { content: [{ type: "text", text: "Nexus data store isn't configured (no Redis)." }], isError: true });
      try {
        const result = tool.run((params?.arguments as Record<string, unknown>) || {}, data);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: "Tool error: " + String(e) }], isError: true });
      }
    }
    case "resources/list": {
      const res = TOOLS.filter((t) => (t.inputSchema as { required?: string[] }).required?.length !== 1 && t.name !== "search" && t.name !== "get_note")
        .map((t) => ({ uri: `nexus://${t.name.replace(/^get_|^list_/, "")}`, name: t.name, description: t.description, mimeType: "application/json" }));
      return ok(id, { resources: res });
    }
    case "resources/read": {
      const uri = String(params?.uri || "");
      const key = uri.replace("nexus://", "");
      const tool = TOOLS.find((t) => t.name === `get_${key}` || t.name === `list_${key}`);
      if (!tool) return err(id, -32602, `Unknown resource: ${uri}`);
      const data = await loadData();
      if (!data) return err(id, -32000, "Data store not configured");
      return ok(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(tool.run({}, data), null, 2) }] });
    }
    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    // Point OAuth-capable clients (claude.ai) at the resource metadata so they
    // start the authorization flow.
    const origin = new URL(req.url).origin;
    return new Response(JSON.stringify(err(null, -32001, "Unauthorized.")), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        ...CORS,
      },
    });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return jsonResponse(err(null, -32700, "Parse error"), 400); }

  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as RpcReq[];
  const out: object[] = [];
  for (const m of msgs) {
    const r = await handle(m);
    if (r) out.push(r);
  }
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS });
  return jsonResponse(batch ? out : out[0]);
}

// MCP GET is for the optional server→client SSE stream; we don't offer one → 405.
// A plain browser visit gets a friendly info payload instead.
export function GET(req: NextRequest) {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) return new Response("SSE stream not supported (stateless server).", { status: 405, headers: CORS });
  const readable = process.env.MCP_TOKEN ? "configured" : "NOT configured (set MCP_TOKEN)";
  return jsonResponse({ name: SERVER_INFO.name, transport: "streamable-http (POST JSON-RPC)", auth: `Bearer token (${readable})`, tools: TOOLS.map((t) => t.name), note: "Connect an MCP client to this URL with your MCP_TOKEN as a Bearer token. Locked notes are excluded." });
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
