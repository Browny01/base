import { encodeNodes, decodeNodes } from "../../../packages/sync/src/nodes.ts";
import type {
  Operation,
  Document,
} from "../../../packages/sync/src/protocol.ts";
import { bytes, HttpError, type Env, type WorkspaceRow } from "./types.ts";
/** Load only affected records; missing siblings are identity placeholders, never written back. */
export async function recordSnapshot(
  env: Env,
  workspace: string,
  operations: Operation[],
) {
  const roots = [
    ...new Set([
      ...operations.map((op) => String(op.path[0])),
      "updatedAt",
      "dataRevision",
    ]),
  ];
  const keys = roots.map((root) => JSON.stringify([root]));
  const records = operations
    .filter((op) => typeof op.path[1] === "object")
    .map((op) =>
      JSON.stringify([op.path[0], (op.path[1] as { id: string }).id]),
    );
  const fullRoots = operations
    .filter((op) => op.path.length === 1 && op.action === "set")
    .map((op) => String(op.path[0]));
  const selection = [...new Set([...keys, ...records])];
  const result = await env.DB.batch([
    env.DB.prepare(
      "SELECT w.*,(SELECT coalesce(sum(document_bytes+file_bytes+reserved_bytes),0) FROM workspaces owned WHERE owned.owner_id=w.owner_id) AS owner_bytes FROM workspaces w WHERE w.id=?",
    ).bind(workspace),
    env.DB.prepare(
      `SELECT node,part,body FROM documents WHERE workspace_id=? AND (node IN (${selection.map(() => "?").join(",")})${fullRoots.length ? ` OR json_extract(node,'$[0]') IN (${fullRoots.map(() => "?").join(",")})` : ""}) ORDER BY node,part`,
    ).bind(workspace, ...selection, ...fullRoots),
  ]);
  const row = result[0].results[0] as unknown as WorkspaceRow;
  if (!row) throw new HttpError(404, "Workspace unavailable");
  const nodes = new Map<string, string>();
  for (const part of result[1].results as { node: string; body: string }[])
    nodes.set(part.node, (nodes.get(part.node) ?? "") + part.body);
  return { workspace: row, data: decodeNodes(nodes, true) };
}
export function recordSize(
  workspace: WorkspaceRow,
  before: Document,
  after: Document,
) {
  const old = encodeNodes(before),
    next = encodeNodes(after);
  let delta = 0;
  for (const key of new Set([...old.keys(), ...next.keys()]))
    delta += bytes(next.get(key) ?? "") - bytes(old.get(key) ?? "");
  return Math.max(0, workspace.document_bytes + delta);
}
export async function nodePage(env: Env, workspace: string, url: URL) {
  const cursor = Number(url.searchParams.get("cursor") ?? 0),
    target = Number(url.searchParams.get("revision") ?? -1),
    full = url.searchParams.get("full") === "1";
  let after: [string, number] = ["", -1];
  const raw = url.searchParams.get("after");
  if (raw) {
    try {
      after = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid page cursor");
    }
  }
  if (
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    !Number.isSafeInteger(target) ||
    target < -1 ||
    !Array.isArray(after) ||
    after.length !== 2 ||
    typeof after[0] !== "string" ||
    after[0].length > 2048 ||
    !Number.isSafeInteger(after[1]) ||
    after[1] < -1
  )
    throw new HttpError(400, "Invalid sync cursor");
  const result = await env.DB.batch([
    env.DB.prepare("SELECT revision FROM workspaces WHERE id=?").bind(
      workspace,
    ),
    env.DB.prepare(
      `SELECT v.node,d.part,d.body,v.deleted FROM document_versions v LEFT JOIN documents d ON d.workspace_id=v.workspace_id AND d.node=v.node WHERE v.workspace_id=? AND (?=1 OR v.revision>?) AND (v.node>? OR (v.node=? AND coalesce(d.part,-1)>?)) ORDER BY v.node,coalesce(d.part,-1) LIMIT 5`,
    ).bind(workspace, full ? 1 : 0, cursor, after[0], after[0], after[1]),
  ]);
  const revision = (result[0].results[0] as { revision: number })?.revision;
  if (revision === undefined) throw new HttpError(404, "Workspace unavailable");
  if (cursor > revision || (target !== -1 && target !== revision))
    throw new HttpError(
      409,
      "Workspace changed during download; retry from the retained cache",
    );
  const rows = result[1].results as {
    node: string;
    part: number | null;
    body: string | null;
    deleted: number;
  }[];
  const page = rows.slice(0, 4),
    last = page.at(-1);
  return {
    workspaceId: workspace,
    revision,
    parts: page,
    next:
      rows.length > 4 && last
        ? JSON.stringify([last.node, last.part ?? -1])
        : null,
  };
}

export async function recordHistory(
  env: Env,
  workspace: WorkspaceRow,
  url: URL,
) {
  const node = url.searchParams.get("node"),
    before = Number(url.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER),
    part = Number(url.searchParams.get("part") ?? 0);
  if (
    !node ||
    node.length > 2048 ||
    !Number.isSafeInteger(before) ||
    before < 0 ||
    !Number.isSafeInteger(part) ||
    part < 0
  )
    throw new HttpError(400, "Choose a record and valid history cursor");
  const { entitlements } = await import("./plans.ts");
  const cutoff =
    Math.floor(Date.now() / 1000) -
    entitlements(workspace).recoveryDays * 86400;
  const result = await env.DB.prepare(
    "SELECT revision,part,body,created_at FROM node_history WHERE workspace_id=? AND node=? AND created_at>=? AND (revision<? OR (revision=? AND part>=?)) ORDER BY revision DESC,part LIMIT 5",
  )
    .bind(workspace.id, node, cutoff, before, before, part)
    .all<{
      revision: number;
      part: number;
      body: string;
      created_at: number;
    }>();
  const rows = result.results.slice(0, 4),
    next = result.results[4];
  return {
    node,
    parts: rows,
    next: next ? { before: next.revision, part: next.part } : null,
  };
}
