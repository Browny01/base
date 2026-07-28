import { Redis } from "@upstash/redis";
import { DATA_KEY, readCurrentData } from "@/lib/bridge-data";
import { authorizeSyncRequest } from "@/lib/native-auth";
import {
  RECORD_COLLECTIONS,
  ROOT_COLLECTION,
  ROOT_FIELDS,
  SYNC_PROTOCOL_VERSION,
  type SyncChange,
  type SyncOperation,
} from "@/lib/sync-contract";

export const runtime = "nodejs";

const HISTORY_KEY = "bridge:data:history";
const REVISION_KEY = "bridge:sync:revision";
const RECORD_REVISIONS_KEY = "bridge:sync:record-revisions";
const APPLIED_OPERATIONS_KEY = "bridge:sync:applied";
const APPLIED_INDEX_KEY = "bridge:sync:applied-index";
const CHANGES_KEY = "bridge:sync:changes";
const TOMBSTONES_KEY = "bridge:sync:tombstones";
const MAX_OPERATIONS = 200;
const MAX_BODY_BYTES = 2_000_000;
const MAX_CHANGE_LOG = 5_000;
const collections = new Set<string>(RECORD_COLLECTIONS);
const rootFields = new Set<string>(ROOT_FIELDS);

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function unwrap<T = unknown>(value: unknown): T {
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return value as T; }
}

function validOperation(value: unknown): value is SyncOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  if (typeof operation.id !== "string" || !operation.id || operation.id.length > 120) return false;
  if (typeof operation.deviceId !== "string" || !operation.deviceId || operation.deviceId.length > 120) return false;
  if (typeof operation.collection !== "string") return false;
  if (!["upsert", "patch", "delete", "set"].includes(String(operation.action))) return false;
  if (typeof operation.recordId !== "string" || !operation.recordId || operation.recordId.length > 200) return false;
  if (typeof operation.baseRevision !== "number" || operation.baseRevision < 0) return false;
  if (typeof operation.clientUpdatedAt !== "number") return false;

  if (operation.collection === ROOT_COLLECTION) {
    return operation.action === "set" && rootFields.has(operation.recordId) && "value" in operation;
  }
  if (!collections.has(operation.collection) || operation.action === "set") return false;
  if (operation.action === "delete") return true;
  if (!operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) return false;
  if (operation.action === "upsert") {
    return (operation.value as Record<string, unknown>).id === operation.recordId;
  }
  return operation.action === "patch";
}

// The complete batch, revision allocation, idempotency check, tombstone write,
// and rolling change log all happen inside one Redis script. A reconnecting
// device can retry the same request without applying an edit twice.
const APPLY_OPERATIONS = `
local raw = redis.call("GET", KEYS[1])
local data = raw and cjson.decode(raw) or {}
local operations = cjson.decode(ARGV[1])
local timestamp = tonumber(ARGV[2])
local maxChanges = tonumber(ARGV[3])
local revision = tonumber(redis.call("GET", KEYS[3]) or "0")
local applied = {}
local conflicts = {}
local emitted = {}

if raw then
  redis.call("LPUSH", KEYS[2], raw)
  redis.call("LTRIM", KEYS[2], 0, 24)
end

for _, operation in ipairs(operations) do
  local already = redis.call("HGET", KEYS[5], operation.id)
  if already then
    table.insert(applied, operation.id)
  else
    local recordKey = operation.collection .. ":" .. operation.recordId
    local currentRevision = tonumber(redis.call("HGET", KEYS[4], recordKey) or "0")
    local stale = tonumber(operation.baseRevision or 0) < currentRevision
    local records = nil
    local match = nil
    local current = nil

    if operation.collection ~= "$root" then
      records = data[operation.collection]
      if type(records) ~= "table" then records = {} end
      for index, record in ipairs(records) do
        if type(record) == "table" and tostring(record.id) == operation.recordId then
          match = index
          current = record
          break
        end
      end
    else
      current = data[operation.recordId]
    end

    local sensitive = operation.collection == "wikiPages" or operation.collection == "chatThreads" or operation.collection == "$root"
    local mustConflict = stale and (
      sensitive
      or operation.action == "delete"
      or operation.action == "upsert"
      or (operation.collection ~= "$root" and not match)
    )

    if mustConflict then
      local conflict = {
        id = operation.id,
        operation = operation,
        serverRevision = currentRevision,
        createdAt = timestamp
      }
      if current ~= nil then conflict.serverValue = current end
      table.insert(conflicts, conflict)
    else
      revision = revision + 1
      if operation.collection == "$root" then
        data[operation.recordId] = operation.value
      elseif operation.action == "delete" then
        if match then table.remove(records, match) end
        data[operation.collection] = records
        redis.call("HSET", KEYS[7], recordKey, cjson.encode({
          revision = revision,
          deletedAt = timestamp,
          deviceId = operation.deviceId
        }))
      elseif operation.action == "patch" then
        local nextRecord = current or { id = operation.recordId }
        for key, value in pairs(operation.value) do nextRecord[key] = value end
        if match then records[match] = nextRecord else table.insert(records, nextRecord) end
        data[operation.collection] = records
        redis.call("HDEL", KEYS[7], recordKey)
      else
        if match then records[match] = operation.value else table.insert(records, operation.value) end
        data[operation.collection] = records
        redis.call("HDEL", KEYS[7], recordKey)
      end

      redis.call("HSET", KEYS[4], recordKey, revision)
      redis.call("HSET", KEYS[5], operation.id, revision)
      redis.call("ZADD", KEYS[6], revision, operation.id)
      local change = { revision = revision, operation = operation }
      if stale then change.merged = true end
      local encodedChange = cjson.encode(change)
      redis.call("RPUSH", KEYS[8], encodedChange)
      table.insert(emitted, change)
      table.insert(applied, operation.id)
    end
  end
end

local appliedCount = redis.call("ZCARD", KEYS[6])
if appliedCount > 10000 then
  local expired = redis.call("ZRANGE", KEYS[6], 0, appliedCount - 10001)
  for _, operationId in ipairs(expired) do redis.call("HDEL", KEYS[5], operationId) end
  if #expired > 0 then redis.call("ZREM", KEYS[6], unpack(expired)) end
end

redis.call("LTRIM", KEYS[8], -maxChanges, -1)
if #applied > 0 then data.updatedAt = timestamp end
local encoded = cjson.encode(data)
redis.call("SET", KEYS[1], encoded)
redis.call("SET", KEYS[3], revision)
return cjson.encode({
  ok = true,
  data = data,
  revision = revision,
  applied = applied,
  conflicts = conflicts,
  changes = emitted,
  updatedAt = data.updatedAt
})
`;

async function fullEnvelope(redis: Redis) {
  const [rawData, rawRevision, rawRevisions] = await Promise.all([
    readCurrentData(redis),
    redis.get<number>(REVISION_KEY),
    redis.hgetall<Record<string, number>>(RECORD_REVISIONS_KEY),
  ]);
  return {
    ok: true,
    configured: true,
    protocol: SYNC_PROTOCOL_VERSION,
    full: true,
    data: unwrap<Record<string, unknown>>(rawData),
    changes: [],
    revision: Number(rawRevision ?? 0),
    recordRevisions: rawRevisions ?? {},
  };
}

export async function GET(request: Request) {
  if (!(await authorizeSyncRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) return Response.json({ data: null, configured: false }, { status: 503 });

  try {
    const cursorValue = Number(new URL(request.url).searchParams.get("cursor"));
    if (!Number.isFinite(cursorValue) || cursorValue < 0) {
      return Response.json(await fullEnvelope(redis));
    }

    const [rawRevision, rawChanges] = await Promise.all([
      redis.get<number>(REVISION_KEY),
      redis.lrange<string>(CHANGES_KEY, 0, -1),
    ]);
    const revision = Number(rawRevision ?? 0);
    const changes = (rawChanges ?? []).map((change) => unwrap<SyncChange>(change)).filter((change) => change && typeof change.revision === "number");
    const earliest = changes[0]?.revision ?? revision + 1;
    if (cursorValue < earliest - 1 || cursorValue > revision) {
      return Response.json(await fullEnvelope(redis));
    }

    const delta = changes.filter((change) => change.revision > cursorValue);
    return Response.json({
      ok: true,
      configured: true,
      protocol: SYNC_PROTOCOL_VERSION,
      full: false,
      data: null,
      changes: delta,
      revision,
      recordRevisions: Object.fromEntries(delta.map((change) => [
        `${change.operation.collection}:${change.operation.recordId}`,
        change.revision,
      ])),
    });
  } catch (error) {
    console.error("[bridge/native/sync GET]", error);
    return Response.json({ error: "Unable to load Bridge changes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authorizeSyncRequest(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) return Response.json({ ok: false, configured: false }, { status: 503 });

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Sync payload is too large." }, { status: 413 });
    }
    const body = JSON.parse(rawBody) as { operations?: unknown };
    if (!Array.isArray(body.operations) || body.operations.length > MAX_OPERATIONS || !body.operations.every(validOperation)) {
      return Response.json({ error: "Invalid sync operation batch." }, { status: 400 });
    }

    await readCurrentData(redis);
    if (body.operations.length === 0) return Response.json(await fullEnvelope(redis));
    const result = await redis.eval<unknown[], string>(
      APPLY_OPERATIONS,
      [
        DATA_KEY,
        HISTORY_KEY,
        REVISION_KEY,
        RECORD_REVISIONS_KEY,
        APPLIED_OPERATIONS_KEY,
        APPLIED_INDEX_KEY,
        TOMBSTONES_KEY,
        CHANGES_KEY,
      ],
      [JSON.stringify(body.operations), String(Date.now()), String(MAX_CHANGE_LOG)],
    );
    const envelope = unwrap<Record<string, unknown>>(result);
    const currentRecordRevisions = await redis.hgetall<Record<string, number>>(RECORD_REVISIONS_KEY);
    return Response.json({
      ...envelope,
      configured: true,
      protocol: SYNC_PROTOCOL_VERSION,
      full: true,
      recordRevisions: currentRecordRevisions ?? {},
    });
  } catch (error) {
    console.error("[bridge/native/sync POST]", error);
    return Response.json({ error: "Unable to sync Bridge data." }, { status: 500 });
  }
}
