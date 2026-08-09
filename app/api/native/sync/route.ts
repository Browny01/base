import { Redis } from "@upstash/redis";
import { readCurrentData } from "@/lib/bridge-data";
import { mergeBridgeWrite } from "@/lib/autonomy-persistence";
import { mutateBridgeDataAtomically, type BridgeDataRecord } from "@/lib/versioned-bridge-store";

export const runtime = "nodejs";

const HISTORY_KEY = "bridge:data:history";
const MAX_OPERATIONS = 200;
const MAX_BODY_BYTES = 2_000_000;

const COLLECTIONS = new Set([
  "tasks",
  "focusSessions",
  "incomeEntries",
  "subscriptions",
  "habits",
  "habitLogs",
  "projects",
  "projectNotes",
  "projectLinks",
  "milestones",
  "projectDocuments",
  "exams",
  "schoolNotes",
  "goals",
  "workouts",
  "socialStats",
  "businessKPIs",
  "briefs",
  "boards",
  "boardItems",
  "boardDrawings",
  "wikiPages",
  "wikiFolders",
  "chatThreads",
  "chatFolders",
  "courses",
]);

type NativeOperation = {
  id: string;
  collection: string;
  action: "upsert" | "delete";
  recordId: string;
  value?: Record<string, unknown>;
};

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function unwrap(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function validOperation(value: unknown): value is NativeOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as Record<string, unknown>;
  if (typeof operation.id !== "string" || operation.id.length > 100) return false;
  if (typeof operation.collection !== "string" || !COLLECTIONS.has(operation.collection)) return false;
  if (operation.action !== "upsert" && operation.action !== "delete") return false;
  if (typeof operation.recordId !== "string" || !operation.recordId || operation.recordId.length > 200) return false;
  if (operation.action === "delete") return true;
  if (!operation.value || typeof operation.value !== "object" || Array.isArray(operation.value)) return false;
  return (operation.value as Record<string, unknown>).id === operation.recordId;
}

function applyOperations(data: BridgeDataRecord, operations: NativeOperation[]): BridgeDataRecord {
  const next: BridgeDataRecord = { ...data };
  for (const operation of operations) {
    const collection = Array.isArray(next[operation.collection])
      ? [...next[operation.collection] as unknown[]]
      : [];
    const index = collection.findIndex((record) => Boolean(record) && typeof record === "object" && !Array.isArray(record) && String((record as Record<string, unknown>).id) === operation.recordId);
    if (operation.action === "delete") {
      if (index >= 0) collection.splice(index, 1);
    } else if (index >= 0) {
      collection[index] = operation.value!;
    } else {
      collection.push(operation.value!);
    }
    next[operation.collection] = collection;
  }
  return next;
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return Response.json({ data: null, configured: false });

  try {
    return Response.json({ data: unwrap(await readCurrentData(redis)), configured: true });
  } catch (error) {
    console.error("[bridge/native/sync GET]", error);
    return Response.json({ data: null, configured: true, error: "Unable to load Bridge data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const redis = getRedis();
  if (!redis) return Response.json({ ok: false, configured: false }, { status: 503 });

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "Sync payload is too large." }, { status: 413 });
    }

    const body = JSON.parse(rawBody) as { operations?: unknown };
    if (!Array.isArray(body.operations) || body.operations.length > MAX_OPERATIONS || !body.operations.every(validOperation)) {
      return Response.json({ ok: false, error: "Invalid native sync operation batch." }, { status: 400 });
    }

    // Migrate the legacy key before the versioned mutation reads Bridge data.
    await readCurrentData(redis);
    const operations = body.operations as NativeOperation[];
    if (operations.length === 0) {
      return Response.json({ ok: true, data: unwrap(await readCurrentData(redis)), applied: [] });
    }

    const mutation = await mutateBridgeDataAtomically(redis, (current) => {
      const applied = applyOperations(current, operations);
      return {
        data: mergeBridgeWrite(current, applied, true),
        result: { previous: current },
      };
    });
    try {
      await redis.lpush(HISTORY_KEY, JSON.stringify(mutation.result.previous));
      await redis.ltrim(HISTORY_KEY, 0, 24);
    } catch { /* a backup failure must not invalidate an already atomic sync */ }

    return Response.json({
      ok: true,
      data: mutation.data,
      applied: operations.map((operation) => operation.id),
      updatedAt: mutation.data.updatedAt,
    });
  } catch (error) {
    console.error("[bridge/native/sync POST]", error);
    return Response.json({ ok: false, error: "Unable to sync Bridge data." }, { status: 500 });
  }
}
