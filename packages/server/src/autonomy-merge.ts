import {
  isAutonomyTask,
  type AutonomyTaskLike,
} from "../../../lib/autonomy.ts";
import { PROTECTED_AUTONOMY_FIELDS } from "../../core/src/autonomy-contract.ts";
import type { BaseDataRecord } from "../../../lib/versioned-base-store.ts";
export function taskRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function protectAutonomyTask(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const protectedTask = { ...incoming };
  for (const field of PROTECTED_AUTONOMY_FIELDS) {
    if (field in current) protectedTask[field] = current[field];
    else delete protectedTask[field];
  }
  return protectedTask;
}

export function mergeBaseWrite(
  current: BaseDataRecord,
  incoming: BaseDataRecord,
  preserveAutonomySettings: boolean,
): BaseDataRecord {
  const currentTasks = taskRecords(current.tasks);
  const incomingTasks = taskRecords(incoming.tasks);
  const currentById = new Map(
    currentTasks
      .filter((task) => typeof task.id === "string")
      .map((task) => [task.id as string, task]),
  );
  const mergedTasks = incomingTasks.map((task) => {
    const id = typeof task.id === "string" ? task.id : null;
    const currentTask = id ? currentById.get(id) : undefined;
    if (
      !currentTask ||
      !isAutonomyTask(currentTask as unknown as AutonomyTaskLike)
    )
      return { ...task };
    currentById.delete(id!);
    return protectAutonomyTask(currentTask, task);
  });

  for (const task of currentById.values()) {
    if (isAutonomyTask(task as unknown as AutonomyTaskLike))
      mergedTasks.push(task);
  }

  const next: BaseDataRecord = {
    ...current,
    ...incoming,
    tasks: mergedTasks,
    dataRevision: Number(current.dataRevision ?? 0) + 1,
  };
  if (preserveAutonomySettings)
    next.autonomySettings = current.autonomySettings;
  return next;
}
