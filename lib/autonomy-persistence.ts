import type { Redis } from "@upstash/redis";
import type { BridgeData, Task } from "@/lib/store";
import { DATA_KEY } from "@/lib/bridge-data";

export const LUA_EMPTY_ARRAY_MARKER = "__bridge_empty_array_6f7c447d_0c51_46a6_9be2__";
export const LUA_JSON_ARRAY_HELPERS = String.raw`
local EMPTY_ARRAY = "${LUA_EMPTY_ARRAY_MARKER}"
local function protectEmptyArrays(json)
  local output = {}
  local index = 1
  local inString = false
  local escaped = false
  while index <= string.len(json) do
    local char = string.sub(json, index, index)
    if inString then
      table.insert(output, char)
      if escaped then escaped = false elseif char == "\\" then escaped = true elseif char == '"' then inString = false end
      index = index + 1
    elseif char == '"' then
      inString = true
      table.insert(output, char)
      index = index + 1
    elseif char == "[" then
      local cursor = index + 1
      while cursor <= string.len(json) and string.match(string.sub(json, cursor, cursor), "%s") do cursor = cursor + 1 end
      if string.sub(json, cursor, cursor) == "]" then
        table.insert(output, '"' .. EMPTY_ARRAY .. '"')
        index = cursor + 1
      else
        table.insert(output, char)
        index = index + 1
      end
    else
      table.insert(output, char)
      index = index + 1
    end
  end
  return table.concat(output)
end
local function decodeJson(json) return cjson.decode(protectEmptyArrays(json)) end
local function encodeJson(value)
  local encoded = string.gsub(cjson.encode(value), '"' .. EMPTY_ARRAY .. '"', "[]")
  return encoded
end
`;

const SAFE_WRITE_LUA = String.raw`
${LUA_JSON_ARRAY_HELPERS}
local incoming = decodeJson(ARGV[1])
if incoming.tasks == EMPTY_ARRAY then incoming.tasks = {} end
local raw = redis.call("GET", KEYS[1])
if raw then
  local current = decodeJson(raw)
  if current.tasks == EMPTY_ARRAY then current.tasks = {} end
  local protected = {
    "done", "completedAt", "executionState", "executionId", "executionStartedAt", "executionFinishedAt",
    "executionAgent", "workerModel", "executionEvidence", "resultSummary", "resultNoteId", "nightExecutedAt",
    "verificationStatus", "verifiedAt", "correctionAttempts", "implementationApproved", "blockedReason"
  }
  local states = {suggested=true, queued=true, in_progress=true, awaiting_review=true, needs_input=true, blocked=true, completed=true, rejected=true}
  incoming.tasks = incoming.tasks or {}
  local incomingById = {}
  for index, task in ipairs(incoming.tasks) do if task.id then incomingById[task.id] = index end end
  for _, task in ipairs(current.tasks or {}) do
    local autonomous = task.tag == "@night-auto" or task.nightPolicy == "autonomous-v1" or states[task.executionState] == true
    if autonomous and task.id then
      local index = incomingById[task.id]
      if index then
        for _, field in ipairs(protected) do incoming.tasks[index][field] = task[field] end
      else
        table.insert(incoming.tasks, task)
      end
    end
  end
  if ARGV[2] == "1" then incoming.autonomySettings = current.autonomySettings end
  incoming.dataRevision = (tonumber(current.dataRevision) or 0) + 1
else
  incoming.dataRevision = 1
end
if next(incoming.tasks) == nil then incoming.tasks = EMPTY_ARRAY end
redis.call("SET", KEYS[1], encodeJson(incoming))
return incoming.dataRevision
`;

const OWNER_DECISION_LUA = String.raw`
${LUA_JSON_ARRAY_HELPERS}
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ok=false,error="Bridge data is unavailable."}) end
local data = decodeJson(raw)
if data.tasks == EMPTY_ARRAY then data.tasks = {} end
local target = nil
for _, task in ipairs(data.tasks or {}) do if task.id == ARGV[1] then target = task break end end
if not target then return cjson.encode({ok=false,error="Task not found."}) end
local decision = ARGV[2]
local stamp = ARGV[3]
if decision == "approve" then
  if target.executionState ~= "suggested" and target.executionState ~= "needs_input" then return cjson.encode({ok=false,error="Only suggested or input-gated work can be approved."}) end
  target.done = false
  target.implementationApproved = true
  target.executionState = "queued"
elseif decision == "verify" then
  if target.executionState ~= "awaiting_review" then return cjson.encode({ok=false,error="Only work awaiting review can be verified."}) end
  target.done = true
  target.completedAt = stamp
  target.verifiedAt = stamp
  target.executionState = "completed"
  target.verificationStatus = "verified"
elseif decision == "reject" then
  if target.executionState ~= "awaiting_review" and target.executionState ~= "blocked" and target.executionState ~= "needs_input" then return cjson.encode({ok=false,error="This task is not reviewable."}) end
  target.done = false
  target.executionState = "rejected"
  target.verificationStatus = "rejected"
elseif decision == "requeue" then
  if target.executionState ~= "awaiting_review" and target.executionState ~= "blocked" and target.executionState ~= "needs_input" then return cjson.encode({ok=false,error="This task cannot be requeued from its current state."}) end
  local attempts = tonumber(target.correctionAttempts) or 0
  local maximum = tonumber((data.autonomySettings or {}).maxCorrectionAttempts) or 1
  if attempts >= maximum then
    target.executionState = "blocked"
    target.verificationStatus = "needs_correction"
    target.blockedReason = "Correction limit reached; owner intervention is required."
    data.dataRevision = (tonumber(data.dataRevision) or 0) + 1
    redis.call("SET", KEYS[1], encodeJson(data))
    return cjson.encode({ok=false,error="Correction limit reached; task is blocked.",task=target})
  end
  target.done = false
  target.correctionAttempts = attempts + 1
  target.executionState = "queued"
  target.verificationStatus = "needs_correction"
else
  return cjson.encode({ok=false,error="Unknown review decision."})
end
data.dataRevision = (tonumber(data.dataRevision) or 0) + 1
redis.call("SET", KEYS[1], encodeJson(data))
return cjson.encode({ok=true,task=target})
`;

export async function safeWriteBridgeData(redis: Redis, data: BridgeData, preserveAutonomySettings: boolean): Promise<void> {
  await redis.eval(SAFE_WRITE_LUA, [DATA_KEY], [JSON.stringify(data), preserveAutonomySettings ? "1" : "0"]);
}

export async function applyOwnerAutonomyDecision(redis: Redis, taskId: string, decision: "approve" | "verify" | "requeue" | "reject", timestamp: string): Promise<{ ok: boolean; error?: string; task?: Task }> {
  const result = await redis.eval(OWNER_DECISION_LUA, [DATA_KEY], [taskId, decision, timestamp]);
  return typeof result === "string" ? JSON.parse(result) : result as { ok: boolean; error?: string; task?: Task };
}

const UPDATE_SETTINGS_LUA = String.raw`
${LUA_JSON_ARRAY_HELPERS}
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ok=false,error="Bridge data is not configured."}) end
local data = decodeJson(raw)
data.autonomySettings = decodeJson(ARGV[1])
data.dataRevision = (tonumber(data.dataRevision) or 0) + 1
redis.call("SET", KEYS[1], encodeJson(data))
return cjson.encode({ok=true,settings=data.autonomySettings})
`;

export async function updateAutonomySettings(redis: Redis, settings: BridgeData["autonomySettings"]): Promise<{ ok: boolean; error?: string; settings?: BridgeData["autonomySettings"] }> {
  const result = await redis.eval(UPDATE_SETTINGS_LUA, [DATA_KEY], [JSON.stringify(settings)]);
  return typeof result === "string" ? JSON.parse(result) : result as { ok: boolean; error?: string; settings?: BridgeData["autonomySettings"] };
}
