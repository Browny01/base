import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import { bridgeSessionSecret } from "@/lib/env";

const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 30 * 60;
export const MAX_LOGIN_FAILURES = 5;

type Scope = "site" | "mcp";
type MemoryRecord = { failures: number; expiresAt: number; lockedUntil: number };

const memory = new Map<string, MemoryRecord>();

function redisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export function requestIp(request: NextRequest): string {
  const value = request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return value.slice(0, 128);
}

function subjectKey(scope: Scope, kind: "ip" | "device", value: string): string {
  const digest = createHash("sha256")
    .update(`${bridgeSessionSecret()}\0${kind}\0${value}`)
    .digest("hex");
  return `bridge:login:${scope}:${kind}:${digest}`;
}

function subjects(scope: Scope, ip: string, device?: string): string[] {
  const keys = [subjectKey(scope, "ip", ip)];
  if (device) keys.push(subjectKey(scope, "device", device));
  return keys;
}

function memoryStatus(keys: string[]): number {
  const now = Date.now();
  let retryAfter = 0;
  for (const key of keys) {
    const record = memory.get(key);
    if (!record) continue;
    if (record.expiresAt <= now && record.lockedUntil <= now) {
      memory.delete(key);
      continue;
    }
    retryAfter = Math.max(retryAfter, Math.ceil((record.lockedUntil - now) / 1000));
  }
  return Math.max(0, retryAfter);
}

function memoryFailure(keys: string[]): { locked: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  let failures = 0;
  for (const key of keys) {
    const current = memory.get(key);
    const record = !current || current.expiresAt <= now
      ? { failures: 0, expiresAt: now + ATTEMPT_WINDOW_SECONDS * 1000, lockedUntil: 0 }
      : current;
    record.failures += 1;
    if (record.failures >= MAX_LOGIN_FAILURES) record.lockedUntil = now + LOCK_SECONDS * 1000;
    memory.set(key, record);
    failures = Math.max(failures, record.failures);
  }
  const retryAfter = memoryStatus(keys);
  return { locked: retryAfter > 0, retryAfter, remaining: Math.max(0, MAX_LOGIN_FAILURES - failures) };
}

export async function loginLockStatus(scope: Scope, ip: string, device?: string): Promise<number> {
  const keys = subjects(scope, ip, device);
  const redis = redisClient();
  if (!redis) return memoryStatus(keys);

  try {
    const ttls = await Promise.all(keys.map((key) => redis.ttl(`${key}:lock`)));
    return Math.max(0, ...ttls);
  } catch (error) {
    console.error("[bridge/login-rate-limit status]", error);
    return memoryStatus(keys);
  }
}

export async function recordLoginFailure(scope: Scope, ip: string, device?: string) {
  const keys = subjects(scope, ip, device);
  const redis = redisClient();
  if (!redis) return memoryFailure(keys);

  try {
    const failures = await Promise.all(keys.map(async (key) => {
      const count = await redis.incr(`${key}:attempts`);
      if (count === 1) await redis.expire(`${key}:attempts`, ATTEMPT_WINDOW_SECONDS);
      if (count >= MAX_LOGIN_FAILURES) await redis.set(`${key}:lock`, "1", { ex: LOCK_SECONDS });
      return count;
    }));
    const highest = Math.max(...failures);
    const locked = highest >= MAX_LOGIN_FAILURES;
    return {
      locked,
      retryAfter: locked ? LOCK_SECONDS : 0,
      remaining: Math.max(0, MAX_LOGIN_FAILURES - highest),
    };
  } catch (error) {
    console.error("[bridge/login-rate-limit failure]", error);
    return memoryFailure(keys);
  }
}

export async function clearLoginFailures(scope: Scope, ip: string, device?: string): Promise<void> {
  const keys = subjects(scope, ip, device);
  keys.forEach((key) => memory.delete(key));
  const redis = redisClient();
  if (!redis) return;
  try {
    await redis.del(...keys.flatMap((key) => [`${key}:attempts`, `${key}:lock`]));
  } catch (error) {
    console.error("[bridge/login-rate-limit clear]", error);
  }
}
