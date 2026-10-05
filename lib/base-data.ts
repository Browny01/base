import type { Redis } from "@upstash/redis";

// The store was called Nexus, then Bridge, and is now Base. Each rename reads
// the current key first and falls back to the previous names, copying forward on
// first read — so upgrading never loses a task, and an install that skipped a
// version still finds its data.

export const DATA_KEY = "base:data";
export const PREVIOUS_DATA_KEYS = ["bridge:data", "nexus:data"] as const;

export const DATA_REVISION_KEY = "base:data:revision";
export const PREVIOUS_REVISION_KEYS = ["bridge:data:revision", "nexus:data:revision"] as const;

export const DATA_HISTORY_KEY = "base:data:history";
export const PREVIOUS_HISTORY_KEYS = ["bridge:data:history"] as const;

export const AUTH_PASSWORD_KEY = "base:auth:password";
export const PREVIOUS_AUTH_PASSWORD_KEYS = ["bridge:auth:password"] as const;

export function previousKeys(current: string, previous: readonly string[]): string[] {
  return [current, ...previous];
}

/**
 * Reads the newest key that exists, then writes it to the current key so the
 * next read (and every other process) goes straight to `base:*`.
 */
export async function readMigrating(
  redis: Redis,
  current: string,
  previous: readonly string[],
): Promise<string | null> {
  const present = await redis.get<string>(current);
  if (present !== null && present !== undefined) return present;

  for (const key of previous) {
    const value = await redis.get<string>(key);
    if (value !== null && value !== undefined) {
      await redis.set(current, value);
      return value;
    }
  }
  return null;
}

export async function readCurrentData(redis: Redis): Promise<unknown> {
  const current = await readMigrating(redis, DATA_KEY, PREVIOUS_DATA_KEYS);
  if (current !== null && current !== undefined) return current;
  return null;
}

export async function readCurrentRevision(redis: Redis): Promise<number> {
  const raw = await readMigrating(redis, DATA_REVISION_KEY, PREVIOUS_REVISION_KEYS);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export async function readCurrentHistory(redis: Redis): Promise<string | null> {
  return readMigrating(redis, DATA_HISTORY_KEY, PREVIOUS_HISTORY_KEYS);
}