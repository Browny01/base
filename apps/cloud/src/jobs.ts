import { backupBeforeWrite, snapshot } from "./storage.ts";
import { entitlements } from "./plans.ts";
import { HttpError, now, type Env, type WorkspaceRow } from "./types.ts";
export async function schedule(env: Env) {
  await collectUnreferencedRecovery(env);
  await env.DB.prepare("DELETE FROM node_history WHERE rowid IN (SELECT h.rowid FROM node_history h JOIN workspaces w ON w.id=h.workspace_id WHERE h.created_at<?-CASE WHEN w.plan='plus' AND w.subscription_status IN ('active','trialing') AND w.paid_until>? THEN 90 ELSE 7 END*86400 LIMIT 1000)").bind(now(),now()).run();
  await env.DB.prepare("DELETE FROM workspace_invites WHERE expires<?").bind(now()).run();
  // SQL jobs are a durable outbox. Queue delivery can fail without losing work.
  const workspaces = await env.DB.prepare(
    "SELECT * FROM workspaces WHERE next_backup_at<=? ORDER BY next_backup_at LIMIT 100",
  )
    .bind(now())
    .all<WorkspaceRow>();
  for (const workspace of workspaces.results) {
    const id = crypto.randomUUID(),
      guard = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM workspaces WHERE id=? AND next_backup_at<=?) THEN 1 ELSE 0 END)",
        ).bind(guard, workspace.id, now()),
        env.DB.prepare(
          "INSERT INTO jobs VALUES(?,?, 'backup',?,'pending',?)",
        ).bind(id, workspace.id, workspace.revision, now()),
        env.DB.prepare(
          "UPDATE workspaces SET next_backup_at=? WHERE id=?",
        ).bind(
          now() + entitlements(workspace).backupHours * 3600,
          workspace.id,
        ),
        env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
      ]);
    } catch {
      /* another scheduler allocated this slot */
    }
  }
  await env.DB.prepare(
    "UPDATE jobs SET status='pending' WHERE status='processing' AND id IN (SELECT job_id FROM job_leases WHERE expires<=?)",
  )
    .bind(now())
    .run();
  const pending = await env.DB.prepare(
    "SELECT id FROM jobs WHERE status='pending' ORDER BY created_at LIMIT 100",
  ).all<{ id: string }>();
  for (const job of pending.results) await env.JOBS.send({ id: job.id });
  await env.DB.prepare("DELETE FROM rate_limits WHERE expires<?")
    .bind(now())
    .run();
  await env.DB.prepare("DELETE FROM auth_flows WHERE expires<?")
    .bind(now() - 86400)
    .run();
  // Keep consumed refresh hashes through the grant lifetime for replay checks.
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM oauth_tokens WHERE grant_id IN (SELECT id FROM oauth_grants WHERE expires<?)",
    ).bind(now()),
    env.DB.prepare("DELETE FROM oauth_grants WHERE expires<?").bind(now()),
    env.DB.prepare("DELETE FROM oauth_codes WHERE expires<?").bind(now()),
    env.DB.prepare(
      "DELETE FROM oauth_flows WHERE expires<? AND id NOT IN (SELECT flow_id FROM oauth_codes)",
    ).bind(now()),
    env.DB.prepare(
      "DELETE FROM oauth_clients WHERE expires<? AND id NOT IN (SELECT client_id FROM oauth_grants) AND id NOT IN (SELECT client_id FROM oauth_flows)",
    ).bind(now()),
  ]);
  await env.DB.prepare("DELETE FROM sessions WHERE expires<?")
    .bind(now())
    .run();
}
export async function runJob(env: Env, id: string) {
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE id=?")
    .bind(id)
    .first<{ workspace_id: string; status: string }>();
  if (!job || job.status === "done") return;
  const owner = crypto.randomUUID(),
    guard = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO job_leases VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE job_leases.expires<=?",
  )
    .bind(id, owner, now() + 120, now())
    .run();
  const lease = await env.DB.prepare(
    "SELECT owner FROM job_leases WHERE job_id=?",
  )
    .bind(id)
    .first<{ owner: string }>();
  if (lease?.owner !== owner)
    throw new HttpError(409, "Backup already in progress; retry delivery");
  await env.DB.prepare(
    "UPDATE jobs SET status='processing' WHERE id=? AND status!='done'",
  )
    .bind(id)
    .run();
  const snap = await snapshot(env, job.workspace_id),
    key = await backupBeforeWrite(
      env,
      job.workspace_id,
      snap.workspace.revision,
      snap.data,
      id,
    ),
    expires = now() + entitlements(snap.workspace).recoveryDays * 86400;
  // A retry after R2 succeeded may observe a later live revision. The stable
  // job object retains its original snapshot and must retain that revision too.
  const object = await env.FILES.head(key),
    revision = Number(object?.customMetadata?.revision);
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Backup revision is unavailable");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM job_leases WHERE job_id=? AND owner=? AND expires>?) THEN 1 ELSE 0 END)",
    ).bind(guard, id, owner, now()),
    env.DB.prepare("INSERT OR IGNORE INTO backups VALUES(?,?,?,?,?,?)").bind(
      job.workspace_id,
      id,
      revision,
      key,
      now(),
      expires,
    ),
    env.DB.prepare("UPDATE jobs SET status='done' WHERE id=?").bind(id),
    env.DB.prepare("DELETE FROM job_leases WHERE job_id=? AND owner=?").bind(
      id,
      owner,
    ),
    env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
  ]);
  await reconcilePendingFiles(env, job.workspace_id);
  const expired = await env.DB.prepare(
    "SELECT id,key FROM backups WHERE workspace_id=? AND expires<? LIMIT 100",
  )
    .bind(job.workspace_id, now())
    .all<{ id: string; key: string }>();
  for (const backup of expired.results) {
    await env.FILES.delete(backup.key);
    await env.DB.prepare(
      "DELETE FROM backups WHERE workspace_id=? AND id=? AND expires<?",
    )
      .bind(job.workspace_id, backup.id, now())
      .run();
  }
  const staged = await env.DB.prepare(
    "SELECT key FROM staged_parts WHERE workspace_id=? AND expires<? LIMIT 100",
  )
    .bind(job.workspace_id, now())
    .all<{ key: string }>();
  for (const item of staged.results) {
    await env.FILES.delete(item.key);
    await env.DB.prepare(
      "DELETE FROM staged_parts WHERE workspace_id=? AND key=? AND expires<?",
    )
      .bind(job.workspace_id, item.key, now())
      .run();
  }
  const deleted = await env.DB.prepare(
    "SELECT id FROM files WHERE workspace_id=? AND status='deleted' AND deleted_at<? LIMIT 100",
  )
    .bind(job.workspace_id, now() - 90 * 86400)
    .all<{ id: string }>();
  for (const file of deleted.results) {
    await env.FILES.delete(`files/${job.workspace_id}/${file.id}`);
    await env.DB.prepare(
      "DELETE FROM files WHERE workspace_id=? AND id=? AND status='deleted'",
    )
      .bind(job.workspace_id, file.id)
      .run();
  }
}

export async function reconcilePendingFiles(env: Env, workspace: string) {
  // Interrupted uploads never hold storage reservations forever. Ready files
  // are not touched; abandoned pending objects are retained until this grace.
  const pending = await env.DB.prepare(
    "SELECT id,size FROM files WHERE workspace_id=? AND status='pending' AND created_at<? LIMIT 100",
  )
    .bind(workspace, now() - 3600)
    .all<{ id: string; size: number }>();
  for (const file of pending.results) {
    const guard = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM files WHERE workspace_id=? AND id=? AND status='pending') THEN 1 ELSE 0 END)",
        ).bind(guard, workspace, file.id),
        env.DB.prepare(
          "UPDATE files SET status='deleted',deleted_at=? WHERE workspace_id=? AND id=? AND status='pending'",
        ).bind(now(), workspace, file.id),
        env.DB.prepare(
          "UPDATE workspaces SET reserved_bytes=max(0,reserved_bytes-?) WHERE id=?",
        ).bind(file.size, workspace),
        env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
      ]);
    } catch {
      /* an upload finished while cleanup was being prepared */
    }
  }
}

export async function collectUnreferencedRecovery(env: Env) {
  // Recovery keys are immutable and never reused by client writes. Pending
  // queue jobs are excluded because their stable IDs can be retried later.
  // A full day's grace exceeds the lifetime of an unacknowledged sync request.
  const rows = await env.DB.prepare(
    "SELECT r.workspace_id,r.key FROM recovery_objects r WHERE r.created_at<? AND NOT EXISTS(SELECT 1 FROM backups b WHERE b.workspace_id=r.workspace_id AND b.key=r.key) AND NOT EXISTS(SELECT 1 FROM migration_archives m WHERE m.workspace_id=r.workspace_id AND m.key=r.key) AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.workspace_id=r.workspace_id AND 'recovery/'||j.workspace_id||'/'||j.id||'.json'=r.key AND j.status!='done') LIMIT 100",
  )
    .bind(now() - 86400)
    .all<{ workspace_id: string; key: string }>();
  for (const row of rows.results) {
    await env.FILES.delete(row.key);
    await env.DB.prepare(
      "DELETE FROM recovery_objects WHERE workspace_id=? AND key=?",
    )
      .bind(row.workspace_id, row.key)
      .run();
  }
}
