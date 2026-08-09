import {
  isAutonomyTask,
  normalizeAutonomySettings,
  type AutonomyTaskLike,
} from "./autonomy.ts";
import type { BridgeDataRecord } from "./versioned-bridge-store.ts";

export type AtomicAutonomyResult = {
  ok: boolean;
  error?: string;
  task?: Record<string, unknown>;
  runId?: string;
};

export type ClaimAutonomyInput = {
  taskId: string;
  runId: string;
  agent: string;
  model: string;
  startedAt: string;
};

export type SubmitAutonomyInput = {
  taskId: string;
  runId: string;
  state: "awaiting_review" | "blocked" | "needs_input";
  summary: string;
  evidence: unknown[];
  finishedAt: string;
  resultNoteId?: string;
  blockedReason?: string;
};

type DataMutation = {
  data: BridgeDataRecord;
  result: AtomicAutonomyResult;
  changed: boolean;
};

function tasksIn(data: BridgeDataRecord): Array<Record<string, unknown>> {
  return Array.isArray(data.tasks)
    ? data.tasks.filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === "object" && !Array.isArray(task))
    : [];
}

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localDateKey(timestamp: number, offsetMinutes: number): string {
  return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function minutesOfLocalDay(timestamp: number, offsetMinutes: number): number {
  const date = new Date(timestamp + offsetMinutes * 60_000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseHhMm(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isInsideWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function withoutActiveLease(task: Record<string, unknown>, expiredAt: string, requeuedAt: string): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...task,
    executionState: "queued",
    lastExpiredExecutionId: task.executionId,
    lastExecutionStartedAt: task.executionStartedAt ?? task.startedAt,
    lastLeaseExpiredAt: expiredAt,
    requeuedAt,
    executionNote: "Previous execution lease expired; task was requeued automatically.",
  };
  for (const field of ["executionId", "executionOwner", "executionAgent", "executionStartedAt", "startedAt", "executionLeaseUntil", "leaseUntil"] as const) {
    delete next[field];
  }
  return next;
}

export function reapExpiredAutonomyLeases(data: BridgeDataRecord, nowIso: string): { data: BridgeDataRecord; reaped: number } {
  const now = parseTime(nowIso);
  if (now == null) return { data, reaped: 0 };
  let reaped = 0;
  const tasks = tasksIn(data).map((task) => {
    if (task.executionState !== "in_progress") return task;
    const leaseValue = task.executionLeaseUntil ?? task.leaseUntil;
    const lease = parseTime(leaseValue);
    if (lease == null || lease > now) return task;
    reaped += 1;
    return withoutActiveLease(task, new Date(lease).toISOString(), nowIso);
  });
  return reaped > 0
    ? { data: { ...data, tasks, dataRevision: Number(data.dataRevision ?? 0) + 1 }, reaped }
    : { data, reaped: 0 };
}

export function claimAutonomyTaskInData(data: BridgeDataRecord, input: ClaimAutonomyInput): DataMutation {
  const startedMs = parseTime(input.startedAt);
  if (startedMs == null) return { data, result: { ok: false, error: "Invalid claim timestamp." }, changed: false };

  const reaped = reapExpiredAutonomyLeases(data, input.startedAt);
  const current = reaped.data;
  const tasks = tasksIn(current);
  const targetIndex = tasks.findIndex((task) => task.id === input.taskId);
  if (targetIndex < 0) return { data: current, result: { ok: false, error: "Task not found." }, changed: reaped.reaped > 0 };
  const target = tasks[targetIndex];

  if (target.executionState === "in_progress" && target.executionId === input.runId) {
    return { data: current, result: { ok: true, task: target, runId: input.runId }, changed: reaped.reaped > 0 };
  }
  if (!isAutonomyTask(target as unknown as AutonomyTaskLike)) {
    return { data: current, result: { ok: false, error: "Task is not in the autonomous queue." }, changed: reaped.reaped > 0 };
  }
  if (target.done === true || target.executionState !== "queued") {
    return { data: current, result: { ok: false, error: "Task is not queued." }, changed: reaped.reaped > 0 };
  }

  const settings = normalizeAutonomySettings(current.autonomySettings);
  if (!settings.enabled) return { data: current, result: { ok: false, error: "Autonomy is paused." }, changed: reaped.reaped > 0 };

  const running = tasks.filter((task) => task.executionState === "in_progress").length;
  if (running >= settings.maxConcurrentWorkers) {
    return { data: current, result: { ok: false, error: "Worker capacity is full." }, changed: reaped.reaped > 0 };
  }

  const today = localDateKey(startedMs, settings.timezoneOffsetMinutes);
  const todayRuns = tasks.filter((task) => {
    const timestamp = parseTime(task.executionStartedAt ?? task.lastExecutionStartedAt);
    return timestamp != null && localDateKey(timestamp, settings.timezoneOffsetMinutes) === today;
  }).length;
  if (todayRuns >= settings.dailyRunLimit) {
    return { data: current, result: { ok: false, error: "Daily run limit reached." }, changed: reaped.reaped > 0 };
  }

  const localMinute = minutesOfLocalDay(startedMs, settings.timezoneOffsetMinutes);
  if (!isInsideWindow(localMinute, parseHhMm(settings.workingHoursStart), parseHhMm(settings.workingHoursEnd))) {
    return { data: current, result: { ok: false, error: "Outside the allowed working window." }, changed: reaped.reaped > 0 };
  }

  const doneIds = new Set(tasks.filter((task) => task.done === true || task.executionState === "completed").map((task) => task.id));
  if (Array.isArray(target.dependencyIds) && target.dependencyIds.some((dependency) => typeof dependency !== "string" || !doneIds.has(dependency))) {
    return { data: current, result: { ok: false, error: "A dependency is incomplete." }, changed: reaped.reaped > 0 };
  }
  if (typeof target.taskClass === "string" && !settings.allowedTaskClasses.includes(target.taskClass as never)) {
    return { data: current, result: { ok: false, error: "Task class is not allowed." }, changed: reaped.reaped > 0 };
  }
  if (typeof target.workspace === "string" && !settings.allowedWorkspaces.includes(target.workspace)) {
    return { data: current, result: { ok: false, error: "Workspace is not allowed." }, changed: reaped.reaped > 0 };
  }
  if (target.taskClass === "implementation" && settings.requireApprovalForImplementation && target.implementationApproved !== true) {
    return { data: current, result: { ok: false, error: "Implementation requires owner approval." }, changed: reaped.reaped > 0 };
  }

  const leaseUntil = new Date(startedMs + 2 * 60 * 60_000).toISOString();
  const claimed = {
    ...target,
    executionState: "in_progress",
    executionId: input.runId,
    executionOwner: input.agent,
    executionAgent: input.agent,
    executionStartedAt: input.startedAt,
    startedAt: input.startedAt,
    executionLeaseUntil: leaseUntil,
    leaseUntil,
    workerModel: input.model,
  };
  const nextTasks = [...tasks];
  nextTasks[targetIndex] = claimed;
  const nextData = { ...current, tasks: nextTasks, dataRevision: Number(current.dataRevision ?? 0) + 1 };
  return { data: nextData, result: { ok: true, task: claimed, runId: input.runId }, changed: true };
}

export function submitAutonomyResultInData(data: BridgeDataRecord, input: SubmitAutonomyInput): DataMutation {
  const tasks = tasksIn(data);
  const targetIndex = tasks.findIndex((task) => task.id === input.taskId);
  if (targetIndex < 0) return { data, result: { ok: false, error: "Task not found." }, changed: false };
  const target = tasks[targetIndex];
  if (target.executionState !== "in_progress" || target.executionId !== input.runId) {
    return { data, result: { ok: false, error: "Run does not own this task." }, changed: false };
  }

  const submitted: Record<string, unknown> = {
    ...target,
    executionState: input.state,
    resultSummary: input.summary,
    executionEvidence: input.evidence,
    executionFinishedAt: input.finishedAt,
    nightExecutedAt: input.finishedAt,
    verificationStatus: "awaiting_review",
  };
  if (input.resultNoteId) submitted.resultNoteId = input.resultNoteId;
  if (input.blockedReason) submitted.blockedReason = input.blockedReason;
  for (const field of ["executionLeaseUntil", "leaseUntil"] as const) delete submitted[field];

  const nextTasks = [...tasks];
  nextTasks[targetIndex] = submitted;
  const nextData = { ...data, tasks: nextTasks, dataRevision: Number(data.dataRevision ?? 0) + 1 };
  return { data: nextData, result: { ok: true, task: submitted, runId: input.runId }, changed: true };
}
