import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "@upstash/redis";

import { DATA_REVISION_KEY } from "../lib/base-data.ts";
import {
  compareAndSwapBaseData,
  readVersionedBaseData,
  updateBaseDataAtomically,
} from "../lib/versioned-base-store.ts";

type Stored = Record<string, unknown>;

class FakeRedis {
  readonly values = new Map<string, unknown>();
  conflictsRemaining = 0;
  evalArgs: unknown[] = [];
  onConflict?: () => void;

  async mget(...keys: string[]) {
    return keys.map((key) => this.values.get(key) ?? null);
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: unknown) {
    this.values.set(key, value);
  }

  async eval(_script: string, keys: string[], args: unknown[]) {
    this.evalArgs = args;
    const [dataKey, revisionKey] = keys;
    const expected = String(args[0]);
    const current = String(this.values.get(revisionKey) ?? "0");
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      this.onConflict?.();
      return 0;
    }
    if (current !== expected) return 0;
    this.values.set(dataKey, JSON.parse(String(args[1])));
    const nextRevision = Number(current) + 1;
    this.values.set(revisionKey, String(nextRevision));
    return nextRevision;
  }
}

function asRedis(fake: FakeRedis): Redis {
  return fake as unknown as Redis;
}

test("versioned reads treat a missing revision as zero", async () => {
  const fake = new FakeRedis();
  fake.values.set("base:data", { tasks: [] });
  const snapshot = await readVersionedBaseData(asRedis(fake));
  assert.equal(snapshot.revision, 0);
  assert.deepEqual(snapshot.data, { tasks: [] });
});

test("CAS writes a large blob without sending the previous blob back to Redis", async () => {
  const fake = new FakeRedis();
  const data = { projects: [{ id: "p1", logoUrl: `data:image/png;base64,${"A".repeat(320_000)}` }] };
  const result = await compareAndSwapBaseData(asRedis(fake), 0, data);
  assert.equal(result.ok, true);
  assert.equal(fake.evalArgs.length, 2);
  assert.equal(fake.evalArgs[0], "0");
  assert.ok(String(fake.evalArgs[1]).length > 320_000);
  assert.equal(fake.values.get(DATA_REVISION_KEY), "1");
});

test("atomic updates retry a conflict and preserve the concurrent change", async () => {
  const fake = new FakeRedis();
  fake.values.set("base:data", { tasks: [{ id: "t1", title: "before" }], briefs: [] });
  fake.conflictsRemaining = 1;
  fake.onConflict = () => {
    fake.values.set("base:data", { tasks: [{ id: "t1", title: "concurrent" }], briefs: [] });
    fake.values.set(DATA_REVISION_KEY, "1");
  };

  const result = await updateBaseDataAtomically(asRedis(fake), (current) => ({
    ...current,
    briefs: [{ id: "brief-1" }],
  }));

  assert.equal(result.ok, true);
  assert.deepEqual((result.data.tasks as Stored[])[0], { id: "t1", title: "concurrent" });
  assert.deepEqual(result.data.briefs, [{ id: "brief-1" }]);
  assert.equal(result.revision, 2);
});

test("atomic updates stop after bounded contention", async () => {
  const fake = new FakeRedis();
  fake.values.set("base:data", { tasks: [] });
  fake.conflictsRemaining = 10;
  await assert.rejects(
    updateBaseDataAtomically(asRedis(fake), (current) => current, { maxAttempts: 3 }),
    /concurrent writes/i,
  );
});

test("reads migrate a legacy key forward to base:* on first read", async () => {
  const fake = new FakeRedis();
  fake.values.set("bridge:data", { tasks: [{ id: "kept", title: "survives the rename" }] });

  const snapshot = await readVersionedBaseData(asRedis(fake));

  assert.deepEqual((snapshot.data.tasks as Stored[])[0], { id: "kept", title: "survives the rename" });
  // Copied forward, so every later read skips the fallback entirely.
  assert.ok(fake.values.has("base:data"));
});

test("the current key always wins over a legacy key", async () => {
  const fake = new FakeRedis();
  fake.values.set("base:data", { tasks: [{ id: "current" }] });
  fake.values.set("bridge:data", { tasks: [{ id: "stale" }] });

  const snapshot = await readVersionedBaseData(asRedis(fake));

  assert.deepEqual(snapshot.data.tasks, [{ id: "current" }]);
});

test("an install with no stored data reads as empty rather than failing", async () => {
  const fake = new FakeRedis();
  const snapshot = await readVersionedBaseData(asRedis(fake));
  assert.deepEqual(snapshot.data, {});
  assert.equal(snapshot.revision, 0);
});
