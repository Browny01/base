import assert from "node:assert/strict";
import test from "node:test";

import {
  claimAutonomyTaskInData,
  reapExpiredAutonomyLeases,
  submitAutonomyResultInData,
} from "../lib/autonomy-control.ts";

const SETTINGS = {
  enabled: true,
  maxConcurrentWorkers: 1,
  dailyRunLimit: 6,
  maxCorrectionAttempts: 1,
  allowedTaskClasses: ["research", "planning", "implementation", "review", "operations"],
  allowedWorkspaces: ["Bridge", "Dropshipping"],
  requireApprovalForImplementation: true,
  workingHoursStart: "00:00",
  workingHoursEnd: "23:59",
  timezoneOffsetMinutes: 480,
};

const queued = {
  id: "task-1",
  title: "Research evidence",
  tag: "@night-auto",
  nightPolicy: "autonomous-v1",
  taskClass: "research",
  workspace: "Dropshipping",
  executionState: "queued",
  done: false,
};

test("claim assigns one expiring lease and competing run loses", () => {
  const now = "2026-08-09T08:00:00.000Z";
  const first = claimAutonomyTaskInData({ tasks: [queued], autonomySettings: SETTINGS }, {
    taskId: "task-1", runId: "run-a", agent: "parent", model: "worker", startedAt: now,
  });
  assert.equal(first.result.ok, true);
  const task = (first.data.tasks as Record<string, unknown>[])[0];
  assert.equal(task.executionState, "in_progress");
  assert.equal(task.executionId, "run-a");
  assert.equal(task.leaseUntil, "2026-08-09T10:00:00.000Z");

  const second = claimAutonomyTaskInData(first.data, {
    taskId: "task-1", runId: "run-b", agent: "other", model: "worker", startedAt: "2026-08-09T08:01:00.000Z",
  });
  assert.equal(second.result.ok, false);
  assert.match(second.result.error ?? "", /not queued|capacity/i);
});

test("matching duplicate claim is idempotent", () => {
  const first = claimAutonomyTaskInData({ tasks: [queued], autonomySettings: SETTINGS }, {
    taskId: "task-1", runId: "run-a", agent: "parent", model: "worker", startedAt: "2026-08-09T08:00:00.000Z",
  });
  const duplicate = claimAutonomyTaskInData(first.data, {
    taskId: "task-1", runId: "run-a", agent: "parent", model: "worker", startedAt: "2026-08-09T08:01:00.000Z",
  });
  assert.equal(duplicate.result.ok, true);
  assert.equal(duplicate.changed, false);
});

test("expired legacy and current leases are requeued safely", () => {
  const expired = { ...queued, executionState: "in_progress", executionId: "old", executionOwner: "old", leaseUntil: "2026-08-09T07:00:00.000Z" };
  const fresh = { ...queued, id: "task-2", executionState: "in_progress", executionId: "fresh", leaseUntil: "2026-08-09T09:00:00.000Z" };
  const result = reapExpiredAutonomyLeases({ tasks: [expired, fresh] }, "2026-08-09T08:00:00.000Z");
  const tasks = result.data.tasks as Record<string, unknown>[];
  assert.equal(result.reaped, 1);
  assert.equal(tasks[0].executionState, "queued");
  assert.equal(tasks[0].executionId, undefined);
  assert.equal(tasks[0].lastLeaseExpiredAt, "2026-08-09T07:00:00.000Z");
  assert.equal(tasks[0].requeuedAt, "2026-08-09T08:00:00.000Z");
  assert.match(String(tasks[0].executionNote), /expired/i);
  assert.equal(tasks[1].executionState, "in_progress");
});

test("only owning run can submit and submission clears the active lease", () => {
  const first = claimAutonomyTaskInData({ tasks: [queued], autonomySettings: SETTINGS }, {
    taskId: "task-1", runId: "run-a", agent: "parent", model: "worker", startedAt: "2026-08-09T08:00:00.000Z",
  });
  const wrong = submitAutonomyResultInData(first.data, {
    taskId: "task-1", runId: "run-b", state: "awaiting_review", summary: "wrong", evidence: [], finishedAt: "2026-08-09T08:10:00.000Z",
  });
  assert.equal(wrong.result.ok, false);

  const submitted = submitAutonomyResultInData(first.data, {
    taskId: "task-1", runId: "run-a", state: "awaiting_review", summary: "verified locally", evidence: [{ kind: "test", value: "pass" }], finishedAt: "2026-08-09T08:10:00.000Z",
  });
  assert.equal(submitted.result.ok, true);
  const task = (submitted.data.tasks as Record<string, unknown>[])[0];
  assert.equal(task.executionState, "awaiting_review");
  assert.equal(task.leaseUntil, undefined);
  assert.equal(task.executionFinishedAt, "2026-08-09T08:10:00.000Z");
});

test("implementation remains owner-gated", () => {
  const implementation = { ...queued, taskClass: "implementation", workspace: "Bridge" };
  const denied = claimAutonomyTaskInData({ tasks: [implementation], autonomySettings: SETTINGS }, {
    taskId: "task-1", runId: "run-a", agent: "parent", model: "worker", startedAt: "2026-08-09T08:00:00.000Z",
  });
  assert.equal(denied.result.ok, false);
  assert.match(denied.result.error ?? "", /approval/i);
});
