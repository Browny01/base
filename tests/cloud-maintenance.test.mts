import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import { collectUnreferencedRecovery, schedule } from "../apps/cloud/src/jobs.ts";
import { now } from "../apps/cloud/src/types.ts";

test("recovery cleanup seeks exact keys through large retained histories without losing protected objects", async () => {
  const { env, database, objects, account } = cloudEnvironment();
  const { principal } = await account("maintenance");
  const workspace = principal.workspace.id, at = now();
  const insertObject = database.prepare("INSERT INTO recovery_objects VALUES(?,?,?)");
  const insertBackup = database.prepare("INSERT INTO backups VALUES(?,?,?,?,?,?)");
  const insertArchive = database.prepare("INSERT INTO migration_archives VALUES(?,?,?,?,?)");
  const insertJob = database.prepare("INSERT INTO jobs VALUES(?,?,'backup',0,?,?)");
  const key = (id: string) => `recovery/${workspace}/${id}.json`;
  function object(id: string, created = at - 90000) {
    insertObject.run(workspace, key(id), created);
    objects.set(key(id), { data: new Uint8Array([1]) });
  }
  database.exec("BEGIN");
  for (let i = 0; i < 1000; i++) {
    object(`backup-${i}`);
    insertBackup.run(workspace, `backup-${i}`, 0, key(`backup-${i}`), at, at + 86400);
    object(`archive-${i}`);
    insertArchive.run(workspace, `archive-${i}`, key(`archive-${i}`), "hash", at);
    object(`job-${i}`);
    insertJob.run(`job-${i}`, workspace, i % 2 ? "pending" : "processing", at);
  }
  object("done-job");
  insertJob.run("done-job", workspace, "done", at);
  for (let i = 0; i < 150; i++) object(`orphan-${i}`);
  object("recent", at);
  database.exec("COMMIT");

  // Reapply the additive migration to populated tables and verify its plans.
  database.exec("DROP INDEX backups_recovery_key; DROP INDEX migration_archives_recovery_key; DROP INDEX jobs_pending_recovery_key");
  const before = database.prepare("SELECT count(*) AS n FROM recovery_objects").get()!.n;
  database.exec(readFileSync(new URL("../apps/cloud/migrations/0007_recovery_cleanup_indexes.sql", import.meta.url), "utf8"));
  assert.equal(database.prepare("SELECT count(*) AS n FROM recovery_objects").get()!.n, before);
  const queries: string[] = [], prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql: string) => { queries.push(sql); return prepare(sql); };
  await collectUnreferencedRecovery(env);
  assert.equal(objects.size, Number(before) - 100);
  await collectUnreferencedRecovery(env);
  assert.equal(objects.size, 3001);
  assert.ok(objects.has(key("recent")));
  assert.ok(!objects.has(key("done-job")));
  for (let i = 0; i < 1000; i++) {
    assert.ok(objects.has(key(`backup-${i}`)));
    assert.ok(objects.has(key(`archive-${i}`)));
    assert.ok(objects.has(key(`job-${i}`)));
  }
  const query = queries.find(sql => sql.startsWith("SELECT r.workspace_id"))!;
  const plan = database.prepare("EXPLAIN QUERY PLAN " + query).all(at - 86400).map(row => String(row.detail)).join("\n");
  assert.match(plan, /SEARCH r USING INDEX recovery_objects_created \(created_at<\?\)/);
  assert.match(plan, /SEARCH b USING COVERING INDEX backups_recovery_key \(workspace_id=\? AND key=\?\)/);
  assert.match(plan, /SEARCH m USING COVERING INDEX migration_archives_recovery_key \(workspace_id=\? AND key=\?\)/);
  assert.match(plan, /SEARCH j USING INDEX jobs_pending_recovery_key \(workspace_id=\? AND <expr>=\?\)/);
  assert.doesNotMatch(plan, /SCAN [bmj]\b/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("history cleanup indexes the minimum age and preserves Free/Plus retention", async () => {
  const { env, database, account } = cloudEnvironment(), at = now();
  const free = await account("free-history"), plus = await account("plus-history");
  database.prepare("UPDATE workspaces SET next_backup_at=?").run(at + 86400);
  database.prepare("UPDATE workspaces SET plan='plus',subscription_status='active',paid_until=? WHERE id=?").run(at + 86400, plus.principal.workspace.id);
  const insert = database.prepare("INSERT INTO node_history VALUES(?,?,0,0,'{}',?)");
  for (const workspace of [free.principal.workspace.id, plus.principal.workspace.id]) {
    for (const days of [1, 8, 91]) insert.run(workspace, `age-${days}`, at - days * 86400);
  }
  const queries: string[] = [], prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql: string) => { queries.push(sql); return prepare(sql); };
  await schedule(env);
  assert.deepEqual(database.prepare("SELECT node FROM node_history WHERE workspace_id=? ORDER BY node").all(free.principal.workspace.id).map(row => row.node), ["age-1"]);
  assert.deepEqual(database.prepare("SELECT node FROM node_history WHERE workspace_id=? ORDER BY node").all(plus.principal.workspace.id).map(row => row.node), ["age-1", "age-8"]);
  const query = queries.find(sql => sql.startsWith("DELETE FROM node_history"))!;
  const plan = database.prepare("EXPLAIN QUERY PLAN " + query).all(at - 7 * 86400, at, at).map(row => String(row.detail)).join("\n");
  assert.match(plan, /SEARCH h USING INDEX node_history_expiry \(created_at<\?\)/);
  database.close();
});
