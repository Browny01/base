import type { Redis } from "@upstash/redis";
import type { BaseData, Task } from "./store.ts";
import {
  reviewAutonomyTask,
  type AutonomyReviewDecision,
  type AutonomyTaskLike,
} from "./autonomy.ts";
import { mutateBaseDataAtomically, updateBaseDataAtomically, type BaseDataRecord } from "./versioned-base-store.ts";

export { PROTECTED_AUTONOMY_FIELDS } from "../packages/core/src/autonomy-contract.ts";

import {mergeBaseWrite,taskRecords} from "../packages/server/src/autonomy-merge.ts";
export {mergeBaseWrite} from "../packages/server/src/autonomy-merge.ts";
export async function safeWriteBaseData(redis: Redis, data: BaseData, preserveAutonomySettings: boolean, options: { allowStale?: boolean } = {}): Promise<void> {
  await updateBaseDataAtomically(redis, (current) => {
    if (!options.allowStale && Number(data.dataRevision ?? 0) !== Number(current.dataRevision ?? 0)) throw new StaleBaseWriteError();
    return mergeBaseWrite(current, data as unknown as BaseDataRecord, preserveAutonomySettings);
  });
}
export class StaleBaseWriteError extends Error {
  constructor() { super("Base changed since this snapshot was read. Reload the current data and retry; no data was overwritten."); }
}

type OwnerDecision = "approve" | AutonomyReviewDecision;

export async function applyOwnerAutonomyDecision(
  redis: Redis,
  taskId: string,
  decision: OwnerDecision,
  timestamp: string,
): Promise<{ ok: boolean; error?: string; task?: Task }> {
  const mutation = await mutateBaseDataAtomically<{ ok: boolean; error?: string; task?: AutonomyTaskLike }>(redis, (current) => {
    const tasks = taskRecords(current.tasks);
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return { data: current, result: { ok: false, error: "Task not found." } };

    const existing = tasks[index] as unknown as AutonomyTaskLike;
    let reviewed: { ok: boolean; error?: string; task: AutonomyTaskLike };
    if (decision === "approve") {
      if (existing.executionState !== "suggested" && existing.executionState !== "needs_input") {
        reviewed = { ok: false, error: "Only suggested or input-gated work can be approved.", task: existing };
      } else {
        reviewed = {
          ok: true,
          task: {
            ...existing,
            done: false,
            implementationApproved: true,
            approvedAt: timestamp,
            executionState: "queued",
          },
        };
      }
    } else {
      const maxCorrections = Number((current.autonomySettings as Record<string, unknown> | undefined)?.maxCorrectionAttempts ?? 1);
      reviewed = reviewAutonomyTask(existing, decision, timestamp, maxCorrections);
    }

    if (reviewed.task === existing) return { data: current, result: reviewed };
    const nextTasks = [...tasks];
    nextTasks[index] = reviewed.task as unknown as Record<string, unknown>;
    return {
      data: { ...current, tasks: nextTasks, dataRevision: Number(current.dataRevision ?? 0) + 1 },
      result: reviewed,
    };
  });
  return mutation.result as { ok: boolean; error?: string; task?: Task };
}

export async function updateAutonomySettings(
  redis: Redis,
  settings: BaseData["autonomySettings"],
): Promise<{ ok: boolean; error?: string; settings?: BaseData["autonomySettings"] }> {
  const mutation = await mutateBaseDataAtomically(redis, (current) => ({
    data: {
      ...current,
      autonomySettings: settings,
      dataRevision: Number(current.dataRevision ?? 0) + 1,
    },
    result: { ok: true, settings },
  }));
  return mutation.result;
}
