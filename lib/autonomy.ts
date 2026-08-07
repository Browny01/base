export const AUTONOMY_STATES = [
  "suggested",
  "queued",
  "in_progress",
  "awaiting_review",
  "needs_input",
  "blocked",
  "completed",
  "rejected",
] as const;

export type AutonomyState = typeof AUTONOMY_STATES[number];
export type AutonomyTaskClass = "research" | "planning" | "implementation" | "review" | "operations";

export interface AutonomySettings {
  enabled: boolean;
  maxConcurrentWorkers: number;
  dailyRunLimit: number;
  maxCorrectionAttempts: number;
  allowedTaskClasses: AutonomyTaskClass[];
  allowedWorkspaces: string[];
  requireApprovalForImplementation: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  timezoneOffsetMinutes: number;
  updatedAt?: string;
}

export const DEFAULT_AUTONOMY_SETTINGS: AutonomySettings = {
  enabled: true,
  maxConcurrentWorkers: 1,
  dailyRunLimit: 6,
  maxCorrectionAttempts: 1,
  allowedTaskClasses: ["research", "planning", "implementation", "review", "operations"],
  allowedWorkspaces: ["Bridge", "Dropshipping", "Systemly", "ProductDeck", "StreamSpark"],
  requireApprovalForImplementation: true,
  workingHoursStart: "09:00",
  workingHoursEnd: "23:00",
  timezoneOffsetMinutes: 480,
};

export interface AutonomyTaskLike {
  id: string;
  title: string;
  priority?: "P1" | "P2" | "P3";
  tag?: string;
  done?: boolean;
  createdAt?: string;
  completedAt?: string | null;
  nightPolicy?: string;
  executionState?: string;
  autonomyBrief?: string;
  executionNote?: string;
  executionStartedAt?: string;
  nightExecutedAt?: string;
  verifiedAt?: string;
  resultSummary?: string;
  resultNoteId?: string;
  dependencyIds?: string[];
  blockedReason?: string;
  taskClass?: AutonomyTaskClass;
  workspace?: string;
  workerModel?: string;
  executionAgent?: string;
  correctionAttempts?: number;
  verificationStatus?: string;
  implementationApproved?: boolean;
}

const TASK_CLASSES: AutonomyTaskClass[] = ["research", "planning", "implementation", "review", "operations"];

export function normalizeAutonomySettings(input: unknown, current: AutonomySettings = DEFAULT_AUTONOMY_SETTINGS): AutonomySettings {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = value[key];
    const candidate = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : fallback;
    return Math.min(max, Math.max(min, candidate));
  };
  const taskClasses = Array.isArray(value.allowedTaskClasses)
    ? [...new Set(value.allowedTaskClasses.filter((item): item is AutonomyTaskClass => typeof item === "string" && TASK_CLASSES.includes(item as AutonomyTaskClass)))]
    : current.allowedTaskClasses;
  const workspaces = Array.isArray(value.allowedWorkspaces)
    ? [...new Set(value.allowedWorkspaces.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))].slice(0, 20)
    : current.allowedWorkspaces;
  const hhmm = (key: "workingHoursStart" | "workingHoursEnd") => typeof value[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value[key]) ? value[key] : current[key];
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : current.enabled,
    maxConcurrentWorkers: integer("maxConcurrentWorkers", current.maxConcurrentWorkers, 1, 3),
    dailyRunLimit: integer("dailyRunLimit", current.dailyRunLimit, 1, 24),
    maxCorrectionAttempts: integer("maxCorrectionAttempts", current.maxCorrectionAttempts, 0, 1),
    allowedTaskClasses: taskClasses.length ? taskClasses : current.allowedTaskClasses,
    allowedWorkspaces: workspaces.length ? workspaces : current.allowedWorkspaces,
    requireApprovalForImplementation: typeof value.requireApprovalForImplementation === "boolean" ? value.requireApprovalForImplementation : current.requireApprovalForImplementation,
    workingHoursStart: hhmm("workingHoursStart"),
    workingHoursEnd: hhmm("workingHoursEnd"),
    timezoneOffsetMinutes: integer("timezoneOffsetMinutes", current.timezoneOffsetMinutes, -720, 840),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : current.updatedAt,
  };
}

export type AutonomyReviewDecision = "verify" | "requeue" | "reject";

export function reviewAutonomyTask(task: AutonomyTaskLike, decision: AutonomyReviewDecision, timestamp: string, maxCorrections = 1): { ok: boolean; task: AutonomyTaskLike; error?: string } {
  if (!["awaiting_review", "blocked", "needs_input"].includes(task.executionState ?? "")) {
    return { ok: false, task, error: "Task is not awaiting a review decision." };
  }
  if (decision === "verify") return { ok: true, task: { ...task, done: true, completedAt: timestamp, verifiedAt: timestamp, verificationStatus: "verified", executionState: "completed" } };
  if (decision === "reject") return { ok: true, task: { ...task, verificationStatus: "rejected", executionState: "rejected" } };
  const attempts = task.correctionAttempts ?? 0;
  if (attempts >= maxCorrections) return { ok: false, task: { ...task, executionState: "blocked", blockedReason: "Correction limit reached." }, error: "Correction limit reached." };
  return { ok: true, task: { ...task, done: false, correctionAttempts: attempts + 1, executionState: "queued", verificationStatus: "needs_correction" } };
}

const AUTONOMY_RUNTIME_PROTECTED_FIELDS = new Set([
  "done", "completedAt", "executionState", "executionId", "executionStartedAt", "executionFinishedAt",
  "executionAgent", "workerModel", "executionEvidence", "resultSummary", "resultNoteId", "nightExecutedAt",
  "verificationStatus", "verifiedAt", "correctionAttempts", "implementationApproved", "blockedReason",
]);
const AUTONOMY_AGENT_PROTECTED_FIELDS = new Set([
  ...AUTONOMY_RUNTIME_PROTECTED_FIELDS,
  "taskClass", "workspace", "tag", "dependencyIds", "nightPolicy", "autonomyBrief",
]);

function recordLooksAutonomous(record: Record<string, unknown>): boolean {
  return record.tag === "@night-auto" || record.nightPolicy === "autonomous-v1" || (typeof record.executionState === "string" && (AUTONOMY_STATES as readonly string[]).includes(record.executionState));
}

export function sanitizeAutonomyAgentPatch(current: AutonomyTaskLike, patch: Record<string, unknown>): Record<string, unknown> {
  if (!isAutonomyTask(current) && !recordLooksAutonomous(patch)) return patch;
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !AUTONOMY_AGENT_PROTECTED_FIELDS.has(key)));
}

export function prepareAutonomySuggestion(record: Record<string, unknown>): Record<string, unknown> {
  if (!recordLooksAutonomous(record)) return record;
  const safe = Object.fromEntries(Object.entries(record).filter(([key]) => !AUTONOMY_RUNTIME_PROTECTED_FIELDS.has(key)));
  return { ...safe, done: false, executionState: "suggested" };
}

export function validateAutonomyEvidence(evidence: unknown[]): string | null {
  if (evidence.length < 1 || evidence.length > 50) return "Evidence must contain between 1 and 50 items.";
  let total = 0;
  for (const item of evidence) {
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    if (size > 10_000) return "Each evidence item must be 10 KB or smaller.";
    total += size;
  }
  return total > 100_000 ? "Evidence must be 100 KB or smaller in total." : null;
}

export interface AutonomySummary {
  total: number;
  queued: number;
  running: number;
  awaitingReview: number;
  verified: number;
  blocked: number;
  needsApproval: number;
}

const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 } as const;

export function isAutonomyTask(task: AutonomyTaskLike): boolean {
  return task.tag === "@night-auto" || task.nightPolicy === "autonomous-v1" || AUTONOMY_STATES.includes(task.executionState as AutonomyState);
}

export function autonomyState(task: AutonomyTaskLike): AutonomyState | null {
  if (!isAutonomyTask(task)) return null;
  if (AUTONOMY_STATES.includes(task.executionState as AutonomyState)) return task.executionState as AutonomyState;
  if (task.done) return "completed";
  if (task.blockedReason || task.executionNote) return "blocked";
  return "queued";
}

export function buildAutonomySummary(tasks: AutonomyTaskLike[]): AutonomySummary {
  const summary: AutonomySummary = { total: 0, queued: 0, running: 0, awaitingReview: 0, verified: 0, blocked: 0, needsApproval: 0 };
  for (const task of tasks) {
    const state = autonomyState(task);
    if (!state) continue;
    summary.total += 1;
    if (state === "queued" || state === "suggested") summary.queued += 1;
    if (state === "in_progress") summary.running += 1;
    if (state === "awaiting_review") summary.awaitingReview += 1;
    if (state === "completed") summary.verified += 1;
    if (state === "blocked" || state === "rejected") summary.blocked += 1;
    if (state === "needs_input") summary.needsApproval += 1;
  }
  return summary;
}

export function eligibleAutonomyTasks<T extends AutonomyTaskLike>(tasks: T[], settings: AutonomySettings): T[] {
  if (!settings.enabled) return [];
  const running = tasks.filter((task) => autonomyState(task) === "in_progress").length;
  const capacity = Math.max(0, Math.min(3, settings.maxConcurrentWorkers) - running);
  if (capacity === 0) return [];
  const completedIds = new Set(tasks.filter((task) => task.done || autonomyState(task) === "completed").map((task) => task.id));
  return tasks
    .filter((task) => autonomyState(task) === "queued")
    .filter((task) => !task.dependencyIds?.some((id) => !completedIds.has(id)))
    .filter((task) => !task.taskClass || settings.allowedTaskClasses.includes(task.taskClass))
    .filter((task) => !task.workspace || settings.allowedWorkspaces.includes(task.workspace))
    .filter((task) => task.taskClass !== "implementation" || !settings.requireApprovalForImplementation || task.implementationApproved === true)
    .sort((a, b) => (PRIORITY_ORDER[a.priority ?? "P3"] - PRIORITY_ORDER[b.priority ?? "P3"]) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .slice(0, capacity);
}

export type ReviewBucket = "approval" | "review" | "blocked" | "verified" | null;

export function reviewBucket(task: AutonomyTaskLike): ReviewBucket {
  const state = autonomyState(task);
  if (state === "suggested") return "approval";
  if (state === "needs_input") return "approval";
  if (state === "awaiting_review") return "review";
  if (state === "blocked" || state === "rejected") return "blocked";
  if (state === "completed") return "verified";
  return null;
}

export interface TimelineEvent {
  label: string;
  at?: string;
  detail?: string;
  tone: "neutral" | "active" | "success" | "warning";
}

export function timelineForTask(task: AutonomyTaskLike): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (task.createdAt) events.push({ label: "Created", at: task.createdAt, tone: "neutral" });
  if (task.executionStartedAt) events.push({ label: "Started", at: task.executionStartedAt, tone: "active" });
  const state = autonomyState(task);
  if (state === "blocked" || state === "rejected") {
    events.push({ label: state === "rejected" ? "Rejected" : "Blocked", at: task.nightExecutedAt, detail: task.blockedReason || task.executionNote, tone: "warning" });
  } else if (state === "awaiting_review") {
    events.push({ label: "Awaiting review", at: task.nightExecutedAt, detail: task.resultSummary, tone: "active" });
  } else if (state === "needs_input") {
    events.push({ label: "Needs approval", at: task.nightExecutedAt, detail: task.executionNote, tone: "warning" });
  } else if (state === "completed") {
    events.push({ label: "Verified", at: task.verifiedAt || task.completedAt || task.nightExecutedAt, detail: task.resultSummary, tone: "success" });
  }
  return events;
}
