import { NextRequest } from "next/server";
import { hasValidSession } from "@/lib/session-cookie";
import { workspaceIdentity } from "@/lib/desktop-session";
import { mcpRedis } from "@/lib/mcp-data";
import { CHUNK_BYTES, chunkKey, validReference } from "@/lib/staged-sync";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!(await hasValidSession(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const redis = mcpRedis();
  if (!redis) return Response.json({ error: "Sync storage is not configured." }, { status: 503 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 2_000_000) return Response.json({ error: "Chunk too large." }, { status: 413 });
    const body = JSON.parse(raw);
    const workspaceId = await workspaceIdentity();
    if (body.workspaceId !== workspaceId) return Response.json({ error: "Workspace mismatch." }, { status: 403 });
    const index = body.index;
    const chunk = body.chunk;
    if (!validReference(body) || !Number.isInteger(index) || index < 0 || index >= body.parts || typeof chunk !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk) || Buffer.from(chunk, "base64").length > CHUNK_BYTES) {
      return Response.json({ error: "Invalid upload chunk." }, { status: 400 });
    }
    // Staging is temporary; the outbox remains the durable source until the
    // complete operation is atomically committed by /api/native/sync.
    await redis.set(chunkKey(workspaceId!, body.uploadId, index), chunk, { ex: 7 * 24 * 60 * 60 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Could not stage this upload." }, { status: 400 }); }
}
