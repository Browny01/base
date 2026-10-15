import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionValues } from "../lib/subscription.ts";
test("subscription editing validates money/dates and keeps unrelated record metadata", () => {
  const old = {
    id: "s",
    active: false,
    createdAt: "2025-01-01",
    future: { providerId: "unknown" },
  };
  const values = subscriptionValues({
    name: " Base ",
    amount: "3.99",
    dueDate: "2026-10-31",
    frequency: "monthly",
    category: " Tools ",
    notes: " Keep this ",
  });
  const edited = { ...old, ...values };
  assert.equal(edited.id, "s");
  assert.equal(edited.active, false);
  assert.equal(edited.amount, 3.99);
  assert.equal(edited.category, "Tools");
  assert.deepEqual(edited.future, old.future);
  for (const amount of ["", "-1", "NaN", "Infinity"])
    assert.throws(() =>
      subscriptionValues({
        name: "Base",
        amount,
        dueDate: "2026-10-31",
        frequency: "monthly",
        category: "",
        notes: "",
      }),
    );
  for (const dueDate of ["", "2026-02-30", "2026-15-01"])
    assert.throws(() =>
      subscriptionValues({
        name: "Base",
        amount: "0",
        dueDate,
        frequency: "monthly",
        category: "",
        notes: "",
      }),
    );
  assert.equal(
    subscriptionValues({
      name: "Free",
      amount: "0",
      dueDate: "2026-10-31",
      frequency: "yearly",
      category: "",
      notes: "",
    }).amount,
    0,
  );
});
