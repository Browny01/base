import type { D1PreparedStatement } from "@cloudflare/workers-types";
import {
  equal,
  type Document,
  type Json,
} from "../../../packages/sync/src/protocol.ts";
import {
  bytes,
  HttpError,
  now,
  sha,
  type Env,
  type WorkspaceRow,
} from "./types.ts";
export function encodeDocument(document: Document) {
  const nodes = new Map<string, string>();
  for (const [root, value] of Object.entries(document)) {
    const records =
      Array.isArray(value) &&
      value.every(
        (v) =>
          v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof v.id === "string",
      ) &&
      new Set(value.map((v) => (v as Document).id)).size === value.length;
    const key = JSON.stringify([root]);
    if (records) {
      nodes.set(
        key,
        JSON.stringify({
          kind: "records",
          order: (value as Document[]).map((v) => v.id),
        }),
      );
      for (const record of value as Document[])
        nodes.set(JSON.stringify([root, record.id]), JSON.stringify(record));
    } else nodes.set(key, JSON.stringify({ kind: "value", value }));
  }
  return nodes;
}
export function split(value: string) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length;) {
    let end = Math.min(value.length, i + 128_000);
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(value.slice(i, end));
    i = end;
  }
  return chunks;
}
export function decodeDocument(
  rows: { node: string; part: number; body: string }[],
): Document {
  const values = new Map<string, string>();
  for (const row of rows)
    values.set(row.node, (values.get(row.node) ?? "") + row.body);
  const result = Object.create(null) as Document;
  for (const [key, raw] of values) {
    const path = JSON.parse(key) as string[];
    if (path.length !== 1) continue;
    const metadata = JSON.parse(raw);
    result[path[0]] =
      metadata.kind === "records"
        ? metadata.order.map((id: string) => {
            const record = values.get(JSON.stringify([path[0], id]));
            if (record === undefined)
              throw new Error(
                "Incomplete stored record; no changes were acknowledged.",
              );
            return JSON.parse(record) as Json;
          })
        : metadata.value;
  }
  return result;
}
export async function snapshot(env: Env, workspace: string) {
  const results = await env.DB.batch([
    env.DB.prepare("SELECT * FROM workspaces WHERE id=?").bind(workspace),
    env.DB.prepare(
      "SELECT node,part,body FROM documents WHERE workspace_id=? ORDER BY node,part",
    ).bind(workspace),
  ]);
  const row = results[0].results[0] as unknown as WorkspaceRow;
  if (!row) throw new HttpError(404, "Workspace not found");
  return {
    workspace: row,
    data: decodeDocument(
      results[1].results as { node: string; part: number; body: string }[],
    ),
  };
}
export function documentWrites(
  env: Env,
  workspace: string,
  before: Document,
  after: Document,
) {
  const old = encodeDocument(before),
    next = encodeDocument(after);
  const writes: D1PreparedStatement[] = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    if (old.get(key) === next.get(key)) continue;
    writes.push(
      env.DB.prepare(
        "DELETE FROM documents WHERE workspace_id=? AND node=?",
      ).bind(workspace, key),
    );
    const value = next.get(key);
    if (value !== undefined)
      split(value).forEach((body, part) =>
        writes.push(
          env.DB.prepare("INSERT INTO documents VALUES(?,?,?,?)").bind(
            workspace,
            key,
            part,
            body,
          ),
        ),
      );
  }
  return writes;
}
export function guard(
  env: Env,
  workspace: string,
  revision: number,
  nextBytes: number,
) {
  const id = crypto.randomUUID();
  const sql =
    "INSERT INTO commit_guards VALUES(?,coalesce((SELECT CASE WHEN revision=? AND ((?+file_bytes+reserved_bytes)<=CASE WHEN plan='plus' AND subscription_status IN ('active','trialing') AND paid_until>? THEN 10000000000 ELSE 250000000 END OR ?<=document_bytes) THEN 1 ELSE 0 END FROM workspaces WHERE id=? AND owner_id IN (SELECT id FROM accounts WHERE status='active')),0))";
  return {
    begin: env.DB.prepare(sql).bind(
      id,
      revision,
      nextBytes,
      now(),
      nextBytes,
      workspace,
    ),
    end: env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(id),
  };
}
export async function backupBeforeWrite(
  env: Env,
  workspace: string,
  revision: number,
  data: Document,
  id: string = crypto.randomUUID(),
) {
  const raw = JSON.stringify({
    format: "base-recovery-v1",
    workspaceId: workspace,
    revision,
    data,
  });
  const digest = await sha(raw);
  const key = `recovery/${workspace}/${id}.json`;
  // A stable queue job ID reuses its copy; separate archives never share an
  // expiring object. Checksums remain available for integrity validation.
  await env.DB.prepare("INSERT OR IGNORE INTO recovery_objects VALUES(?,?,?)")
    .bind(workspace, key, now())
    .run();
  if (!(await env.FILES.head(key)))
    await env.FILES.put(key, raw, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { sha256: digest, revision: String(revision) },
    });
  return key;
}
export async function replaceForImport(
  env: Env,
  workspace: string,
  expected: number,
  data: Document,
  archiveId: string,
) {
  const old = await snapshot(env, workspace);
  if (old.workspace.revision !== expected)
    throw new HttpError(409, "Workspace changed. Review it before importing.");
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new HttpError(400, "Invalid snapshot");
  const oldKey = await backupBeforeWrite(env, workspace, expected, old.data);
  const raw = JSON.stringify(data),
    g = guard(env, workspace, expected, bytes(raw));
  await env.DB.batch([
    g.begin,
    ...documentWrites(env, workspace, old.data, data),
    env.DB.prepare("INSERT INTO migration_archives VALUES(?,?,?,?,?)").bind(
      workspace,
      archiveId,
      oldKey,
      await sha(JSON.stringify(old.data)),
      now(),
    ),
    env.DB.prepare(
      "UPDATE workspaces SET revision=revision+1,document_bytes=? WHERE id=?",
    ).bind(bytes(raw), workspace),
    g.end,
  ]);
  return { archiveId, revision: expected + 1 };
}
export { equal };

/** Rollback is allowed only before any post-import change. Later recovery
 * requires a separate copy so concurrent device edits cannot be discarded. */
export async function rollbackImport(
  env: Env,
  workspace: string,
  archiveId: string,
  expected: number,
) {
  const archive = await env.DB.prepare(
    "SELECT key,sha256 FROM migration_archives WHERE workspace_id=? AND id=?",
  )
    .bind(workspace, archiveId)
    .first<{ key: string; sha256: string }>();
  if (!archive) throw new HttpError(404, "Import rollback archive not found");
  const object = await env.FILES.get(archive.key);
  if (!object)
    throw new HttpError(
      503,
      "Rollback archive unavailable; existing data is retained",
    );
  const saved = JSON.parse(await object.text()) as {
    format: string;
    workspaceId: string;
    revision: number;
    data: Document;
  };
  if (
    saved.format !== "base-recovery-v1" ||
    saved.workspaceId !== workspace ||
    saved.revision !== 0 ||
    expected !== 1 ||
    (await sha(JSON.stringify(saved.data))) !== archive.sha256
  )
    throw new HttpError(409, "Rollback identity or checksum failed");
  const current = await snapshot(env, workspace);
  if (current.workspace.revision !== expected)
    throw new HttpError(
      409,
      "This workspace changed after import. Restore into a separate copy to retain those edits.",
    );
  const rollbackArchiveId = crypto.randomUUID();
  // Retain the imported state as well. Revisions remain monotonic; a rollback
  // never changes credentials, operation receipts or another workspace.
  const result = await replaceForImport(
    env,
    workspace,
    expected,
    saved.data,
    rollbackArchiveId,
  );
  return { revision: result.revision, rollbackArchiveId };
}
