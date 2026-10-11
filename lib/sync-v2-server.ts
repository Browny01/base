import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { DATA_KEY, DATA_REVISION_KEY, DATA_HISTORY_KEY } from "./base-data.ts";
import { readVersionedBaseData } from "./versioned-base-store.ts";
import { isAutonomyTask, type AutonomyTaskLike } from "./autonomy.ts";
import { PROTECTED_AUTONOMY_FIELDS } from "./autonomy-persistence.ts";
import { equal, mergeOperations, readSlot, type Document, type Operation, type Conflict, type SyncRequest, type SyncResponse } from "../packages/sync/src/protocol.ts";

const RECEIPTS = "base:sync:v2:receipts";
const TOMBSTONES = "base:sync:v2:tombstones";
type Receipt = { fingerprint: string; conflict?: Conflict };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
  return value;
}
// JSON object ordering varies across native serializers. A retry with the
// same logical operation must match its durable receipt after a restart.
const fingerprint = (op: Operation) => createHash("sha256").update(JSON.stringify(canonical(op))).digest("hex");
const unwrap = <T>(value: unknown): T | null => typeof value === "string" ? JSON.parse(value) as T : value as T | null;

// Receipts, tombstones, document and revision are one atomic Redis commit.
// Durable receipts deliberately have no TTL: an old outbox retry stays safe.
const COMMIT = `
local revision = redis.call('GET', KEYS[2]) or '0'
if tostring(revision) ~= ARGV[1] then return 0 end
local next_revision = tonumber(revision) + 1
if ARGV[5] == '1' then
  local previous = redis.call('GET', KEYS[1])
  if previous then redis.call('LPUSH', KEYS[5], previous); redis.call('LTRIM', KEYS[5], 0, 24) end
end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(next_revision))
local receipts = cjson.decode(ARGV[3])
for _, receipt in ipairs(receipts) do redis.call('HSET', KEYS[3], receipt[1], receipt[2]) end
local tombstones = cjson.decode(ARGV[4])
for _, path in ipairs(tombstones) do redis.call('HSET', KEYS[4], path, tostring(next_revision)) end
return next_revision
`;

function protectedOperation(data: Document, op: Operation): boolean {
  if (op.path[0] === "autonomySettings") return true;
  if (op.path[0] !== "tasks") return false;
  if (op.path.length === 1) return Array.isArray(data.tasks) && data.tasks.some(t => isAutonomyTask(t as unknown as AutonomyTaskLike));
  const record = readSlot(data, op.path.slice(0, 2));
  if (!record.exists || !isAutonomyTask(record.value as unknown as AutonomyTaskLike)) return false;
  return op.path.length === 2 || PROTECTED_AUTONOMY_FIELDS.some(k => op.path[2] === k);
}

export async function syncV2(redis: Redis, request: SyncRequest): Promise<SyncResponse> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const snapshot = await readVersionedBaseData(redis);
    if (request.cursor > snapshot.revision) return {
      protocol: 2, workspaceId: request.workspaceId, revision: snapshot.revision,
      data: snapshot.data as Document, applied: [], conflicts: [],
      recovery: { reason: "server-reset", previousRevision: request.cursor },
    };
    const ids = request.operations.map(op => op.id);
    const stored = ids.length ? await redis.hmget<Record<string, unknown>>(RECEIPTS, ...ids) : {};
    const receipts = request.operations.map(op => unwrap<Receipt>(stored?.[op.id]));
    const prefixes = request.operations.flatMap(op => op.path.map((_, i) => JSON.stringify(op.path.slice(0, i + 1))));
    const deleted = prefixes.length ? await redis.hmget<Record<string, unknown>>(TOMBSTONES, ...prefixes) : {};
    let data = snapshot.data as Document;
    const applied: string[] = [];
    const conflicts: Conflict[] = [];
    const newReceipts: [string, string][] = [];
    const tombstones: string[] = [];
    for (let i = 0; i < request.operations.length; i++) {
      const op = request.operations[i];
      const hash = fingerprint(op);
      const receipt = receipts[i];
      if (receipt) {
        if (receipt.fingerprint !== hash) throw new Error("Operation ID was reused with different content.");
        if (receipt.conflict) conflicts.push(receipt.conflict);
        else applied.push(op.id);
        continue;
      }
      // An explicit user resolution starts at the latest server revision and
      // can restore a tombstoned ID. Older creates cannot resurrect it.
      const tombstoned = op.path.some((_, j) => Number(deleted?.[JSON.stringify(op.path.slice(0, j + 1))] ?? 0) > op.baseRevision);
      const result = tombstoned && op.after.exists
        ? { data, applied: [], conflicts: [{ id: op.id, operation: op, remote: readSlot(data, op.path, op.action), revision: snapshot.revision, reason: "tombstone" } as Conflict] }
        : mergeOperations(data, [op], snapshot.revision, candidate => protectedOperation(data, candidate));
      data = result.data;
      applied.push(...result.applied);
      conflicts.push(...result.conflicts);
      newReceipts.push([op.id, JSON.stringify({ fingerprint: hash, ...(result.conflicts[0] ? { conflict: result.conflicts[0] } : {}) })]);
      if (!op.after.exists && result.applied.length) tombstones.push(JSON.stringify(op.path));
    }
    if (!newReceipts.length) {
      return { protocol: 2, workspaceId: request.workspaceId, revision: snapshot.revision,
        ...(request.full || request.cursor !== snapshot.revision || ids.length ? { data } : {}), applied, conflicts };
    }
    const changed = !equal(data, snapshot.data);
    const next = changed ? { ...data, updatedAt: Date.now(), dataRevision: Number(data.dataRevision ?? 0) + 1 } : data;
    const revision = Number(await redis.eval(COMMIT, [DATA_KEY, DATA_REVISION_KEY, RECEIPTS, TOMBSTONES, DATA_HISTORY_KEY],
      [String(snapshot.revision), JSON.stringify(next), JSON.stringify(newReceipts), JSON.stringify(tombstones), changed ? "1" : "0"]));
    if (revision > 0) return { protocol: 2, workspaceId: request.workspaceId, revision, data: next, applied, conflicts };
  }
  throw new Error("Sync contention; retry later.");
}
