import { requireOwner, workspaceRole } from "./access.ts";
import { effectivePlan, entitlements } from "./plans.ts";
import {
  HttpError,
  now,
  random,
  sha,
  type Env,
  type Principal,
  type WorkspaceRow,
} from "./types.ts";
export async function listWorkspaces(env: Env, principal: Principal) {
  return (
    await env.DB.prepare(
      "SELECT w.id,w.name,w.owner_id,m.role FROM workspaces w JOIN accounts a ON a.id=w.owner_id LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.account_id=? WHERE a.status='active' AND (w.owner_id=? OR m.account_id IS NOT NULL) ORDER BY w.name,w.id",
    )
      .bind(principal.accountId, principal.accountId)
      .all()
  ).results;
}
export async function ownerUsage(env: Env, owner: string) {
  return (await env.DB.prepare(
    "SELECT coalesce(sum(document_bytes+file_bytes+reserved_bytes),0) AS bytes FROM workspaces WHERE owner_id=?",
  )
    .bind(owner)
    .first<{ bytes: number }>())!.bytes;
}
async function anchor(env: Env, account: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM workspaces WHERE owner_id=? AND billing_workspace_id IS NULL ORDER BY id LIMIT 1",
  )
    .bind(account)
    .first<WorkspaceRow>();
  if (!row) throw new HttpError(403, "Account workspace unavailable");
  return row;
}
export async function createWorkspace(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  const billing = await anchor(env, principal.accountId);
  if (effectivePlan(billing) !== "plus")
    throw new HttpError(
      402,
      "Multiple workspaces are included in Base Cloud Plus",
    );
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80)
    throw new HttpError(400, "Enter a workspace name of up to 80 characters");
  const id = `base_cloud_${(await sha(random())).slice(0, 40)}`,
    guard = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM workspaces w JOIN accounts a ON a.id=w.owner_id WHERE w.id=? AND a.status='active' AND w.plan='plus' AND w.subscription_status IN ('active','trialing') AND w.paid_until>?) THEN 1 ELSE 0 END)",
    ).bind(guard, billing.id, now()),
    env.DB.prepare(
      "INSERT INTO workspaces(id,owner_id,name,billing_workspace_id,plan,subscription_status,paid_until) SELECT ?,owner_id,?,id,plan,subscription_status,paid_until FROM workspaces WHERE id=?",
    ).bind(id, name, billing.id),
    env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(guard),
  ]);
  return { id, name };
}
export async function inviteMember(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  requireOwner(principal);
  if (input.revoke === true) {
    await env.DB.prepare("DELETE FROM workspace_invites WHERE workspace_id=?")
      .bind(principal.workspace.id)
      .run();
    return { ok: true };
  }
  if (effectivePlan(principal.workspace) !== "plus")
    throw new HttpError(
      402,
      "Workspace sharing is included in Base Cloud Plus",
    );
  if (!["editable", "viewable"].includes(String(input.role)))
    throw new HttpError(400, "Choose Editable or Viewable");
  const code = random(),
    expires = now() + 7 * 86400;
  await env.DB.prepare("INSERT INTO workspace_invites VALUES(?,?,?,?,?)")
    .bind(
      await sha(code),
      principal.workspace.id,
      input.role,
      expires,
      principal.accountId,
    )
    .run();
  return { code, expiresAt: expires * 1000 };
}
export async function acceptInvite(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  if (typeof input.code !== "string" || !/^[\w-]{43}$/.test(input.code.trim()))
    throw new HttpError(400, "Enter a valid invitation code");
  const hash = await sha(input.code.trim()),
    id = crypto.randomUUID();
  const invite = await env.DB.prepare(
    "SELECT i.*,w.owner_id FROM workspace_invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.hash=? AND i.expires>?",
  )
    .bind(hash, now())
    .first<{ workspace_id: string; role: string; owner_id: string }>();
  if (!invite)
    throw new HttpError(404, "Invitation expired, revoked or already used");
  if (invite.owner_id === principal.accountId)
    throw new HttpError(409, "You already own this workspace");
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM workspace_invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.hash=? AND i.expires>? AND w.plan='plus' AND w.subscription_status IN ('active','trialing') AND w.paid_until>?) THEN 1 ELSE 0 END)",
    ).bind(id, hash, now(), now()),
    // Accepting another invitation must never demote an existing editor.
    env.DB.prepare(
      "INSERT INTO workspace_members VALUES(?,?,?,?) ON CONFLICT(workspace_id,account_id) DO UPDATE SET role=CASE WHEN workspace_members.role='editable' THEN 'editable' ELSE excluded.role END",
    ).bind(invite.workspace_id, principal.accountId, invite.role, now()),
    env.DB.prepare("DELETE FROM workspace_invites WHERE hash=?").bind(hash),
    env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(id),
  ]);
  return { id: invite.workspace_id };
}
export async function members(env: Env, principal: Principal) {
  requireOwner(principal);
  return (
    await env.DB.prepare(
      "SELECT m.account_id,m.role,a.display_name,a.email FROM workspace_members m JOIN accounts a ON a.id=m.account_id WHERE m.workspace_id=? ORDER BY m.created_at",
    )
      .bind(principal.workspace.id)
      .all()
  ).results;
}
export async function changeMember(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  requireOwner(principal);
  if (
    typeof input.accountId !== "string" ||
    !["editable", "viewable", "remove"].includes(String(input.role))
  )
    throw new HttpError(400, "Invalid member change");
  if (input.role !== "remove" && effectivePlan(principal.workspace) !== "plus")
    throw new HttpError(402, "Renew Plus to change sharing permissions");
  if (input.role === "remove")
    await env.DB.prepare(
      "DELETE FROM workspace_members WHERE workspace_id=? AND account_id=?",
    )
      .bind(principal.workspace.id, input.accountId)
      .run();
  else
    await env.DB.prepare(
      "UPDATE workspace_members SET role=? WHERE workspace_id=? AND account_id=?",
    )
      .bind(input.role, principal.workspace.id, input.accountId)
      .run();
  return { ok: true };
}
export async function openWorkspace(
  env: Env,
  principal: Principal,
  input: Record<string, unknown>,
) {
  if (typeof input.id !== "string")
    throw new HttpError(400, "Select a workspace");
  const row = await env.DB.prepare(
    "SELECT w.*,m.role FROM workspaces w JOIN accounts a ON a.id=w.owner_id LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.account_id=? WHERE w.id=? AND a.status='active' AND (w.owner_id=? OR m.account_id IS NOT NULL)",
  )
    .bind(principal.accountId, input.id, principal.accountId)
    .first<WorkspaceRow & { role?: "editable" | "viewable" }>();
  if (!row)
    throw new HttpError(
      403,
      "This workspace is unavailable or access was removed",
    );
  const token = "base_desktop_" + random(),
    expires = now() + 30 * 86400,
    g = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO commit_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM workspaces w JOIN accounts a ON a.id=w.owner_id LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.account_id=? WHERE w.id=? AND a.status='active' AND (w.owner_id=? OR m.account_id IS NOT NULL)) AND (EXISTS(SELECT 1 FROM devices WHERE workspace_id=? AND id=? AND enabled=1) OR (SELECT count(*) FROM devices WHERE workspace_id=? AND enabled=1)<?) THEN 1 ELSE 0 END)",
    ).bind(
      g,
      principal.accountId,
      row.id,
      principal.accountId,
      row.id,
      principal.deviceId,
      row.id,
      entitlements(row).devices ?? 2147483647,
    ),
    env.DB.prepare(
      "INSERT INTO devices VALUES(?,?,?,1,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET enabled=1,last_seen=excluded.last_seen",
    ).bind(row.id, principal.deviceId, "Base device", now(), now()),
    env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)").bind(
      await sha(token),
      row.id,
      principal.deviceId,
      expires,
    ),
    env.DB.prepare("INSERT INTO session_accounts VALUES(?,?)").bind(
      await sha(token),
      principal.accountId,
    ),
    env.DB.prepare("DELETE FROM commit_guards WHERE id=?").bind(g),
  ]);
  return {
    token,
    workspaceId: row.id,
    deviceId: principal.deviceId,
    expiresAt: expires * 1000,
    role: workspaceRole({ ...principal, workspace: row, role: row.role }),
  };
}
export async function billingPrincipal(
  env: Env,
  principal: Principal,
): Promise<Principal> {
  requireOwner(principal);
  return { ...principal, workspace: await anchor(env, principal.accountId) };
}
