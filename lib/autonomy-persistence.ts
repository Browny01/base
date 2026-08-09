import type { Redis } from "@upstash/redis";
import type { BridgeData, Task } from "./store.ts";
import {
  isAutonomyTask,
  reviewAutonomyTask,
  type AutonomyReviewDecision,
  type AutonomyTaskLike,
} from "./autonomy.ts";
import { mutateBridgeDataAtomically, updateBridgeDataAtomically, type BridgeDataRecord } from "./versioned-bridge-store.ts";

const PROTECTED_AUTONOMY_FIELDS = [
  "done",
  "completedAt",
  "executionState",
  "executionId",
  "executionStartedAt",
  "executionFinishedAt",
  "executionLeaseUntil",
  "leaseUntil",
  "executionOwner",
  "startedAt",
  "approvedAt",
  "lastLeaseExpiredAt",
  "lastExecutionStartedAt",
  "requeuedAt",
  "executionAgent",
  "workerModel",
  "executionEvidence",
  "resultSummary",
  "resultNoteId",
  "nightExecutedAt",
  "verificationStatus",
  "verifiedAt",
  "correctionAttempts",
  "implementationApproved",
  "blockedReason",
] as const;

function taskRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function protectAutonomyTask(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const protectedTask = { ...incoming };
  for (const field of PROTECTED_AUTONOMY_FIELDS) {
    if (field in current) protectedTask[field] = current[field];
    else delete protectedTask[field];
  }
  return protectedTask;
}

export function mergeBridgeWrite(
  current: BridgeDataRecord,
  incoming: BridgeDataRecord,
  preserveAutonomySettings: boolean,
): BridgeDataRecord {
  const currentTasks = taskRecords(current.tasks);
  const incomingTasks = taskRecords(incoming.tasks);
  const currentById = new Map(currentTasks.filter((task) => typeof task.id === "string").map((task) => [task.id as string, task]));
  const mergedTasks = incomingTasks.map((task) => {
    const id = typeof task.id === "string" ? task.id : null;
    const currentTask = id ? currentById.get(id) : undefined;
    if (!currentTask || !isAutonomyTask(currentTask as unknown as AutonomyTaskLike)) return { ...task };
    currentById.delete(id!);
    return protectAutonomyTask(currentTask, task);
  });

  for (const task of currentById.values()) {
    if (isAutonomyTask(task as unknown as AutonomyTaskLike)) mergedTasks.push(task);
  }

  const next: BridgeDataRecord = {
    ...incoming,
    tasks: mergedTasks,
    dataRevision: Number(current.dataRevision ?? 0) + 1,
  };
  if (preserveAutonomySettings) next.autonomySettings = current.autonomySettings;
  return next;
}

export async function safeWriteBridgeData(redis: Redis, data: BridgeData, preserveAutonomySettings: boolean): Promise<void> {
  await updateBridgeDataAtomically(redis, (current) => mergeBridgeWrite(current, data as unknown as BridgeDataRecord, preserveAutonomySettings));
}

type OwnerDecision = "approve" | AutonomyReviewDecision;

export async function applyOwnerAutonomyDecision(
  redis: Redis,
  taskId: string,
  decision: OwnerDecision,
  timestamp: string,
): Promise<{ ok: boolean; error?: string; task?: Task }> {
  const mutation = await mutateBridgeDataAtomically<{ ok: boolean; error?: string; task?: AutonomyTaskLike }>(redis, (current) => {
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
  settings: BridgeData["autonomySettings"],
): Promise<{ ok: boolean; error?: string; settings?: BridgeData["autonomySettings"] }> {
  const mutation = await mutateBridgeDataAtomically(redis, (current) => ({
    data: {
      ...current,
      autonomySettings: settings,
      dataRevision: Number(current.dataRevision ?? 0) + 1,
    },
    result: { ok: true, settings },
  }));
  return mutation.result;
}
