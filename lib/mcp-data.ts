// Server-side data access + sanitization for the MCP server.
// The golden rule: locked (and trashed) notes pages must NEVER leave this file.

import { Redis } from "@upstash/redis";
import type { BridgeData, WikiBlock, WikiPage } from "@/lib/store";
import { DATA_KEY } from "@/lib/bridge-data";
import { LUA_JSON_ARRAY_HELPERS, safeWriteBridgeData } from "@/lib/autonomy-persistence";

const KEY = DATA_KEY;

export function mcpRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function readRawData(): Promise<BridgeData | null> {
  const redis = mcpRedis();
  if (!redis) return null;
  let data = await redis.get(KEY);
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { /* leave as-is */ } }
  return (data as BridgeData) ?? null;
}

// MCP writes deliberately go through the same Redis key as the web app. The
// route handler keeps the current raw state around while applying a mutation,
// so protected notes are retained even though they are never returned to MCP.
export async function writeRawData(data: BridgeData): Promise<boolean> {
  const redis = mcpRedis();
  if (!redis) return false;
  await safeWriteBridgeData(redis, data, true);
  return true;
}

export type AtomicAutonomyResult = { ok: boolean; error?: string; task?: Record<string, unknown>; runId?: string };

const CLAIM_AUTONOMY_LUA = String.raw`
${LUA_JSON_ARRAY_HELPERS}
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ok=false,error="Bridge data is not configured."}) end
local data = decodeJson(raw)
local tasks = data.tasks == EMPTY_ARRAY and {} or data.tasks or {}
local settings = data.autonomySettings
if type(settings) ~= "table" or settings == EMPTY_ARRAY then settings = {} end
if settings.maxConcurrentWorkers == nil then settings.maxConcurrentWorkers = 1 end
if settings.dailyRunLimit == nil then settings.dailyRunLimit = 6 end
if settings.workingHoursStart == nil then settings.workingHoursStart = "09:00" end
if settings.workingHoursEnd == nil then settings.workingHoursEnd = "23:00" end
if settings.timezoneOffsetMinutes == nil then settings.timezoneOffsetMinutes = 480 end
if settings.allowedTaskClasses == nil then settings.allowedTaskClasses = {"research", "planning", "implementation", "review", "operations"} elseif settings.allowedTaskClasses == EMPTY_ARRAY then settings.allowedTaskClasses = {} end
if settings.allowedWorkspaces == nil then settings.allowedWorkspaces = {"Bridge", "Dropshipping", "Systemly", "ProductDeck", "StreamSpark"} elseif settings.allowedWorkspaces == EMPTY_ARRAY then settings.allowedWorkspaces = {} end
if settings.enabled == false then return cjson.encode({ok=false,error="Autonomy is paused."}) end
local target = nil
local running = 0
local todayRuns = 0
local done = {}
for _, t in ipairs(tasks) do
  if t.id == ARGV[1] then target = t end
  if t.executionState == "in_progress" then running = running + 1 end
  if t.executionStartedAt and string.sub(t.executionStartedAt,1,10) == ARGV[6] then todayRuns = todayRuns + 1 end
  if t.done == true or t.executionState == "completed" then done[t.id] = true end
end
if not target then return cjson.encode({ok=false,error="Task not found."}) end
if target.executionState == "in_progress" and target.executionId == ARGV[2] then return encodeJson({ok=true,task=target,runId=ARGV[2]}) end
if target.done == true or target.executionState ~= "queued" then return cjson.encode({ok=false,error="Task is not queued."}) end
local capacity = tonumber(settings.maxConcurrentWorkers) or 1
if capacity > 3 then capacity = 3 end
if running >= capacity then return cjson.encode({ok=false,error="Worker capacity is full."}) end
local dailyLimit = tonumber(settings.dailyRunLimit) or 6
if todayRuns >= dailyLimit then return cjson.encode({ok=false,error="Daily run limit reached."}) end
local function hhmm(value)
  if type(value) ~= "string" then return nil end
  local hour, minute = string.match(value, "^(%d%d):(%d%d)$")
  if not hour then return nil end
  return tonumber(hour) * 60 + tonumber(minute)
end
local windowStart = hhmm(settings.workingHoursStart)
local windowEnd = hhmm(settings.workingHoursEnd)
if windowStart and windowEnd and windowStart ~= windowEnd then
  local localMinute = (tonumber(ARGV[8]) + (tonumber(settings.timezoneOffsetMinutes) or 480)) % 1440
  local inside = windowStart < windowEnd and localMinute >= windowStart and localMinute < windowEnd or windowStart > windowEnd and (localMinute >= windowStart or localMinute < windowEnd)
  if not inside then return cjson.encode({ok=false,error="Outside the allowed working window."}) end
end
if target.dependencyIds and target.dependencyIds ~= EMPTY_ARRAY then
  for _, dep in ipairs(target.dependencyIds) do if not done[dep] then return cjson.encode({ok=false,error="A dependency is incomplete."}) end end
end
if target.taskClass and settings.allowedTaskClasses then
  local allowed = false
  for _, className in ipairs(settings.allowedTaskClasses) do if className == target.taskClass then allowed = true end end
  if not allowed then return cjson.encode({ok=false,error="Task class is not allowed."}) end
end
if target.workspace and settings.allowedWorkspaces then
  local allowed = false
  for _, workspace in ipairs(settings.allowedWorkspaces) do if workspace == target.workspace then allowed = true end end
  if not allowed then return cjson.encode({ok=false,error="Workspace is not allowed."}) end
end
if target.taskClass == "implementation" and settings.requireApprovalForImplementation ~= false and target.implementationApproved ~= true then
  return cjson.encode({ok=false,error="Implementation requires owner approval."})
end
target.executionState = "in_progress"
target.executionId = ARGV[2]
target.executionAgent = ARGV[3]
target.executionStartedAt = ARGV[4]
target.workerModel = ARGV[7]
data.updatedAt = tonumber(ARGV[5])
data.dataRevision = (tonumber(data.dataRevision) or 0) + 1
redis.call("SET", KEYS[1], encodeJson(data))
return encodeJson({ok=true,task=target,runId=ARGV[2]})
`;

const SUBMIT_AUTONOMY_LUA = String.raw`
${LUA_JSON_ARRAY_HELPERS}
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ok=false,error="Bridge data is not configured."}) end
local data = decodeJson(raw)
if data.tasks == EMPTY_ARRAY then data.tasks = {} end
local target = nil
for _, t in ipairs(data.tasks or {}) do if t.id == ARGV[1] then target = t end end
if not target then return cjson.encode({ok=false,error="Task not found."}) end
if target.executionState ~= "in_progress" or target.executionId ~= ARGV[2] then return cjson.encode({ok=false,error="Run does not own this task."}) end
if ARGV[3] ~= "awaiting_review" and ARGV[3] ~= "blocked" and ARGV[3] ~= "needs_input" then return cjson.encode({ok=false,error="Invalid result state."}) end
target.executionState = ARGV[3]
target.resultSummary = ARGV[4]
target.executionEvidence = decodeJson(ARGV[5])
target.executionFinishedAt = ARGV[6]
target.nightExecutedAt = ARGV[6]
target.verificationStatus = "awaiting_review"
if ARGV[7] ~= "" then target.resultNoteId = ARGV[7] end
if ARGV[8] ~= "" then target.blockedReason = ARGV[8] end
data.updatedAt = tonumber(ARGV[9])
data.dataRevision = (tonumber(data.dataRevision) or 0) + 1
redis.call("SET", KEYS[1], encodeJson(data))
return encodeJson({ok=true,task=target,runId=ARGV[2]})
`;

function parseAtomicResult(value: unknown): AtomicAutonomyResult {
  if (typeof value === "string") {
    try { return JSON.parse(value) as AtomicAutonomyResult; } catch { return { ok: false, error: "Atomic operation returned malformed data." }; }
  }
  return value && typeof value === "object" ? value as AtomicAutonomyResult : { ok: false, error: "Atomic operation failed." };
}

export async function claimAutonomyTask(taskId: string, runId: string, agent: string, model: string, startedAt: string): Promise<AtomicAutonomyResult> {
  const redis = mcpRedis();
  if (!redis) return { ok: false, error: "Bridge data is not configured." };
  const started = new Date(startedAt);
  const utcMinutes = started.getUTCHours() * 60 + started.getUTCMinutes();
  const value = await redis.eval(CLAIM_AUTONOMY_LUA, [KEY], [taskId, runId, agent, startedAt, String(Date.now()), startedAt.slice(0, 10), model, String(utcMinutes)]);
  return parseAtomicResult(value);
}

export async function submitAutonomyResult(input: { taskId: string; runId: string; state: "awaiting_review" | "blocked" | "needs_input"; summary: string; evidence: unknown[]; finishedAt: string; resultNoteId?: string; blockedReason?: string }): Promise<AtomicAutonomyResult> {
  const redis = mcpRedis();
  if (!redis) return { ok: false, error: "Bridge data is not configured." };
  const value = await redis.eval(SUBMIT_AUTONOMY_LUA, [KEY], [input.taskId, input.runId, input.state, input.summary, JSON.stringify(input.evidence), input.finishedAt, input.resultNoteId ?? "", input.blockedReason ?? "", String(Date.now())]);
  return parseAtomicResult(value);
}

// A live (non-deleted) notes page counts as "locked & hidden" for the MCP.
export const isReadableNote = (p: WikiPage) => !p.locked && !p.deletedAt;

// Strip locked/trashed notes from the blob so nothing downstream can leak them.
export function sanitize(d: BridgeData): BridgeData {
  return { ...d, wikiPages: (d.wikiPages ?? []).filter(isReadableNote) };
}

// ── plaintext extraction for note blocks (no client/DOM code) ─────────────────────
const stripTags = (html: string) =>
  (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();

function blockToText(b: WikiBlock): string {
  const t = stripTags(b.text);
  switch (b.type) {
    case "h1": return `# ${t}`;
    case "h2": return `## ${t}`;
    case "h3": return `### ${t}`;
    case "bulleted": return `- ${t}`;
    case "numbered": return `1. ${t}`;
    case "todo": return `[${b.checked ? "x" : " "}] ${t}`;
    case "quote": return `> ${t}`;
    case "code": return "```\n" + t + "\n```";
    case "callout": return `${b.emoji || "💡"} ${t}`;
    case "toggle": return `▸ ${t}${b.body ? "\n  " + stripTags(b.body) : ""}`;
    case "divider": case "labeleddivider": return "---";
    case "image": return b.caption ? `[image: ${b.caption}]` : "[image]";
    case "sticky": return `📝 ${t}`;
    case "bookmark": case "embed": case "video": case "audio": case "file": return `[${b.type}] ${b.url ?? ""}`.trim();
    case "columns": return (b.cols ?? []).map(stripTags).join("\n\n");
    case "tabs": case "accordion": return (b.panels ?? []).map((p) => `${p.title}\n${stripTags(p.body)}`).join("\n");
    case "checklist": return (b.checks ?? []).map((c) => `[${c.done ? "x" : " "}] ${c.text}`).join("\n");
    case "properties": return (b.props ?? []).map((p) => `${p.key}: ${p.value}`).join("\n");
    case "progress": return `${t}: ${b.value ?? 0}%`;
    case "counter": return `${t}: ${b.value ?? 0}`;
    case "countdown": return `${t} — ${b.date ?? ""}`;
    case "rating": return `${t}: ${b.value ?? 0}/5`;
    case "table": return (b.table?.rows ?? []).map((r) => r.map(stripTags).join(" | ")).join("\n");
    case "board": return (b.board ?? []).map((c) => `${c.title}: ${c.cards.map((x) => x.text).join(", ")}`).join("\n");
    case "chart": return `[chart] ` + (b.chart?.data ?? []).map((d) => `${d.label}=${d.value}`).join(", ");
    case "math": return `$${t}$`;
    case "diagram": return "```mermaid\n" + t + "\n```";
    default: return t;
  }
}

export function noteToText(p: WikiPage): string {
  return (p.blocks ?? []).map(blockToText).filter(Boolean).join("\n");
}
