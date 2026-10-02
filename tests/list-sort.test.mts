import assert from "node:assert/strict";
import test from "node:test";
import {
  sortItems,
  isListSort,
  sortLabel,
  orderSort,
  prioritySort,
  DEFAULT_LIST_SORT,
  LIST_SORTS,
  type ListSort,
  type SortableItem,
} from "../lib/list-sort.ts";

interface Item extends SortableItem {
  id: string;
}

const item = (id: string, price: number, createdAt: string, order?: number, priority = 2): Item => ({
  id, price, createdAt, priority, order,
});

const A = item("a", 30, "2026-01-01T00:00:00.000Z", 0);
const B = item("b", 10, "2026-03-01T00:00:00.000Z", 1);
const C = item("c", 20, "2026-02-01T00:00:00.000Z", 2);
const names = (list: Item[]) => list.map((i) => i.id).join(",");

test("custom arrangement follows the saved order", () => {
  assert.equal(names(sortItems([C, A, B], "custom")), "a,b,c");
});

test("custom is the default sort", () => {
  assert.equal(DEFAULT_LIST_SORT, "custom");
  assert.equal(sortLabel("custom"), "Custom Arrangement");
  // Items with no saved order fall back to priority, then age.
  const loose = [item("z", 0, "2026-05-01T00:00:00.000Z", undefined, 3), item("y", 0, "2026-01-01T00:00:00.000Z", undefined, 1)];
  assert.equal(names(sortItems(loose, "custom")), "y,z");
});

test("price sorts ascending and descending", () => {
  assert.equal(names(sortItems([A, B, C], "price-asc")), "b,c,a");
  assert.equal(names(sortItems([A, B, C], "price-desc")), "a,c,b");
});

test("date added sorts ascending and descending", () => {
  assert.equal(names(sortItems([A, B, C], "date-asc")), "a,c,b");
  assert.equal(names(sortItems([A, B, C], "date-desc")), "b,c,a");
});

test("ties fall back to the manual order so items never shuffle", () => {
  const t1 = item("t1", 5, "2026-01-01T00:00:00.000Z", 0);
  const t2 = item("t2", 5, "2026-01-01T00:00:00.000Z", 1);
  for (const sort of ["price-asc", "price-desc", "date-asc", "date-desc"] as ListSort[]) {
    assert.equal(names(sortItems([t2, t1], sort)), "t1,t2", `${sort} should keep manual order`);
  }
});

test("sortItems never mutates its input", () => {
  const input = [C, A, B];
  const before = names(input);
  sortItems(input, "price-asc");
  assert.equal(names(input), before);
});

test("an unknown sort string falls back to the manual order", () => {
  assert.equal(names(sortItems([C, A, B], "nonsense" as ListSort)), "a,b,c");
});

test("unparseable dates do not produce NaN ordering", () => {
  // A bad date degrades to epoch 0 rather than poisoning the comparison.
  const bad = item("bad", 0, "not-a-date", 1);
  const good = item("good", 0, "2026-01-01T00:00:00.000Z", 0);
  assert.equal(names(sortItems([bad, good], "date-asc")), "bad,good");
  assert.equal(names(sortItems([good, bad], "date-desc")), "good,bad");
});

test("isListSort only accepts known keys", () => {
  assert.equal(isListSort("price-asc"), true);
  assert.equal(isListSort("custom"), true);
  assert.equal(isListSort("toString"), false, "inherited keys are not valid sorts");
  assert.equal(isListSort(undefined), false);
  assert.equal(isListSort(3), false);
  assert.equal(LIST_SORTS.length, 5);
});

test("orderSort and prioritySort are exposed for manual reordering", () => {
  const older = item("older", 0, "2026-01-01T00:00:00.000Z", undefined, 1);
  const newer = item("newer", 0, "2026-02-01T00:00:00.000Z", undefined, 1);
  assert.ok(prioritySort(older, newer) < 0);
  assert.ok(prioritySort(newer, older) > 0);
  assert.equal(prioritySort(older, older), 0);
  // Items missing `order` sort after those that have one.
  assert.ok(orderSort(A, older) < 0);
});
