// Verifies the cached store against the previous parse-every-time behaviour.
// Run: node --experimental-strip-types tests/store-cache.test.mts
import assert from "node:assert/strict";
import test from "node:test";
import type { BridgeData } from "../lib/store.ts";

// Minimal localStorage + window shim, installed before importing the store.
const store = new Map<string, string>();
let storageListener: ((e: { key: string | null }) => void) | null = null;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};
(globalThis as Record<string, unknown>).window = {
  addEventListener: (t: string, fn: (e: { key: string | null }) => void) => { if (t === "storage") storageListener = fn; },
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

const { getData, updateData, migrateAll, DEFAULT } = await import("../lib/store.ts");

const seed = () => ({
  ...structuredClone(DEFAULT),
  updatedAt: 1000,
  incomeEntries: [{ id: "e1", source: "old", amount: 5, date: "2026-01-01", type: "earned" as const }],
  habits: [{ id: "h1", name: "H", emoji: "", type: undefined as never, reminderTime: null }],
  projects: [{ id: "p1", name: "P", description: "", color: "cyan" as const, status: "active" as const, createdAt: "" }],
  wikiPages: [{ id: "w1", parentId: null, title: "T", icon: "📄", blocks: [], createdAt: "", updatedAt: "" }],
});

test("migrations still apply on first read", () => {
  store.set("bridge_data", JSON.stringify(seed()));
  const d = getData();
  assert.equal(d.incomeEntries[0].type, "income", "legacy earned -> income");
  assert.equal(d.habits[0].emoji, "⭐", "missing habit emoji defaulted");
  assert.equal(d.habits[0].type, "button", "missing habit type defaulted");
  assert.equal(d.projects[0].category, "major", "missing project category defaulted");
  assert.equal(d.boards.length, 1, "a default board is created");
});

test("cached read returns the same object (no re-parse)", () => {
  const a = getData();
  const b = getData();
  assert.equal(a, b, "second getData() must not re-parse");
});

test("updateData applies the updater and persists", () => {
  const next = updateData((d) => ({ ...d, wikiPages: [...d.wikiPages, { id: "w2", parentId: null, title: "Two", icon: "📄", blocks: [], createdAt: "", updatedAt: "" }] }));
  assert.equal(next.wikiPages.length, 2);
  assert.equal(getData().wikiPages.length, 2, "cache reflects the write");
  assert.equal(JSON.parse(store.get("bridge_data")!).wikiPages.length, 2, "localStorage reflects the write");
});

test("migrations leave already-valid records untouched (no needless churn)", () => {
  const d = updateData((prev) => ({ ...prev, habits: [{ id: "h2", name: "New", emoji: "🔥", type: "input" as const, reminderTime: null }] }));
  assert.equal(d.habits[0].emoji, "🔥", "already-valid data must not be rewritten");
  assert.equal(d.habits[0].name, "New");
  assert.equal(d.habits[0].type, "input");
});

test("migrateAll normalises legacy data injected from the server", () => {
  // The hydrate() path writes server data straight through the store cache, so
  // load() will not get a chance to migrate it later. migrateAll() must be
  // applied at that boundary instead.
  const serverRecord = {
    ...structuredClone(DEFAULT),
    incomeEntries: [{ id: "e9", source: "s", amount: 1, date: "2026-01-01", type: "paid" as never }],
    habits: [{ id: "h9", name: "Legacy", reminderTime: null }],
    projects: [{ id: "p9", name: "Legacy project" }],
  };
  // A legacy record is deliberately not a valid BridgeData — that is the point.
  const merged = migrateAll({ ...DEFAULT, ...serverRecord } as unknown as BridgeData);
  assert.equal(merged.incomeEntries[0].type, "spent", "legacy paid -> spent");
  assert.equal(merged.habits[0].emoji, "⭐", "missing emoji defaulted");
  assert.equal(merged.habits[0].type, "button", "missing type defaulted");
  assert.equal(merged.projects[0].category, "major", "missing category defaulted");
  assert.equal(merged.boards.length, 1, "a default board is created");
});

test("migrateAll purges expired trash from server data", () => {
  const old = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
  const merged = migrateAll({
    ...structuredClone(DEFAULT),
    wikiPages: [{ id: "stale", parentId: null, title: "S", icon: "📄", blocks: [], deletedAt: old, createdAt: "", updatedAt: "" }],
  });
  assert.equal(merged.wikiPages.length, 0, "expired server-side trash dropped");
});

test("trash older than 14 days is purged on read", () => {
  const old = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
  store.set("bridge_data", JSON.stringify({ ...structuredClone(DEFAULT), wikiPages: [
    { id: "gone", parentId: null, title: "G", icon: "📄", blocks: [], deletedAt: old, createdAt: "", updatedAt: "" },
    { id: "kept", parentId: null, title: "K", icon: "📄", blocks: [], deletedAt: new Date().toISOString(), createdAt: "", updatedAt: "" },
  ] }));
  // Force a fresh read the way a cross-tab write would.
  storageListener?.({ key: "bridge_data" });
  const d = getData();
  assert.equal(d.wikiPages.length, 1, "expired trash dropped");
  assert.equal(d.wikiPages[0].id, "kept");
});

test("a storage event from another tab invalidates the cache", () => {
  const before = getData();
  store.set("bridge_data", JSON.stringify({ ...structuredClone(DEFAULT), shoppingList: [{ id: "s1", name: "S", category: "other", price: 1, priority: 2, checked: false, createdAt: "" }] }));
  assert.equal(getData().shoppingList.length, 0, "stale until the event fires");
  storageListener?.({ key: "bridge_data" });
  const after = getData();
  assert.notEqual(after, before, "re-read after invalidation");
  assert.equal(after.shoppingList.length, 1, "cross-tab write picked up");
});