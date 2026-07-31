import { Redis } from "@upstash/redis";
import { DATA_KEY, readCurrentData } from "@/lib/bridge-data";
import { requireBridgeSession } from "@/lib/session";

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

// Redis applies the full operation batch in one script so reconnecting clients
// cannot overwrite unrelated records changed by another device between read/write.
const APPLY_OPERATIONS = `
local raw = redis.call("GET", KEYS[1])
local data = raw and cjson.decode(raw) or {}
local operations = cjson.decode(ARGV[1])

if raw then
  redis.call("LPUSH", KEYS[2], raw)
  redis.call("LTRIM", KEYS[2], 0, 24)
end

for _, operation in ipairs(operations) do
  local collection = data[operation.collection]
  if type(collection) ~= "table" then collection = {} end

  local match = nil
  for index, record in ipairs(collection) do
    if type(record) == "table" and tostring(record.id) == operation.recordId then
      match = index
      break
    end
  end

  if operation.action == "delete" then
    if match then table.remove(collection, match) end
  elseif match then
    collection[match] = operation.value
  else
    table.insert(collection, operation.value)
  end

  data[operation.collection] = collection
end

data.updatedAt = tonumber(ARGV[2])
local encoded = cjson.encode(data)
redis.call("SET", KEYS[1], encoded)
return encoded
`;

export async function GET(request: Request) {
  const unauthorized = await requireBridgeSession(request); if (unauthorized) return unauthorized;
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
  const unauthorized = await requireBridgeSession(request); if (unauthorized) return unauthorized;
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

    // This also migrates the legacy key before the Lua script reads DATA_KEY.
    await readCurrentData(redis);
    if (body.operations.length === 0) {
      return Response.json({ ok: true, data: unwrap(await readCurrentData(redis)), applied: [] });
    }

    const updatedAt = Date.now();
    const result = await redis.eval<unknown[], unknown>(
      APPLY_OPERATIONS,
      [DATA_KEY, HISTORY_KEY],
      [JSON.stringify(body.operations), String(updatedAt)],
    );

    return Response.json({
      ok: true,
      data: unwrap(result),
      applied: body.operations.map((operation) => operation.id),
      updatedAt,
    });
  } catch (error) {
    console.error("[bridge/native/sync POST]", error);
    return Response.json({ ok: false, error: "Unable to sync Bridge data." }, { status: 500 });
  }
}
