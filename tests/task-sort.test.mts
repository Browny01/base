import assert from "node:assert/strict";
import test from "node:test";
import {
  sortTasks,
  isTaskSort,
  priorityRank,
  priorityLabel,
  DEFAULT_TASK_SORT,
  DEFAULT_PRIORITY,
  PRIORITY_META,
  TASK_SORTS,
  type SortableTask,
} from "../lib/task-sort.ts";

interface Task extends SortableTask {
  id: string;
}

const task = (id: string, priority: string, createdAt: string, order?: number): Task => ({
  id, priority, createdAt, order,
});

const URGENT = task("urgent", "P1", "2026-01-01T00:00:00.000Z", 0);
const IMPORTANT = task("important", "P2", "2026-02-01T00:00:00.000Z", 1);
const LATER = task("later", "P3", "2026-03-01T00:00:00.000Z", 2);
const ids = (list: Task[]) => list.map((t) => t.id).join(",");

test("custom is the default sort and follows the manual order", () => {
  assert.equal(DEFAULT_TASK_SORT, "custom");
  assert.equal(ids(sortTasks([LATER, URGENT, IMPORTANT], "custom")), "urgent,important,later");
});

test("priority sort orders urgent first and keeps manual order on ties", () => {
  assert.equal(ids(sortTasks([LATER, URGENT, IMPORTANT], "priority")), "urgent,important,later");
  const a = task("a", "P2", "2026-01-01T00:00:00.000Z", 0);
  const b = task("b", "P2", "2026-02-01T00:00:00.000Z", 1);
  assert.equal(ids(sortTasks([b, a], "priority")), "a,b");
});

test("custom order and priority sort disagree when a low-priority task sits first", () => {
  // A "Later" task deliberately arranged above an "Urgent" one.
  const laterFirst = task("later", "P3", "2026-03-01T00:00:00.000Z", 0);
  const urgentSecond = task("urgent", "P1", "2026-01-01T00:00:00.000Z", 1);
  assert.equal(ids(sortTasks([laterFirst, urgentSecond], "custom")), "later,urgent");
  assert.equal(ids(sortTasks([laterFirst, urgentSecond], "priority")), "urgent,later");
});

test("tasks with no order fall back to age", () => {
  const older = task("older", "P2", "2026-01-01T00:00:00.000Z");
  const newer = task("newer", "P2", "2026-02-01T00:00:00.000Z");
  assert.equal(ids(sortTasks([newer, older], "custom")), "older,newer");
  // Un-ordered tasks land after anything that has an order.
  assert.equal(ids(sortTasks([newer, URGENT], "custom")), "urgent,newer");
});

test("sortTasks never mutates its input", () => {
  const input = [LATER, URGENT];
  const before = ids(input);
  sortTasks(input, "priority");
  assert.equal(ids(input), before);
});

test("an unknown sort falls back to the manual order", () => {
  assert.equal(ids(sortTasks([LATER, URGENT], "nonsense" as never)), "urgent,later");
});

test("priorities have readable labels and ranks", () => {
  assert.equal(priorityLabel("P1"), "Urgent");
  assert.equal(priorityLabel("P2"), "Important");
  assert.equal(priorityLabel("P3"), "Later");
  assert.ok(priorityRank("P1") < priorityRank("P2"));
  assert.ok(priorityRank("P2") < priorityRank("P3"));
  // Anything unrecognised is treated as ordinary rather than crashing.
  assert.equal(priorityRank("P9"), priorityRank(DEFAULT_PRIORITY));
  assert.equal(priorityLabel("P9"), "Important");
  assert.equal(PRIORITY_META.length, 3);
});

test("isTaskSort only accepts known keys", () => {
  assert.equal(isTaskSort("custom"), true);
  assert.equal(isTaskSort("priority"), true);
  assert.equal(isTaskSort("toString"), false);
  assert.equal(isTaskSort(undefined), false);
  assert.equal(TASK_SORTS.length, 2);
});
