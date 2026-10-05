import type { Redis } from "@upstash/redis";
import { DATA_KEY, DATA_REVISION_KEY, readCurrentData } from "./base-data.ts";

export type BaseDataRecord = Record<string, unknown>;

export type VersionedBaseData = {
  data: BaseDataRecord;
  revision: number;
};

type Mutation<T> = {
  data: BaseDataRecord;
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

function asRecord(value: unknown): BaseDataRecord {
  if (typeof value === "string") {
    try { return asRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as BaseDataRecord
    : {};
}

function asRevision(value: unknown): number {
  const revision = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export async function readVersionedBaseData(redis: Redis): Promise<VersionedBaseData> {
  let [data, revision] = await redis.mget<[unknown, unknown]>(DATA_KEY, DATA_REVISION_KEY);
  if (data == null) {
    await readCurrentData(redis);
    [data, revision] = await redis.mget<[unknown, unknown]>(DATA_KEY, DATA_REVISION_KEY);
  }
  return { data: asRecord(data), revision: asRevision(revision) };
}

export async function compareAndSwapBaseData(
  redis: Redis,
  expectedRevision: number,
  data: BaseDataRecord,
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

export async function mutateBaseDataAtomically<T>(
  redis: Redis,
  mutate: (current: BaseDataRecord) => Mutation<T> | Promise<Mutation<T>>,
  options: { maxAttempts?: number } = {},
): Promise<{ data: BaseDataRecord; result: T; revision: number }> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 8));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const snapshot = await readVersionedBaseData(redis);
    const mutation = await mutate(snapshot.data);
    if (mutation.write === false) {
      return { data: snapshot.data, result: mutation.result, revision: snapshot.revision };
    }
    const nextData = { ...mutation.data, updatedAt: Date.now() };
    const write = await compareAndSwapBaseData(redis, snapshot.revision, nextData);
    if (write.ok) return { data: nextData, result: mutation.result, revision: write.revision };
  }
  throw new Error(`Base data changed during ${maxAttempts} concurrent writes; retry later.`);
}

export async function updateBaseDataAtomically(
  redis: Redis,
  update: (current: BaseDataRecord) => BaseDataRecord | Promise<BaseDataRecord>,
  options: { maxAttempts?: number } = {},
): Promise<{ ok: true; data: BaseDataRecord; revision: number }> {
  const mutation = await mutateBaseDataAtomically(redis, async (current) => ({
    data: await update(current),
    result: true,
  }), options);
  return { ok: true, data: mutation.data, revision: mutation.revision };
}
