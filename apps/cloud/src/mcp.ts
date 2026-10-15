import { requireEditable } from "./access.ts";
import {
  createMcpEngine,
  type McpPersistence,
} from "../../../packages/server/src/mcp.ts";
import { mergeBaseWrite } from "../../../packages/server/src/autonomy-merge.ts";
import {
  claimAutonomyTaskInData,
  reapExpiredAutonomyLeases,
  submitAutonomyResultInData,
} from "../../../lib/autonomy-control.ts";
import {
  backupBeforeWrite,
  documentWrites,
  documentSize,
  guard,
  snapshot,
} from "./storage.ts";
import { canGrow, entitlements } from "./plans.ts";
import { HttpError, now, type Env, type Principal } from "./types.ts";
import { diff, type Document } from "../../../packages/sync/src/protocol.ts";
import type { BaseData } from "../../../lib/store.ts";

export function workspaceMcp(env: Env, principal: Principal) {
  const id = principal.workspace.id;
  let last: Awaited<ReturnType<typeof snapshot>> | null = null;
  const commit = async (expected: number, before: Document, next: Document) => {
    requireEditable(principal);
    const current = await snapshot(env, id);
    if (current.workspace.revision !== expected)
      throw new HttpError(
        409,
        "Workspace changed. Reload and retry; no data was overwritten.",
      );
    if (!canGrow(current.workspace, documentSize(next)))
      throw new HttpError(
        402,
        "Cloud storage is full; existing data remains available for export.",
      );
    const archived = await backupBeforeWrite(env, id, expected, before),
      g = guard(env, id, expected, documentSize(next));
    const deletions = diff(before, next)
      .filter((op) => !op.after.exists)
      .map((op) =>
        env.DB.prepare(
          "INSERT INTO tombstones VALUES(?,?,?) ON CONFLICT(workspace_id,path) DO UPDATE SET revision=excluded.revision",
        ).bind(id, JSON.stringify(op.path), expected + 1),
      );
    try {
      await env.DB.batch([
        g.begin,
        ...documentWrites(env, id, before, next),
        ...deletions,
        env.DB.prepare("INSERT INTO backups VALUES(?,?,?,?,?,?)").bind(
          id,
          crypto.randomUUID(),
          expected,
          archived,
          now(),
          now() + entitlements(current.workspace).recoveryDays * 86400,
        ),
        env.DB.prepare(
          "UPDATE workspaces SET revision=revision+1,document_bytes=? WHERE id=?",
        ).bind(documentSize(next), id),
        g.end,
      ]);
    } catch {
      throw new HttpError(
        409,
        "Workspace changed during this write; retry after reloading.",
      );
    }
    last = await snapshot(env, id);
  };
  const atomic = async <T>(
    mutate: (data: Document) => { data: Document; result: T; write?: boolean },
  ) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await snapshot(env, id),
        change = mutate(current.data);
      if (change.write === false) return change.result;
      try {
        await commit(current.workspace.revision, current.data, {
          ...change.data,
          updatedAt: Date.now(),
          dataRevision: Number(current.data.dataRevision ?? 0) + 1,
        });
        return change.result;
      } catch (error) {
        if (
          !(error instanceof HttpError) ||
          error.status !== 409 ||
          attempt === 5
        )
          throw error;
      }
    }
    throw new HttpError(409, "Workspace contention; retry");
  };
  const persistence: McpPersistence = {
    async readRawData() {
      last = await snapshot(env, id);
      return last.data as unknown as BaseData;
    },
    async writeRawData(data) {
      if (!last)
        throw new HttpError(409, "Read the current workspace before editing");
      if (
        Number(data.dataRevision ?? 0) !== Number(last.data.dataRevision ?? 0)
      )
        throw new HttpError(409, "Workspace changed; reload before editing");
      const next = mergeBaseWrite(
        last.data,
        data as unknown as Document,
        true,
      ) as Document;
      await commit(last.workspace.revision, last.data, next);
      return true;
    },
    async claimAutonomyTask(taskId, runId, agent, model, startedAt) {
      return atomic((data) => {
        const claim = claimAutonomyTaskInData(data, {
          taskId,
          runId,
          agent,
          model,
          startedAt,
        });
        return {
          data: claim.data as Document,
          result: claim.result,
          write: claim.changed,
        };
      });
    },
    async reapExpiredAutonomyLeasesAtomic() {
      const at = new Date().toISOString();
      return atomic((data) => {
        const reaped = reapExpiredAutonomyLeases(data, at);
        return {
          data: reaped.data as Document,
          result: { ok: true, reaped: reaped.reaped, at },
          write: reaped.reaped > 0,
        };
      });
    },
    async submitAutonomyResult(input) {
      return atomic((data) => {
        const submitted = submitAutonomyResultInData(data, input);
        return {
          data: submitted.data as Document,
          result: submitted.result,
          write: submitted.changed,
        };
      });
    },
  };
  // Every HTTP request gets its own engine/cache. A tenant's raw data never
  // survives in a shared global cache and cannot be served to another account.
  return createMcpEngine(persistence);
}
