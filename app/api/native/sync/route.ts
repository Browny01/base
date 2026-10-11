import { Redis } from "@upstash/redis";
import { readCurrentData } from "@/lib/base-data";
import { mergeBaseWrite } from "@/lib/autonomy-persistence";
import { mutateBaseDataAtomically, readVersionedBaseData, type BaseDataRecord } from "@/lib/versioned-base-store";
import { readDesktopSession, workspaceIdentity } from "@/lib/desktop-session";
import { syncV2 } from "@/lib/sync-v2-server";
import { validOperation as validV2Operation, type SyncRequest } from "@/packages/sync/src/protocol";
import { expandOperations, validReference } from "@/lib/staged-sync";
import { NextRequest } from "next/server";
import { hasValidSession } from "@/lib/session-cookie";

export const runtime = "nodejs";

const HISTORY_KEY = "base:data:history";
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

function applyOperations(data: BaseDataRecord, operations: NativeOperation[]): BaseDataRecord {
  const next: BaseDataRecord = { ...data };
  for (const operation of operations) {
    const collection = Array.isArray(next[operation.collection])
      ? [...next[operation.collection] as unknown[]]
      : [];
    const index = collection.findIndex((record) => Boolean(record) && typeof record === "object" && !Array.isArray(record) && String((record as Record<string, unknown>).id) === operation.recordId);
    if (operation.action === "delete") {
      if (index >= 0) collection.splice(index, 1);
    } else if (index >= 0) {
      collection[index] = { ...(collection[index] as Record<string, unknown>), ...operation.value! };
    } else {
      collection.push(operation.value!);
    }
    next[operation.collection] = collection;
  }
  return next;
}

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return Response.json({ data: null, configured: false });

  try {
    if (request.nextUrl.searchParams.get("protocol") === "2") {
      const snapshot = await readVersionedBaseData(redis);
      return Response.json({ protocol: 2, workspaceId: await workspaceIdentity(), revision: snapshot.revision, data: snapshot.data }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ data: unwrap(await readCurrentData(redis)), configured: true });
  } catch (error) {
    console.error("[base/native/sync GET]", error);
    return Response.json({ data: null, configured: true, error: "Unable to load Base data." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await hasValidSession(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return Response.json({ ok: false, configured: false }, { status: 503 });

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "Sync payload is too large." }, { status: 413 });
    }

    const body = JSON.parse(rawBody) as { protocol?: unknown; operations?: unknown; cursor?: unknown; workspaceId?: unknown };
    if (body.protocol === 2) {
      const session = await readDesktopSession(request);
      const workspaceId = session?.workspaceId ?? await workspaceIdentity();
      if (body.workspaceId !== workspaceId) return Response.json({ error: "Workspace mismatch." }, { status: 403 });
      if (!Number.isSafeInteger(body.cursor) || Number(body.cursor) < 0 || !Array.isArray(body.operations)
        || body.operations.length > MAX_OPERATIONS || !body.operations.every(op => validV2Operation(op) || validReference(op))
        || new Set(body.operations.map(op => op.id)).size !== body.operations.length) {
        return Response.json({ error: "Invalid v2 sync batch." }, { status: 400 });
      }
      const operations = await expandOperations(redis, workspaceId!, body.operations);
      return Response.json(await syncV2(redis, { ...body, operations } as SyncRequest), { headers: { "Cache-Control": "no-store" } });
    }
    if (!Array.isArray(body.operations) || body.operations.length > MAX_OPERATIONS || !body.operations.every(validOperation)) {
      return Response.json({ ok: false, error: "Invalid native sync operation batch." }, { status: 400 });
    }

    // Migrate the legacy key before the versioned mutation reads Base data.
    await readCurrentData(redis);
    const operations = body.operations as NativeOperation[];
    if (operations.length === 0) {
      return Response.json({ ok: true, data: unwrap(await readCurrentData(redis)), applied: [] });
    }

    const mutation = await mutateBaseDataAtomically(redis, (current) => {
      const applied = applyOperations(current, operations);
      return {
        data: mergeBaseWrite(current, applied, true),
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
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400 });
    console.error("[base/native/sync POST]", error);
    return Response.json({ ok: false, error: "Unable to sync Base data." }, { status: 500 });
  }
}
