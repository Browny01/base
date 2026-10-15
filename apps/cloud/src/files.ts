import { requireEditable } from "./access.ts";
import type { ReadableStream as WorkerStream } from "@cloudflare/workers-types";
import { entitlements } from "./plans.ts";
import { HttpError, now, type Env, type Principal } from "./types.ts";
export async function upload(env: Env, principal: Principal, request: Request) {
  requireEditable(principal);
  const limit = entitlements(principal.workspace).uploadBytes;
  const advertised = Number(request.headers.get("Content-Length"));
  if (!Number.isSafeInteger(advertised) || advertised <= 0 || !request.body)
    throw new HttpError(411, "A known file size is required");
  if (advertised > limit)
    throw new HttpError(413, "File exceeds your plan's upload limit");

  const id = crypto.randomUUID(),
    workspace = principal.workspace.id,
    key = `files/${workspace}/${id}`,
    g = crypto.randomUUID(),
    name = (
      new URL(request.url).searchParams.get("filename") || "Attachment"
    ).slice(0, 200),
    mime = (
      request.headers.get("Content-Type") || "application/octet-stream"
    ).slice(0, 200),
    size = advertised;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO commit_guards VALUES(?,coalesce((SELECT CASE WHEN (SELECT coalesce(sum(document_bytes+file_bytes+reserved_bytes),0) FROM workspaces owned WHERE owned.owner_id=workspaces.owner_id)+?<=CASE WHEN plan='plus' AND subscription_status IN ('active','trialing') AND paid_until>? THEN 10000000000 ELSE 250000000 END THEN 1 ELSE 0 END FROM workspaces WHERE id=? AND owner_id IN (SELECT id FROM accounts WHERE status='active')),0))",
      ).bind(g, size, now(), workspace),
      env.DB.prepare(
        "INSERT INTO files(workspace_id,id,name,mime,size,status,created_at) VALUES(?,?,?,?,?,'pending',?)",
      ).bind(workspace, id, name, mime, size, now()),
      env.DB.prepare(
        "UPDATE workspaces SET reserved_bytes=reserved_bytes+? WHERE id=?",
      ).bind(size, workspace),
      env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(g),
    ]);
  } catch {
    throw new HttpError(
      402,
      "Cloud storage is full. Existing data remains available for export.",
    );
  }
  try {
    const stored = await env.FILES.put(
      key,
      request.body as unknown as WorkerStream,
      { httpMetadata: { contentType: mime, contentDisposition: "attachment" } },
    );
    if (!stored || stored.size !== size)
      throw new HttpError(400, "Uploaded size did not match the reserved file");
    const guard = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM files WHERE workspace_id=? AND id=? AND status='pending') THEN 1 ELSE 0 END)",
      ).bind(guard, workspace, id),
      env.DB.prepare(
        "UPDATE files SET status='ready' WHERE workspace_id=? AND id=?",
      ).bind(workspace, id),
      env.DB.prepare(
        "UPDATE workspaces SET reserved_bytes=reserved_bytes-?,file_bytes=file_bytes+? WHERE id=?",
      ).bind(size, size, workspace),
      env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
    ]);
  } catch (error) {
    // The database may have committed before a response was lost. Inspect its
    // durable result before removing an object acknowledged by that commit.
    const saved = await env.DB.prepare(
      "SELECT status FROM files WHERE workspace_id=? AND id=?",
    )
      .bind(workspace, id)
      .first<{ status: string }>();
    if (saved?.status === "ready")
      return {
        configured: true,
        url: `${env.PUBLIC_URL}/api/files/${id}`,
        id,
        size,
      };
    await env.FILES.delete(key);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE workspaces SET reserved_bytes=max(0,reserved_bytes-?) WHERE id=? AND EXISTS(SELECT 1 FROM files WHERE workspace_id=? AND id=? AND status='pending')",
      ).bind(size, workspace, workspace, id),
      env.DB.prepare(
        "DELETE FROM files WHERE workspace_id=? AND id=? AND status='pending'",
      ).bind(workspace, id),
    ]);
    throw error;
  }
  return {
    configured: true,
    url: `${env.PUBLIC_URL}/api/files/${id}`,
    id,
    size,
  };
}
export async function readFile(env: Env, principal: Principal, id: string) {
  if (!/^[\w-]{36}$/.test(id)) throw new HttpError(400, "Invalid file");
  const row = await env.DB.prepare(
    "SELECT mime,name FROM files WHERE workspace_id=? AND id=? AND status='ready'",
  )
    .bind(principal.workspace.id, id)
    .first<{ mime: string; name: string }>();
  if (!row) throw new HttpError(404, "File not found");
  const object = await env.FILES.get(`files/${principal.workspace.id}/${id}`);
  if (!object) throw new HttpError(404, "File unavailable");
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      "Content-Type": row.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function deleteFile(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  requireEditable(principal);
  let id = input.id;
  if (typeof input.url === "string") {
    const url = new URL(input.url);
    if (url.origin !== new URL(env.PUBLIC_URL).origin)
      throw new HttpError(400, "File is outside this workspace");
    id = url.pathname.replace(/^\/api\/files\//, "");
  }
  if (typeof id !== "string" || !/^[\w-]{36}$/.test(id))
    throw new HttpError(400, "Invalid file");
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE workspaces SET file_bytes=max(0,file_bytes-coalesce((SELECT size FROM files WHERE workspace_id=? AND id=? AND status='ready'),0)) WHERE id=?",
    ).bind(principal.workspace.id, id, principal.workspace.id),
    env.DB.prepare(
      "UPDATE files SET status='deleted',deleted_at=? WHERE workspace_id=? AND id=? AND status='ready'",
    ).bind(now(), principal.workspace.id, id),
  ]);
  // Actual object deletion waits for the plan's recovery horizon.
  return { ok: true };
}
