import { test } from "node:test";
import assert from "node:assert/strict";
import { exportLegacy, verifyMigration, legacyAttachments, EXPORT_KEYS } from "../packages/sync/src/migration.ts";

test("legacy export is a single read and preserves current, compatibility and unknown data", async () => {
  const values: Record<string, unknown> = { "base:data": { tasks: [{ id: "t", opaque: { future: 42 } }], futureRoot: { retained: true } }, "bridge:data": { tasks: [{ id: "old" }] }, "nexus:data": { archived: true }, "bridge:data:revision": 10, "bridge:data:history": [{ data: { tasks: [] } }] };
  let reads = 0;
  const snapshot = await exportLegacy({ async mget(...keys) { reads++; assert.deepEqual(keys, EXPORT_KEYS); assert.ok(keys.every(key => !key.includes("auth") && !key.includes("token"))); return keys.map(key => values[key] ?? null); } });
  assert.equal(reads, 1); assert.equal(snapshot.source.selectedKey, "base:data"); assert.equal(snapshot.source.revision, 10); assert.deepEqual(snapshot.data, values["base:data"]); assert.deepEqual(snapshot.archives["nexus:data"], values["nexus:data"]);
  assert.deepEqual(await verifyMigration(JSON.parse(JSON.stringify(snapshot))), snapshot);
  assert.deepEqual(values["bridge:data"], { tasks: [{ id: "old" }] });
});
test("legacy-only sources export without backfilling keys and detect damaged archives", async () => {
  const values: Record<string, unknown> = { "nexus:data": JSON.stringify({ wikiPages: [{ id: "note", content: "🧠".repeat(100000) }] }) };
  const archive = await exportLegacy({ async mget(...keys) { return keys.map(key => values[key] ?? null); } });
  assert.equal(archive.source.selectedKey, "nexus:data"); assert.equal(archive.source.revision, 0); assert.ok(!("base:data" in values));
  const altered = structuredClone(archive); altered.data.wikiPages = []; await assert.rejects(verifyMigration(altered), /checksum/);
});
test("attachment inventory retains exact legacy URLs without fetching untrusted links", () => {
  const url = "https://fixture.public.blob.vercel-storage.com/image.png";
  assert.deepEqual(legacyAttachments({ projects: [{ id: "p", file: url }], future: { nested: url, other: "https://example.com" } }), [url]);
});
