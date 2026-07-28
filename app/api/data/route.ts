import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { DATA_KEY as KEY, readCurrentData } from "@/lib/bridge-data";
import { markFullSnapshotChange } from "@/lib/sync-server";

const HISTORY = "bridge:data:history";   // rolling backups (newest first)

function getRedis(): Redis | null {
  // New Upstash Marketplace integration uses UPSTASH_REDIS_REST_* names
  // Old Vercel KV used KV_REST_API_* names — support both
  const url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const unwrap = (data: unknown): unknown => {
  if (typeof data === "string") { try { return JSON.parse(data); } catch { return data; } }
  return data;
};

// Collections whose emptying signals real data loss (not a normal edit).
const IMPORTANT = ["tasks", "projects", "wikiPages", "wallets", "chatThreads", "courses", "habits", "incomeEntries", "milestones", "goals", "boards", "playerSkills"];

// How many important collections went from "had items" to "empty" between two states.
function emptiedCount(existing: Record<string, unknown>, incoming: Record<string, unknown>): number {
  let n = 0;
  for (const k of IMPORTANT) {
    const e = Array.isArray(existing[k]) ? (existing[k] as unknown[]).length : 0;
    const i = Array.isArray(incoming[k]) ? (incoming[k] as unknown[]).length : 0;
    if (e >= 1 && i === 0) n++;
  }
  return n;
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ data: null, configured: false });
  try {
    const data = unwrap(await readCurrentData(redis));
    return NextResponse.json({ data, configured: true });
  } catch (err) {
    console.error("[bridge/data GET]", err);
    return NextResponse.json({ data: null, configured: true, error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, configured: false });
  try {
    const body = await req.json();
    const force = new URL(req.url).searchParams.get("force") === "1";
    const existing = unwrap(await readCurrentData(redis)) as Record<string, unknown> | null;

    // Anti-wipe guard: never let a near-empty payload silently overwrite a populated
    // store (protects against client bugs that push before data has hydrated).
    if (existing && typeof existing === "object" && !force && body && typeof body === "object") {
      if (emptiedCount(existing, body) >= 3) {
        return NextResponse.json(
          { ok: false, guarded: true, message: "Refused: this would wipe multiple populated collections. Add ?force=1 to override." },
          { status: 409 },
        );
      }
    }

    // Rolling backup of the previous state before overwriting (keep the last 25).
    if (existing && typeof existing === "object") {
      try { await redis.lpush(HISTORY, JSON.stringify(existing)); await redis.ltrim(HISTORY, 0, 24); } catch { /* ignore backup errors */ }
    }

    await redis.set(KEY, body);
    await markFullSnapshotChange(redis);
    return NextResponse.json({ ok: true, configured: true });
  } catch (err) {
    console.error("[bridge/data POST]", err);
    return NextResponse.json({ ok: false, configured: true, error: String(err) });
  }
}
