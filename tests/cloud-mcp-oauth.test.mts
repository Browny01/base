import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import {
  pkce,
  registerMcpClient,
  beginMcpAuthorization,
  approveMcpForWorkspace,
  exchangeMcpToken,
  authenticateMcp,
  revokeMcpGrant,
  listMcpGrants,
} from "../apps/cloud/src/mcp-oauth.ts";
import worker from "../apps/cloud/src/index.ts";
import { now, sha } from "../apps/cloud/src/types.ts";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
async function fixture() {
  const setup = cloudEnvironment(),
    alice = await setup.account("alice"),
    bob = await setup.account("bob"),
    uri = "http://127.0.0.1:54321/callback",
    resource = setup.env.PUBLIC_URL + "/api/mcp";
  const registered = await registerMcpClient(setup.env, {
    redirect_uris: [uri],
    client_name: "Agent",
  });
  const flow = await beginMcpAuthorization(setup.env, {
    client_id: registered.client_id,
    redirect_uri: uri,
    resource,
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: "unpredictable-client-state",
  });
  const approved = await approveMcpForWorkspace(
      setup.env,
      alice.principal.workspace.id,
      flow.id,
    ),
    url = new URL(approved.redirectUrl);
  const input = {
    grant_type: "authorization_code",
    client_id: registered.client_id,
    resource,
    redirect_uri: uri,
    code: url.searchParams.get("code"),
    code_verifier: verifier,
  };
  return { ...setup, alice, bob, registered, flow, input, approved };
}
test("MCP OAuth PKCE matches RFC 7636 and rejects unsafe redirects, scopes and audiences", async () => {
  assert.equal(await pkce(verifier), challenge);
  const { env } = cloudEnvironment();
  for (const uri of [
    "http://remote.example/callback",
    "https://user:password@example.com/callback",
    "https://example.com/callback#fragment",
    "javascript:alert(1)",
  ])
    await assert.rejects(registerMcpClient(env, { redirect_uris: [uri] }));
  const client = await registerMcpClient(env, {
    redirect_uris: ["https://example.com/callback"],
  });
  const input = {
    client_id: client.client_id,
    redirect_uri: "https://example.com/callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: challenge,
    resource: env.PUBLIC_URL + "/api/mcp",
  };
  await assert.rejects(
    beginMcpAuthorization(env, {
      ...input,
      redirect_uri: "https://example.com/other",
    }),
    /not registered/,
  );
  await assert.rejects(
    beginMcpAuthorization(env, {
      ...input,
      resource: "https://another-base.example/api/mcp",
    }),
    /only for/,
  );
  await assert.rejects(
    beginMcpAuthorization(env, { ...input, code_challenge_method: "plain" }),
    /S256/,
  );
  await assert.rejects(
    beginMcpAuthorization(env, { ...input, scope: "admin" }),
    /scope/,
  );
});
test("MCP codes are single use, account bound, hashed, and do not grant desktop API access", async () => {
  const { env, database, alice, bob, input, flow, approved } = await fixture();
  assert.equal(
    new URL(approved.redirectUrl).searchParams.get("state"),
    "unpredictable-client-state",
  );
  await assert.rejects(
    approveMcpForWorkspace(env, bob.principal.workspace.id, flow.id),
    /already approved/,
  );
  await assert.rejects(
    exchangeMcpToken(env, { ...input, code_verifier: "a".repeat(43) }),
    /proof/,
  );
  const results = await Promise.allSettled([
    exchangeMcpToken(env, input),
    exchangeMcpToken(env, input),
  ]);
  assert.equal(
    results.filter((value) => value.status === "fulfilled").length,
    1,
  );
  const tokens = (
    results.find(
      (value) => value.status === "fulfilled",
    ) as PromiseFulfilledResult<Awaited<ReturnType<typeof exchangeMcpToken>>>
  ).value;
  const request = new Request(env.PUBLIC_URL + "/api/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(
    (await authenticateMcp(env, request)).workspace.id,
    alice.principal.workspace.id,
  );
  assert.equal((await worker.fetch(request, env)).status, 200);
  assert.equal(
    (
      await worker.fetch(
        new Request(env.PUBLIC_URL + "/api/workspace/export", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }),
        env,
      )
    ).status,
    401,
  );
  const hashes = database
    .prepare("SELECT hash FROM oauth_tokens")
    .all()
    .map((value) => value.hash);
  assert.equal(hashes.includes(tokens.access_token), false);
  assert.equal(hashes.includes(await sha(tokens.access_token)), true);
  assert.equal(
    database
      .prepare("SELECT count(*) AS count FROM devices WHERE workspace_id=?")
      .get(alice.principal.workspace.id)?.count,
    1,
  );
});
test("rotating MCP refresh tokens detects replay and revokes every access token in the grant", async () => {
  const { env, input } = await fixture(),
    first = await exchangeMcpToken(env, input);
  const refresh = {
    grant_type: "refresh_token",
    client_id: input.client_id,
    resource: input.resource,
    refresh_token: first.refresh_token,
  };
  const second = await exchangeMcpToken(env, refresh);
  const authenticate = (token: string) =>
    authenticateMcp(
      env,
      new Request(env.PUBLIC_URL + "/api/mcp", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  assert.ok(await authenticate(second.access_token));
  await assert.rejects(exchangeMcpToken(env, refresh), /replay/);
  await assert.rejects(authenticate(first.access_token), /revoked/);
  await assert.rejects(authenticate(second.access_token), /revoked/);
  await assert.rejects(
    exchangeMcpToken(env, { ...refresh, refresh_token: second.refresh_token }),
    /revoked/,
  );
});
test("MCP grant revocation is tenant scoped and deleted accounts cannot refresh or authenticate", async () => {
  const { env, database, alice, bob, input } = await fixture(),
    tokens = await exchangeMcpToken(env, input);
  const grants = (await listMcpGrants(env, alice.principal)) as {
    id: string;
  }[];
  assert.equal(grants.length, 1);
  assert.deepEqual(await listMcpGrants(env, bob.principal), []);
  await revokeMcpGrant(env, bob.principal, grants[0].id);
  const request = () =>
    new Request(env.PUBLIC_URL + "/api/mcp", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  assert.ok(await authenticateMcp(env, request()));
  database
    .prepare("UPDATE accounts SET status='deleted' WHERE id=?")
    .run(alice.principal.accountId);
  await assert.rejects(authenticateMcp(env, request()), /revoked/);
  await assert.rejects(
    exchangeMcpToken(env, {
      grant_type: "refresh_token",
      client_id: input.client_id,
      resource: input.resource,
      refresh_token: tokens.refresh_token,
    }),
    /revoked/,
  );
  database
    .prepare("UPDATE accounts SET status='active' WHERE id=?")
    .run(alice.principal.accountId);
  await revokeMcpGrant(env, alice.principal, grants[0].id);
  await assert.rejects(authenticateMcp(env, request()), /revoked/);
});
test("MCP HTTP discovery advertises resource metadata, token exchange is interoperable, and consent requires Clerk", async () => {
  const { env, input, database } = await fixture();
  const unauth = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp", {
      method: "POST",
      headers: { Origin: "https://external-agent.example" },
      body: "{}",
    }),
    env,
  );
  assert.equal(unauth.status, 401);
  assert.match(
    unauth.headers.get("WWW-Authenticate") ?? "",
    /oauth-protected-resource\/api\/mcp/,
  );
  assert.equal(unauth.headers.get("Access-Control-Allow-Origin"), "*");
  const discovery = await worker.fetch(
    new Request(env.PUBLIC_URL + "/.well-known/oauth-authorization-server"),
    env,
  );
  assert.deepEqual(
    ((await discovery.json()) as { code_challenge_methods_supported: string[] })
      .code_challenge_methods_supported,
    ["S256"],
  );
  const exchange = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://external-agent.example",
      },
      body: new URLSearchParams(input as Record<string, string>),
    }),
    env,
  );
  assert.equal(exchange.status, 200);
  const replay = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(input as Record<string, string>),
    }),
    env,
  );
  assert.equal(replay.status, 400);
  assert.equal(
    ((await replay.json()) as { error: string }).error,
    "invalid_grant",
  );
  const approval = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp/approve", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
      body: JSON.stringify({ id: "not-valid" }),
    }),
    env,
  );
  assert.equal(approval.status, 403);
  const unauthApproval = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp/approve", {
      method: "POST",
      body: JSON.stringify({ id: "not-valid" }),
    }),
    env,
  );
  assert.equal(unauthApproval.status, 401);
  database
    .prepare("UPDATE oauth_tokens SET expires=? WHERE kind='access'")
    .run(now() - 1);
});
