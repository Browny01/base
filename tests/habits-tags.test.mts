import test from "node:test";
import assert from "node:assert/strict";
import { habitDay, habitDays, habitStreaks, nextHabitDay, setHabitLog } from "../lib/habits.ts";
import { listTagCatalog, matchesListFilters, updateListTag } from "../lib/list-tags.ts";
import { customNoteEmoji } from "../lib/note-icon.ts";
import { diff, mergeOperations, type Document } from "../packages/sync/src/protocol.ts";

test("habit streaks deduplicate dates and allow today to be unfinished", () => {
  const logs = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-23"].map((date, i) => ({ id: String(i), habitId: "read", date, completed: true }));
  assert.deepEqual(habitStreaks(logs, "2026-10-24"), { current: 3, best: 3 });
  assert.deepEqual(habitStreaks(logs, "2026-10-25"), { current: 0, best: 3 });
  assert.deepEqual(habitDays("2024-03-01", 3), ["2024-02-28", "2024-02-29", "2024-03-01"]);
});
test("habit dates and the single midnight wake follow the workspace timezone and DST", () => {
  assert.equal(habitDay(new Date("2026-10-24T17:00:00Z"), "Australia/Perth"), "2026-10-25");
  const at = new Date("2026-03-08T05:00:00Z"); // Midnight before US spring DST change.
  const wake = nextHabitDay(at, "America/New_York");
  assert.ok(Math.abs(wake - 23 * 3_600_000) < 2_000);
});
test("habit edits preserve legacy fields and update duplicate logs without losing history", () => {
  const logs = [{ id: "one", habitId: "read", date: "2026-10-24", completed: true, value: "8", future: "retained" }, { id: "other", habitId: "walk", date: "2026-10-24", completed: true }];
  const next = setHabitLog(logs, "read", "2026-10-24", false, undefined, "unused");
  assert.equal(next.length, 2); assert.equal(next[0].value, "8"); assert.equal((next[0] as typeof logs[0]).future, "retained"); assert.equal(next[1], logs[1]);
  assert.equal(setHabitLog(next, "read", "2026-10-23", true, "12", "new").length, 3);
  assert.equal(logs[0].completed, true);
});
test("tags have no defaults, are reusable, and rename/recolour/delete preserves the item", () => {
  const tag = { id: "tag", name: "Weekend", color: "#35896f" };
  const rows = [{ id: "a", tags: [tag], future: { retain: true } }, { id: "b", tags: [tag] }];
  assert.deepEqual(listTagCatalog([{ id: "legacy" }]), []);
  assert.equal(listTagCatalog(rows).length, 1);
  const next = updateListTag(rows, "tag", { name: "Evenings", color: "#9475c9" });
  assert.equal(next[1].tags[0].name, "Evenings"); assert.equal(next[0].future, rows[0].future);
  assert.equal(rows[0].tags[0].name, "Weekend"); assert.deepEqual(updateListTag(next, "tag", null)[0].tags, []);
  assert.equal(matchesListFilters({ ...rows[0], category: "tech", priority: 1 }, ["tag"], "tech", "1"), true);
  assert.equal(matchesListFilters({ ...rows[0], category: "tech", priority: 1 }, ["tag"], "tech", "3"), false);
  assert.equal(matchesListFilters(rows[0], ["missing"]), false);
});
test("custom note emoji accepts composed families, flags, skin tones and keycaps", () => {
  for (const icon of ["🦦", "👩🏽‍💻", "👨‍👩‍👧‍👦", "🇦🇺", "1️⃣"]) assert.equal(customNoteEmoji(icon), icon);
  for (const icon of ["", "hello", "🎉🎉", "<script>"]) assert.equal(customNoteEmoji(icon), null);
});
test("tags and habit logs synchronize through supported records without losing unknown fields", () => {
  const before: Document = { shoppingList: [{ id: "item", name: "Notebook", tags: [], future: "keep" }], habits: [{ id: "read", name: "Read" }], habitLogs: [] };
  const local = structuredClone(before);
  (local.shoppingList as Document[])[0].tags = [{ id: "tag", name: "Ideas", color: "#112233" }];
  local.habitLogs = [{ id: "log", habitId: "read", date: "2026-10-24", completed: true }];
  const remote = structuredClone(before); (remote.shoppingList as Document[])[0].name = "Pocket notebook";
  const result = mergeOperations(remote, diff(before, local), 1);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.data.shoppingList, [{ id: "item", name: "Pocket notebook", tags: [{ id: "tag", name: "Ideas", color: "#112233" }], future: "keep" }]);
  assert.deepEqual(result.data.habitLogs, local.habitLogs);
});
