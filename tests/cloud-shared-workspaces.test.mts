import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import {
  createWorkspace,
  inviteMember,
  acceptInvite,
  openWorkspace,
  changeMember,
  listWorkspaces,
} from "../apps/cloud/src/workspaces.ts";
import { authenticate } from "../apps/cloud/src/auth.ts";
import { now, sha } from "../apps/cloud/src/types.ts";
import worker from "../apps/cloud/src/index.ts";
import { snapshot } from "../apps/cloud/src/storage.ts";
async function fixture() {
  const setup = cloudEnvironment(),
    alice = await setup.account("alice"),
    bob = await setup.account("bob"),
    eve = await setup.account("eve");
  setup.database
    .prepare(
      "UPDATE workspaces SET plan='plus',subscription_status='active',paid_until=? WHERE owner_id='alice'",
    )
    .run(now() + 3600);
  alice.principal.workspace = (
    await snapshot(setup.env, alice.principal.workspace.id)
  ).workspace;
  return { ...setup, alice, bob, eve };
}
test("populated pre-sharing schema migration retains records, sessions and foreign keys", () => {
  const db = new DatabaseSync(":memory:"),
    dir = new URL("../apps/cloud/migrations/", import.meta.url),
    files = readdirSync(dir).sort();
  for (const name of files.filter((n) => n.endsWith(".sql") && n < "0005"))
    db.exec(readFileSync(new URL(name, dir), "utf8"));
  db.exec(
    "INSERT INTO accounts(id,created_at) VALUES('a',1); INSERT INTO workspaces(id,owner_id) VALUES('w','a'); INSERT INTO devices VALUES('w','d','Device',1,1,1); INSERT INTO sessions VALUES('hash','w','d',9999999999); INSERT INTO documents VALUES('w','[\"opaque\"]',0,'{\"kind\":\"value\",\"value\":{\"future\":true}}');",
  );
  for (const name of files.filter((n) => n.endsWith(".sql") && n >= "0005")) {
    db.exec("BEGIN");
    db.exec(readFileSync(new URL(name, dir), "utf8"));
    db.exec("COMMIT");
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM documents").get()!.n, 1);
  assert.equal(
    db.prepare("SELECT account_id FROM session_accounts").get()!.account_id,
    "a",
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.exec("INSERT INTO workspaces(id,owner_id) VALUES('w2','a')");
  assert.equal(db.prepare("SELECT count(*) AS n FROM sessions").get()!.n, 1);
  db.close();
});
test("Plus creates separate workspaces; invitations are hashed, single-use and account scoped", async () => {
  const { env, database, alice, bob, eve } = await fixture();
  await assert.rejects(
    createWorkspace(env, bob.principal, { name: "Denied" }),
    /Plus/,
  );
  const other = await createWorkspace(env, alice.principal, { name: "Studio" });
  assert.notEqual(other.id, alice.principal.workspace.id);
  assert.equal((await snapshot(env, other.id)).workspace.plan, "plus");
  const invite = await inviteMember(env, alice.principal, { role: "editable" });
  assert.ok(invite.code);
  assert.equal(
    database.prepare("SELECT hash FROM workspace_invites").get()!.hash,
    await sha(invite.code!),
  );
  await acceptInvite(env, bob.principal, { code: invite.code });
  await assert.rejects(
    acceptInvite(env, eve.principal, { code: invite.code }),
    /used/,
  );
  assert.equal((await listWorkspaces(env, bob.principal)).length, 2);
  await assert.rejects(
    openWorkspace(env, eve.principal, { id: alice.principal.workspace.id }),
    /unavailable/,
  );
  const session = await openWorkspace(env, bob.principal, {
    id: alice.principal.workspace.id,
  });
  const member = await authenticate(
    env,
    new Request(env.PUBLIC_URL + "/api/workspace", {
      headers: { Authorization: "Bearer " + session.token },
    }),
  );
  assert.equal(member.accountId, "bob");
  assert.equal(member.workspace.owner_id, "alice");
  assert.equal(member.role, "editable");
  await assert.rejects(
    inviteMember(env, member, { role: "editable" }),
    /owner/,
  );
  await changeMember(env, alice.principal, {
    accountId: "bob",
    role: "remove",
  });
  await assert.rejects(
    authenticate(
      env,
      new Request(env.PUBLIC_URL + "/api/workspace", {
        headers: { Authorization: "Bearer " + session.token },
      }),
    ),
    /revoked/,
  );
});
test("Viewable members can read/export but cannot change content, files, credentials, billing or membership", async () => {
  const { env, alice, bob } = await fixture();
  const invitation = await inviteMember(env, alice.principal, {
    role: "viewable",
  });
  await acceptInvite(env, bob.principal, { code: invitation.code });
  const session = await openWorkspace(env, bob.principal, {
    id: alice.principal.workspace.id,
  });
  const call = (path: string, input?: object) =>
    worker.fetch(
      new Request(env.PUBLIC_URL + path, {
        method: input ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + session.token,
          "Content-Type": "application/json",
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
      env,
    );
  assert.equal((await call("/api/workspace/export")).status, 200);
  for (const path of [
    "/api/workspace/credentials",
    "/api/blob/upload",
    "/api/blob/delete",
    "/api/billing/portal",
    "/api/billing/checkout",
    "/api/devices/revoke",
    "/api/workspace/integrations/revoke",
    "/api/workspace/import",
    "/api/workspace/invite",
    "/api/workspace/members",
  ])
    assert.equal((await call(path, { id: "x" })).status, 403, path);
  const read = await call("/api/native/sync", {
    protocol: 2,
    workspaceId: alice.principal.workspace.id,
    cursor: 0,
    transport: "nodes-v1",
    operations: [],
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).access, "viewable");
  assert.equal(
    (
      await call("/api/native/sync", {
        protocol: 2,
        workspaceId: alice.principal.workspace.id,
        cursor: 0,
        operations: [{}],
      })
    ).status,
    403,
  );
});
test("downgrade retains shared access and data but makes shared/additional workspaces viewable", async () => {
  const { env, database, alice, bob } = await fixture();
  const other = await createWorkspace(env, alice.principal, { name: "Second" }),
    invitation = await inviteMember(env, alice.principal, { role: "editable" });
  await acceptInvite(env, bob.principal, { code: invitation.code });
  database.exec("UPDATE workspaces SET paid_until=0 WHERE owner_id='alice'");
  const owner = await openWorkspace(env, alice.principal, { id: other.id });
  assert.equal(owner.role, "viewable");
  const member = await openWorkspace(env, bob.principal, {
    id: alice.principal.workspace.id,
  });
  assert.equal(member.role, "viewable");
  assert.equal((await listWorkspaces(env, alice.principal)).length, 2);
});

test("invitation expiry/revocation and account deletion cannot be bypassed by retained member sessions", async () => {
  const { env, database, alice, bob } = await fixture();
  const invitation = await inviteMember(env, alice.principal, {
    role: "editable",
  });
  await inviteMember(env, alice.principal, { revoke: true });
  await assert.rejects(
    acceptInvite(env, bob.principal, { code: invitation.code }),
    /expired/,
  );
  const next = await inviteMember(env, alice.principal, { role: "editable" });
  database.exec("UPDATE workspace_invites SET expires=0");
  await assert.rejects(
    acceptInvite(env, bob.principal, { code: next.code }),
    /expired/,
  );
  const valid = await inviteMember(env, alice.principal, { role: "editable" });
  await acceptInvite(env, bob.principal, { code: valid.code });
  const session = await openWorkspace(env, bob.principal, {
    id: alice.principal.workspace.id,
  });
  database.exec("UPDATE accounts SET status='deleted' WHERE id='bob'");
  await assert.rejects(
    authenticate(
      env,
      new Request(env.PUBLIC_URL + "/api/workspace", {
        headers: { Authorization: "Bearer " + session.token },
      }),
    ),
    /revoked/,
  );
});
