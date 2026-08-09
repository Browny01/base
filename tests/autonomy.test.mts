import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AUTONOMY_SETTINGS,
  autonomyState,
  buildAutonomySummary,
  computeAutonomyMetrics,
  eligibleAutonomyTasks,
  normalizeAutonomySettings,
  prepareAutonomySuggestion,
  reviewAutonomyTask,
  sanitizeAutonomyAgentPatch,
  validateAutonomyEvidence,
  reviewBucket,
  timelineForTask,
  type AutonomyTaskLike,
} from "../lib/autonomy.ts";

const task = (overrides: Record<string, unknown> = {}): AutonomyTaskLike & Record<string, unknown> => ({
  id: "task-1",
  title: "Research a market",
  priority: "P2",
  tag: "@night-auto",
  dueDate: null,
  recurring: null,
  done: false,
  createdAt: "2026-08-01T10:00:00.000Z",
  nightPolicy: "autonomous-v1",
  executionState: "queued",
  ...overrides,
}) as AutonomyTaskLike & Record<string, unknown>;

test("autonomyState normalizes legacy completed and blocked tasks", () => {
  assert.equal(autonomyState(task({ done: true, executionState: undefined })), "completed");
  assert.equal(autonomyState(task({ executionNote: "Source missing", executionState: undefined })), "blocked");
  assert.equal(autonomyState(task({ tag: "@work", nightPolicy: undefined, executionState: undefined })), null);
});

test("buildAutonomySummary counts actionable states without inventing runs", () => {
  const summary = buildAutonomySummary([
    task(),
    task({ id: "2", executionState: "in_progress" }),
    task({ id: "3", executionState: "awaiting_review" }),
    task({ id: "4", executionState: "blocked" }),
    task({ id: "5", done: true, executionState: "completed" }),
    task({ id: "6", tag: "@work", nightPolicy: undefined, executionState: undefined }),
  ]);

  assert.deepEqual(summary, {
    total: 5,
    queued: 1,
    running: 1,
    awaitingReview: 1,
    verified: 1,
    blocked: 1,
    needsApproval: 0,
  });
});

test("eligibleAutonomyTasks respects pause, concurrency, dependencies, and priority", () => {
  const tasks = [
    task({ id: "later", priority: "P3" }),
    task({ id: "urgent", priority: "P1" }),
    task({ id: "blocked", priority: "P1", dependencyIds: ["missing"] }),
    task({ id: "running", executionState: "in_progress" }),
  ];

  assert.deepEqual(eligibleAutonomyTasks(tasks, { ...DEFAULT_AUTONOMY_SETTINGS, maxConcurrentWorkers: 2 }).map((item) => item.id), ["urgent"]);
  assert.deepEqual(eligibleAutonomyTasks(tasks, { ...DEFAULT_AUTONOMY_SETTINGS, enabled: false }), []);
  const implementations = [task({ id: "approval-needed", taskClass: "implementation" }), task({ id: "approved", taskClass: "implementation", implementationApproved: true })];
  assert.deepEqual(eligibleAutonomyTasks(implementations, DEFAULT_AUTONOMY_SETTINGS).map((item) => item.id), ["approved"]);
});

test("reviewBucket separates owner decisions from routine verification", () => {
  assert.equal(reviewBucket(task({ executionState: "suggested" })), "approval");
  assert.equal(reviewBucket(task({ executionState: "needs_input" })), "approval");
  assert.equal(reviewBucket(task({ executionState: "awaiting_review" })), "review");
  assert.equal(reviewBucket(task({ executionState: "blocked" })), "blocked");
  assert.equal(reviewBucket(task({ executionState: "completed", done: true })), "verified");
});

test("timelineForTask only emits events backed by timestamps or explicit state", () => {
  const timeline = timelineForTask(task({
    executionStartedAt: "2026-08-01T11:00:00.000Z",
    nightExecutedAt: "2026-08-01T11:30:00.000Z",
    executionState: "blocked",
    executionNote: "Missing source",
  }));

  assert.deepEqual(timeline.map((event) => event.label), ["Created", "Started", "Blocked"]);
  assert.equal(timeline[2].detail, "Missing source");
});

test("normalizeAutonomySettings clamps unsafe control values", () => {
  const settings = normalizeAutonomySettings({ enabled: false, maxConcurrentWorkers: 99, dailyRunLimit: -3, maxCorrectionAttempts: 8, allowedTaskClasses: ["research", "deploy"], allowedWorkspaces: ["Bridge", "Bridge", ""] });
  assert.equal(settings.enabled, false);
  assert.equal(settings.maxConcurrentWorkers, 3);
  assert.equal(settings.dailyRunLimit, 1);
  assert.equal(settings.maxCorrectionAttempts, 1);
  assert.deepEqual(settings.allowedTaskClasses, ["research"]);
  assert.deepEqual(settings.allowedWorkspaces, ["Bridge"]);
  assert.equal(settings.currentBusinessFocus, "Dropshipping");
});

test("computeAutonomyMetrics reports grounded rates and timings without inventing missing values", () => {
  const metrics = computeAutonomyMetrics([
    task({
      id: "verified",
      createdAt: "2026-08-05T00:00:00.000Z",
      executionStartedAt: "2026-08-07T00:00:00.000Z",
      approvedAt: "2026-08-07T00:30:00.000Z",
      executionFinishedAt: "2026-08-07T01:00:00.000Z",
      verifiedAt: "2026-08-07T02:00:00.000Z",
      completedAt: "2026-08-07T02:00:00.000Z",
      executionState: "completed",
      done: true,
      resultSummary: "Useful result",
      executionEvidence: ["pass"],
    }),
    task({
      id: "blocked",
      createdAt: "2026-08-06T00:00:00.000Z",
      executionStartedAt: "2026-08-08T00:00:00.000Z",
      executionFinishedAt: "2026-08-08T01:00:00.000Z",
      executionState: "blocked",
    }),
  ], "2026-08-09T00:00:00.000Z");

  assert.equal(metrics.usefulRunRate, 0.5);
  assert.equal(metrics.verifiedThroughput7d, 1);
  assert.equal(metrics.oldestBlockedAgeHours, 23);
  assert.equal(metrics.averageEndToEndHours, 50);
  assert.equal(metrics.averageDecisionToResolutionHours, 1.5);
  assert.equal(metrics.averageRecoveryHours, null);
});

test("reviewAutonomyTask permits one correction then blocks further retries", () => {
  const current = task({ id: "review", executionState: "awaiting_review", correctionAttempts: 0 });
  const first = reviewAutonomyTask(current, "requeue", "2026-08-07T04:00:00.000Z", 1);
  assert.equal(first.ok, true);
  assert.equal(first.task?.executionState, "queued");
  assert.equal(first.task?.correctionAttempts, 1);

  const second = reviewAutonomyTask({ ...first.task!, executionState: "awaiting_review" }, "requeue", "2026-08-07T05:00:00.000Z", 1);
  assert.equal(second.ok, false);
  assert.equal(second.task?.executionState, "blocked");
});

test("reviewAutonomyTask only verifies work that is awaiting review", () => {
  for (const executionState of ["blocked", "needs_input"] as const) {
    const current = task({ id: `verify-${executionState}`, executionState });
    const result = reviewAutonomyTask(current, "verify", "2026-08-07T05:00:00.000Z", 1);
    assert.equal(result.ok, false);
    assert.equal(result.task?.executionState, executionState);
    assert.equal(result.task?.done, false);
  }
});

test("generic agent writes cannot bypass autonomy claiming or verification", () => {
  const patch = sanitizeAutonomyAgentPatch(task({ executionState: "awaiting_review" }), { title: "Safe title", executionState: "completed", done: true, verifiedAt: "now", resultSummary: "forged", taskClass: "research", workspace: "Systemly", dependencyIds: [] });
  assert.deepEqual(patch, { title: "Safe title" });

  const suggestion = prepareAutonomySuggestion({ id: "idea", title: "Agent idea", tag: "@night-auto", workspace: "Bridge", taskClass: "research", dependencyIds: ["source"], executionState: "completed", done: true, resultSummary: "forged" });
  assert.equal(suggestion.executionState, "suggested");
  assert.equal(suggestion.done, false);
  assert.equal(suggestion.workspace, "Bridge");
  assert.equal(suggestion.taskClass, "research");
  assert.deepEqual(suggestion.dependencyIds, ["source"]);
  assert.equal("resultSummary" in suggestion, false);
});

test("autonomy evidence is bounded", () => {
  assert.equal(validateAutonomyEvidence([]), "Evidence must contain between 1 and 50 items.");
  assert.equal(validateAutonomyEvidence(["ok"]), null);
  assert.equal(validateAutonomyEvidence(["x".repeat(10_001)]), "Each evidence item must be 10 KB or smaller.");
});
