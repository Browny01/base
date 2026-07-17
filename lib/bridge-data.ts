import type { Redis } from "@upstash/redis";

export const DATA_KEY = "bridge:data";
export const LEGACY_DATA_KEY = "nexus:data";

export async function readCurrentData(redis: Redis): Promise<unknown> {
  const current = await redis.get(DATA_KEY);
  if (current !== null && current !== undefined) return current;

  const legacy = await redis.get(LEGACY_DATA_KEY);
  if (legacy !== null && legacy !== undefined) {
    await redis.set(DATA_KEY, legacy);
    return legacy;
  }

  return null;
}
