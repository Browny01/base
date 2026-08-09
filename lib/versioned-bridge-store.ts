import type { Redis } from "@upstash/redis";
import { DATA_KEY, readCurrentData } from "./bridge-data.ts";

export const DATA_REVISION_KEY = "bridge:data:revision";

export type BridgeDataRecord = Record<string, unknown>;

export type VersionedBridgeData = {
  data: BridgeDataRecord;
  revision: number;
};

type Mutation<T> = {
  data: BridgeDataRecord;
  result: T;
  write?: boolean;
};

const COMPARE_AND_SWAP_LUA = `
local current = redis.call("GET", KEYS[2])
if not current then current = "0" end
if tostring(current) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], ARGV[2])
local next_revision = tonumber(current) + 1
redis.call("SET", KEYS[2], tostring(next_revision))
return next_revision
`;

function asRecord(value: unknown): BridgeDataRecord {
  if (typeof value === "string") {
    try { return asRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BridgeDataRecord
    : {};
}

function asRevision(value: unknown): number {
  const revision = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export async function readVersionedBridgeData(redis: Redis): Promise<VersionedBridgeData> {
  let [data, revision] = await redis.mget<[unknown, unknown]>(DATA_KEY, DATA_REVISION_KEY);
  if (data == null) {
    await readCurrentData(redis);
    [data, revision] = await redis.mget<[unknown, unknown]>(DATA_KEY, DATA_REVISION_KEY);
  }
  return { data: asRecord(data), revision: asRevision(revision) };
}

export async function compareAndSwapBridgeData(
  redis: Redis,
  expectedRevision: number,
  data: BridgeDataRecord,
): Promise<{ ok: boolean; revision: number }> {
  const value = await redis.eval<unknown[], number>(
    COMPARE_AND_SWAP_LUA,
    [DATA_KEY, DATA_REVISION_KEY],
    [String(expectedRevision), JSON.stringify(data)],
  );
  const revision = Number(value);
  return revision > 0
    ? { ok: true, revision }
    : { ok: false, revision: expectedRevision };
}

export async function mutateBridgeDataAtomically<T>(
  redis: Redis,
  mutate: (current: BridgeDataRecord) => Mutation<T> | Promise<Mutation<T>>,
  options: { maxAttempts?: number } = {},
): Promise<{ data: BridgeDataRecord; result: T; revision: number }> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 8));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const snapshot = await readVersionedBridgeData(redis);
    const mutation = await mutate(snapshot.data);
    if (mutation.write === false) {
      return { data: snapshot.data, result: mutation.result, revision: snapshot.revision };
    }
    const nextData = { ...mutation.data, updatedAt: Date.now() };
    const write = await compareAndSwapBridgeData(redis, snapshot.revision, nextData);
    if (write.ok) return { data: nextData, result: mutation.result, revision: write.revision };
  }
  throw new Error(`Bridge data changed during ${maxAttempts} concurrent writes; retry later.`);
}

export async function updateBridgeDataAtomically(
  redis: Redis,
  update: (current: BridgeDataRecord) => BridgeDataRecord | Promise<BridgeDataRecord>,
  options: { maxAttempts?: number } = {},
): Promise<{ ok: true; data: BridgeDataRecord; revision: number }> {
  const mutation = await mutateBridgeDataAtomically(redis, async (current) => ({
    data: await update(current),
    result: true,
  }), options);
  return { ok: true, data: mutation.data, revision: mutation.revision };
}
