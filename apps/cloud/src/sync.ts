import type { D1PreparedStatement } from "@cloudflare/workers-types";
import {
  equal,
  mergeOperations,
  readSlot,
  validOperation,
  type Conflict,
  type Document,
  type Operation,
  type SyncRequest,
  type SyncResponse,
} from "../../../packages/sync/src/protocol.ts";
import {
  isAutonomyTask,
  type AutonomyTaskLike,
} from "../../../lib/autonomy.ts";
import { PROTECTED_AUTONOMY_FIELDS } from "../../../packages/core/src/autonomy-contract.ts";
import {
  backupBeforeWrite,
  documentWrites,
  guard,
  snapshot,
  split,
} from "./storage.ts";
import { canGrow, entitlements } from "./plans.ts";
import {
  HttpError,
  bytes,
  now,
  sha,
  type Env,
  type Principal,
} from "./types.ts";
export const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
const protectedOperation = (data: Document, op: Operation) =>
  op.path[0] === "autonomySettings" ||
  (op.path[0] === "tasks" &&
    (op.path.length === 1
      ? Array.isArray(data.tasks) &&
        data.tasks.some((t) => isAutonomyTask(t as unknown as AutonomyTaskLike))
      : (() => {
          const slot = readSlot(data, op.path.slice(0, 2));
          return (
            slot.exists &&
            isAutonomyTask(slot.value as unknown as AutonomyTaskLike) &&
            (op.path.length === 2 ||
              PROTECTED_AUTONOMY_FIELDS.some((k) => op.path[2] === k))
          );
        })()));
export async function stage(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  const { uploadId, index, parts, chunk } = input;
  if (
    input.workspaceId !== principal.workspace.id ||
    typeof uploadId !== "string" ||
    !/^[a-f0-9]{64}$/.test(uploadId) ||
    !Number.isInteger(index) ||
    !Number.isInteger(parts) ||
    Number(parts) < 1 ||
    Number(parts) > 43 ||
    Number(index) < 0 ||
    Number(index) >= Number(parts) ||
    typeof chunk !== "string" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk)
  )
    throw new HttpError(400, "Invalid chunk");
  const binary = Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0));
  if (binary.length > 750_000) throw new HttpError(413, "Chunk too large");
  const key = `staging/${principal.workspace.id}/${uploadId}/${index}`;
  const existing = await env.FILES.head(key);
  if (existing) {
    if (existing.customMetadata?.sha256 !== (await sha(binary)))
      throw new HttpError(
        409,
        "Upload part changed; retain the original operation",
      );
    return;
  }
  const workspace = principal.workspace.id,
    id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commit_guards VALUES(?,CASE WHEN (SELECT coalesce(sum(size),0) FROM staged_parts WHERE workspace_id=? AND expires>?) + ? <=64000000 THEN 1 ELSE 0 END)",
    ).bind(id, workspace, now(), binary.length),
    env.DB.prepare("INSERT INTO staged_parts VALUES(?,?,?,?,?)").bind(
      workspace,
      key,
      binary.length,
      now() + 7 * 86400,
      await sha(binary),
    ),
    env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(id),
  ]);
  try {
    await env.FILES.put(key, binary, {
      customMetadata: { sha256: await sha(binary) },
    });
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM staged_parts WHERE workspace_id=? AND key=?",
    )
      .bind(workspace, key)
      .run();
    throw error;
  }
}
async function resolveOperations(
  env: Env,
  workspace: string,
  values: unknown[],
): Promise<Operation[]> {
  const result: Operation[] = [];
  for (const value of values) {
    let op = value;
    if (value && typeof value === "object" && "uploadId" in value) {
      const reference = value as {
        uploadId: unknown;
        parts: unknown;
        id: unknown;
      };
      if (
        typeof reference.uploadId !== "string" ||
        !/^[a-f0-9]{64}$/.test(reference.uploadId) ||
        !Number.isInteger(reference.parts) ||
        Number(reference.parts) < 1 ||
        Number(reference.parts) > 43
      )
        throw new HttpError(400, "Invalid staged operation");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (let part = 0; part < Number(reference.parts); part++) {
        const file = await env.FILES.get(
          `staging/${workspace}/${reference.uploadId}/${part}`,
        );
        if (!file)
          throw new HttpError(
            409,
            "Staging expired; retry your retained original edit",
          );
        const chunk = new Uint8Array(await file.arrayBuffer());
        length += chunk.length;
        if (length > 32_000_000)
          throw new HttpError(413, "Operation too large");
        chunks.push(chunk);
      }
      const all = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      if ((await sha(all)) !== reference.uploadId)
        throw new HttpError(409, "Upload checksum mismatch");
      op = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
      if ((op as Operation).id !== reference.id)
        throw new HttpError(400, "Operation identity mismatch");
    }
    if (!validOperation(op)) throw new HttpError(400, "Invalid sync operation");
    result.push(op);
  }
  return result;
}
export async function synchronize(
  env: Env,
  principal: Principal,
  input: SyncRequest,
): Promise<SyncResponse> {
  const workspace = principal.workspace.id;
  if (
    input.protocol !== 2 ||
    input.workspaceId !== workspace ||
    !Number.isSafeInteger(input.cursor) ||
    input.cursor < 0 ||
    !Array.isArray(input.operations) ||
    input.operations.length > 200
  )
    throw new HttpError(400, "Workspace, cursor or protocol mismatch");
  const operations = await resolveOperations(env, workspace, input.operations);
  for (let attempt = 0; attempt < 6; attempt++) {
    const snap = await snapshot(env, workspace),
      revision = snap.workspace.revision;
    if (input.cursor > revision)
      return {
        protocol: 2,
        workspaceId: workspace,
        revision,
        data: snap.data,
        applied: [],
        conflicts: [],
        recovery: { reason: "server-reset", previousRevision: input.cursor },
      };
    let data = snap.data;
    const applied: string[] = [],
      conflicts: Conflict[] = [],
      writes: D1PreparedStatement[] = [];
    const ids = [...new Set(operations.map((op) => op.id))],
      paths = [
        ...new Set(
          operations.flatMap((op) =>
            op.path.map((_, i) => JSON.stringify(op.path.slice(0, i + 1))),
          ),
        ),
      ];
    const receipts = new Map<
        string,
        { fingerprint: string; conflict: string }
      >(),
      tombstones = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const rows = await env.DB.prepare(
        `SELECT r.id,r.fingerprint,c.part,c.body FROM receipts r LEFT JOIN receipt_chunks c ON c.workspace_id=r.workspace_id AND c.id=r.id WHERE r.workspace_id=? AND r.id IN (${chunk.map(() => "?").join(",")}) ORDER BY r.id,c.part`,
      )
        .bind(workspace, ...chunk)
        .all<{ id: string; fingerprint: string; body: string | null }>();
      for (const row of rows.results) {
        const old = receipts.get(row.id);
        receipts.set(row.id, {
          fingerprint: row.fingerprint,
          conflict: (old?.conflict ?? "") + (row.body ?? ""),
        });
      }
    }
    for (let i = 0; i < paths.length; i += 90) {
      const chunk = paths.slice(i, i + 90);
      const rows = await env.DB.prepare(
        `SELECT path,revision FROM tombstones WHERE workspace_id=? AND path IN (${chunk.map(() => "?").join(",")})`,
      )
        .bind(workspace, ...chunk)
        .all<{ path: string; revision: number }>();
      for (const row of rows.results) tombstones.set(row.path, row.revision);
    }
    for (const op of operations) {
      const fingerprint = await sha(JSON.stringify(canonical(op)));
      const receipt = receipts.get(op.id);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new HttpError(
            409,
            "Operation ID was reused with different content",
          );
        if (receipt.conflict) conflicts.push(JSON.parse(receipt.conflict));
        else applied.push(op.id);
        continue;
      }
      if (op.baseRevision > revision)
        throw new HttpError(
          409,
          "Operation is ahead of the server; no changes acknowledged",
        );
      let tombstoned = false;
      for (let i = 1; i <= op.path.length; i++) {
        if (
          (tombstones.get(JSON.stringify(op.path.slice(0, i))) ?? -1) >
          op.baseRevision
        )
          tombstoned = true;
      }
      const result =
        tombstoned && op.after.exists
          ? {
              data,
              applied: [],
              conflicts: [
                {
                  id: op.id,
                  operation: op,
                  remote: readSlot(data, op.path, op.action),
                  revision,
                  reason: "tombstone",
                } as Conflict,
              ],
            }
          : mergeOperations(data, [op], revision, (candidate) =>
              protectedOperation(data, candidate),
            );
      data = result.data;
      applied.push(...result.applied);
      conflicts.push(...result.conflicts);
      receipts.set(op.id, {
        fingerprint,
        conflict: result.conflicts.length
          ? JSON.stringify(result.conflicts[0])
          : "",
      });
      writes.push(
        env.DB.prepare("INSERT INTO receipts VALUES(?,?,?)").bind(
          workspace,
          op.id,
          fingerprint,
        ),
      );
      if (result.conflicts.length)
        split(JSON.stringify(result.conflicts[0])).forEach((part, index) =>
          writes.push(
            env.DB.prepare("INSERT INTO receipt_chunks VALUES(?,?,?,?)").bind(
              workspace,
              op.id,
              index,
              part,
            ),
          ),
        );
      if (!op.after.exists && result.applied.length)
        writes.push(
          env.DB.prepare(
            "INSERT INTO tombstones VALUES(?,?,?) ON CONFLICT(workspace_id,path) DO UPDATE SET revision=excluded.revision",
          ).bind(workspace, JSON.stringify(op.path), revision + 1),
        );
    }
    if (!writes.length)
      return {
        protocol: 2,
        workspaceId: workspace,
        revision,
        ...(input.full || input.cursor !== revision || operations.length
          ? { data }
          : {}),
        applied,
        conflicts,
      };
    const changed = !equal(data, snap.data);
    if (changed)
      data = {
        ...data,
        updatedAt: Date.now(),
        dataRevision: Number(data.dataRevision ?? 0) + 1,
      };
    const size = bytes(JSON.stringify(data));
    if (!canGrow(snap.workspace, size))
      throw new HttpError(
        402,
        "Cloud storage is full. Offline edits remain on this device; export data, free space or upgrade.",
      );
    const archive = changed
      ? await backupBeforeWrite(env, workspace, revision, snap.data)
      : null;
    const g = guard(env, workspace, revision, size),
      backupId = crypto.randomUUID();
    try {
      await env.DB.batch([
        g.begin,
        ...documentWrites(env, workspace, snap.data, data),
        ...writes,
        ...(archive
          ? [
              env.DB.prepare("INSERT INTO backups VALUES(?,?,?,?,?,?)").bind(
                workspace,
                backupId,
                revision,
                archive,
                now(),
                now() + entitlements(snap.workspace).recoveryDays * 86400,
              ),
            ]
          : []),
        env.DB.prepare(
          "UPDATE workspaces SET revision=revision+1,document_bytes=? WHERE id=?",
        ).bind(size, workspace),
        g.end,
      ]);
      return {
        protocol: 2,
        workspaceId: workspace,
        revision: revision + 1,
        data,
        applied,
        conflicts,
      };
    } catch (error) {
      if (attempt === 5)
        throw new HttpError(
          409,
          "Workspace changed during sync. Your original operations are retained; retry.",
        );
      if (!(error instanceof Error)) throw error;
    }
  }
  throw new HttpError(409, "Sync contention; retry");
}
