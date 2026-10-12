import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceNotePassword, checkWorkspaceNotePassword } from "../packages/core/src/workspace-password.ts";
import { canUseBrowserOffline, newBrowserWorkspace } from "../packages/sync/src/browser-state.ts";
import { diff, overlay, type Document } from "../packages/sync/src/protocol.ts";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import { synchronize } from "../apps/cloud/src/sync.ts";
import { signInPage } from "../apps/cloud/src/auth.ts";

test("workspace passwords have salted verifiers, bounded work and no plaintext", async () => {
  const first = await createWorkspaceNotePassword("workspace-fixture-password"), second = await createWorkspaceNotePassword("workspace-fixture-password");
  assert.notEqual(first.salt, second.salt);
  assert.equal(JSON.stringify(first).includes("workspace-fixture-password"), false);
  assert.equal(await checkWorkspaceNotePassword("workspace-fixture-password", first), true);
  assert.equal(await checkWorkspaceNotePassword("wrong-password", first), false);
  assert.equal(await checkWorkspaceNotePassword("workspace-fixture-password", { ...first, iterations: 1e10 }), false);
  assert.equal(await checkWorkspaceNotePassword("workspace-fixture-password", { ...first, hash: "invalid" }), false);
  await assert.rejects(createWorkspaceNotePassword("short"), /10/);
});
test("the shared verifier is interoperable with native PBKDF2 SHA-256", async () => {
  assert.equal(await checkWorkspaceNotePassword("workspace-fixture-password", { version: 1, iterations: 210000, salt: "AQIDBAUGBwgJCgsMDQ4PEA==", hash: "l3J601xuSfJ5SvIiE9rovasOuR4sFiV1iD3E7SjqudI=" }), true);
});
test("concurrent workspace password changes remain atomic and preserve a resolvable conflict", async () => {
  const { env, account } = cloudEnvironment(), owner = await account("workspace-password-owner");
  const old = await createWorkspaceNotePassword("original-password"), a = await createWorkspaceNotePassword("device-a-password"), b = await createWorkspaceNotePassword("device-b-password");
  const initial = { profile: { name: "Fixture", notePassword: old, futureField: 42 } } as unknown as Document;
  const seeded = await synchronize(env, owner.principal, { protocol: 2, workspaceId: owner.principal.workspace.id, cursor: 0, full: true, operations: diff({}, initial) });
  const left = { ...initial, profile: { ...initial.profile as Document, notePassword: a } } as unknown as Document;
  const right = { ...initial, profile: { ...initial.profile as Document, notePassword: b } } as unknown as Document;
  const leftOps = diff(initial, left, () => crypto.randomUUID(), seeded.revision), rightOps = diff(initial, right, () => crypto.randomUUID(), seeded.revision);
  assert.equal(leftOps.length, 1); assert.deepEqual(leftOps[0].path, ["profile", "notePassword"]);
  const applied = await synchronize(env, owner.principal, { protocol: 2, workspaceId: owner.principal.workspace.id, cursor: seeded.revision, operations: leftOps });
  const conflicting = await synchronize(env, owner.principal, { protocol: 2, workspaceId: owner.principal.workspace.id, cursor: seeded.revision, operations: rightOps });
  assert.equal(conflicting.conflicts.length, 1);
  assert.deepEqual(conflicting.data!.profile, { name: "Fixture", notePassword: a, futureField: 42 });
  assert.equal(await checkWorkspaceNotePassword("device-a-password", (applied.data!.profile as Document).notePassword), true);
  assert.deepEqual((overlay(conflicting.data!, rightOps).profile as Document).notePassword, b);
});
test("offline browser access requires a prior, unexpired grant for the selected Cloud workspace", () => {
  const a = newBrowserWorkspace("cloud-a", "https://base.test", "base_cloud_a", {}), b = newBrowserWorkspace("cloud-b", "https://base.test", "base_cloud_b", {}), local = newBrowserWorkspace("local", "", "local", {});
  const grant = { workspaceId: a.workspaceId, expiresAt: 5000 };
  assert.equal(canUseBrowserOffline(a, undefined, 1000), false);
  assert.equal(canUseBrowserOffline(a, grant, 1000), true);
  assert.equal(canUseBrowserOffline(b, grant, 1000), false);
  assert.equal(canUseBrowserOffline(local, grant, 1000), false);
  assert.equal(canUseBrowserOffline(a, grant, 5000), false);
  assert.equal(canUseBrowserOffline(a, { ...grant, expiresAt: Infinity }, 1000), false);
});
test("hosted Clerk pages have the shared Base design and retain nonce-protected scripts", async () => {
  const { env } = cloudEnvironment();
  env.CLERK_PUBLISHABLE_KEY = "pk_test_" + Buffer.from("fixture.clerk.accounts.dev$").toString("base64").replace(/=+$/, "");
  const page = signInPage(env, null, true), html = await page.text();
  assert.match(html, /Your account/); assert.match(html, /mountUserProfile/); assert.match(html, /Base Geist/); assert.match(html, /base-change-account/);
  assert.match(page.headers.get("Content-Security-Policy")!, /script-src 'nonce-/);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  assert.throws(() => signInPage(env, "<script>bad</script>"), /Open Sign in/);
});
