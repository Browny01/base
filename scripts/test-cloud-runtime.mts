/** Opt-in smoke test of the real workerd/Workers + D1 + R2 bindings.
 * Synthetic tenants are created in base-cloud-staging only and cleaned up.
 * Authentication provisioning deliberately bypasses Clerk for this storage test;
 * a real Clerk/Stripe acceptance run is a separate release gate. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  diff,
  type Document,
  type SyncResponse,
} from "../packages/sync/src/protocol.ts";
const directory = fileURLToPath(new URL("../apps/cloud", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const config = JSON.parse(
  await readFile(join(directory, "wrangler.json"), "utf8"),
);
if (
  config.name !== "base-cloud-staging" ||
  config.vars.ENVIRONMENT !== "staging"
)
  throw new Error("Smoke testing is restricted to staging");
const origin = process.argv[2] || "http://127.0.0.1:8787",
  remote = process.argv.includes("--remote");
const url = new URL(origin);
if (
  (remote &&
    (!url.hostname.endsWith(".workers.dev") || url.protocol !== "https:")) ||
  (!remote && url.hostname !== "127.0.0.1")
)
  throw new Error(
    "Use loopback locally or an isolated workers.dev staging URL",
  );
const health = (await (await fetch(origin + "/health")).json()) as {
  environment: string;
};
assert.equal(health.environment, "staging");
const temporary = await mkdtemp(join(tmpdir(), "base-cloud-smoke-"));
const fixtures = [0, 1].map(() => {
  const id = crypto.randomUUID().replaceAll("-", "");
  return {
    account: `user_fixture_${id}`,
    workspace: `base_fixture_${id}`,
    device: `device_${id}`,
    token: `base_desktop_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`,
  };
});
const sqlString = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function sql(value: string) {
  const path = join(temporary, "fixture.sql");
  await writeFile(path, value, { mode: 0o600 });
  await promisify(execFile)(
    process.execPath,
    [
      cli,
      "d1",
      "execute",
      "base-cloud-staging",
      remote ? "--remote" : "--local",
      "--file",
      path,
    ],
    { cwd: directory, maxBuffer: 4_000_000 },
  );
}
async function request(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  const result = await fetch(origin + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return result;
}
const at = Math.floor(Date.now() / 1000);
const oauthClients: string[] = [],
  oauthFlows: string[] = [];
try {
  await sql(
    fixtures
      .map(
        (fixture) =>
          `INSERT INTO accounts(id,created_at) VALUES(${sqlString(fixture.account)},${at});INSERT INTO workspaces(id,owner_id) VALUES(${sqlString(fixture.workspace)},${sqlString(fixture.account)});INSERT INTO devices VALUES(${sqlString(fixture.workspace)},${sqlString(fixture.device)},'Staging fixture',1,${at},${at});INSERT INTO sessions VALUES(${sqlString(hash(fixture.token))},${sqlString(fixture.workspace)},${sqlString(fixture.device)},${at + 3600});`,
      )
      .join("\n"),
  );
  const [alice, bob] = fixtures;
  const send = async (cursor: number, operations: ReturnType<typeof diff>) => {
    const result = await request("/api/native/sync", alice.token, "POST", {
      protocol: 2,
      workspaceId: alice.workspace,
      cursor,
      operations,
    });
    assert.equal(result.status, 200, "Staging sync failed");
    return (await result.json()) as SyncResponse;
  };
  const initial = {
    tasks: [
      {
        id: "fixture-task",
        title: "Initial",
        unknownField: { preserved: true },
      },
    ],
  };
  const operations = diff({}, initial);
  await writeFile(
    join(temporary, "offline-outbox.json"),
    JSON.stringify(operations),
    { mode: 0o600 },
  );
  const saved = await send(0, operations);
  assert.equal(saved.revision, 1);
  const retry = await send(
    0,
    JSON.parse(await readFile(join(temporary, "offline-outbox.json"), "utf8")),
  );
  assert.equal(retry.revision, 1);
  assert.deepEqual(retry.applied, saved.applied);
  const read = await request("/api/workspace/export", bob.token);
  assert.equal(read.status, 200);
  assert.deepEqual(((await read.json()) as { data: Document }).data, {});
  const changed = { tasks: [{ ...initial.tasks[0], title: "First device" }] };
  await send(
    1,
    diff(initial, changed, () => crypto.randomUUID(), 1),
  );
  const concurrent = await send(
    1,
    diff(
      initial,
      { tasks: [{ ...initial.tasks[0], title: "Other offline device" }] },
      () => crypto.randomUUID(),
      1,
    ),
  );
  assert.equal(concurrent.conflicts[0].reason, "concurrent-edit");
  const uploaded = await fetch(
    origin + "/api/blob/upload?filename=staging.txt",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${alice.token}`,
        "Content-Type": "text/plain",
        "Content-Length": "7",
      },
      body: "fixture",
    },
  );
  assert.equal(uploaded.status, 200);
  const file = (await uploaded.json()) as { id: string };
  assert.equal((await request(`/api/files/${file.id}`, bob.token)).status, 404);
  assert.equal(
    await (await request(`/api/files/${file.id}`, alice.token)).text(),
    "fixture",
  );
  const recovery = await send(100, []);
  assert.equal(recovery.recovery?.reason, "server-reset");
  assert.deepEqual(recovery.applied, []);
  const rpc = await request("/api/mcp", alice.token, "POST", [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "create_record",
        arguments: {
          collection: "projects",
          record: { id: "fixture-project", name: "First" },
        },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "update_record",
        arguments: {
          collection: "projects",
          id: "fixture-project",
          patch: { name: "Second" },
        },
      },
    },
  ]);
  assert.equal(rpc.status, 200);
  const replies = (await rpc.json()) as { result: { isError: boolean } }[];
  assert.ok(replies.every((value) => !value.result.isError));
  const registration = await fetch(origin + "/api/mcp/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Staging fixture",
      redirect_uris: ["http://127.0.0.1:54321/callback"],
    }),
  });
  assert.equal(registration.status, 201);
  const registered = (await registration.json()) as { client_id: string };
  oauthClients.push(registered.client_id);
  const flow = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64url",
    ),
    code = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64url",
    ),
    proof = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    audience = origin + "/api/mcp";
  oauthFlows.push(flow);
  // Operator fixture approval bypasses Clerk; this verifies the deployed
  // Workers/D1 code exchange and grant isolation, not a real browser login.
  await sql(
    `INSERT INTO oauth_flows VALUES(${sqlString(flow)},${sqlString(registered.client_id)},'http://127.0.0.1:54321/callback',${sqlString(challenge)},${sqlString(audience)},'fixture',${at + 600},1);INSERT INTO oauth_codes VALUES(${sqlString(hash(code))},${sqlString(flow)},${sqlString(alice.workspace)},${sqlString(registered.client_id)},'http://127.0.0.1:54321/callback',${sqlString(challenge)},${sqlString(audience)},${at + 300},0);`,
  );
  const exchange = async (input: Record<string, string>) =>
    fetch(origin + "/api/mcp/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(input),
    });
  const granted = await exchange({
    grant_type: "authorization_code",
    client_id: registered.client_id,
    redirect_uri: "http://127.0.0.1:54321/callback",
    code,
    code_verifier: proof,
    resource: audience,
  });
  assert.equal(granted.status, 200);
  const tokens = (await granted.json()) as {
    access_token: string;
    refresh_token: string;
  };
  const readMcp = await request("/api/mcp", tokens.access_token, "POST", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_collection", arguments: { collection: "tasks" } },
  });
  assert.equal(readMcp.status, 200);
  const output = (await readMcp.json()) as {
    result: { content: { text: string }[] };
  };
  assert.equal(
    (JSON.parse(output.result.content[0].text) as { id: string }[])[0].id,
    "fixture-task",
  );
  assert.equal(
    (await request("/api/workspace/export", tokens.access_token)).status,
    401,
  );
  const refresh = {
    grant_type: "refresh_token",
    client_id: registered.client_id,
    resource: audience,
    refresh_token: tokens.refresh_token,
  };
  const rotated = await exchange(refresh);
  assert.equal(rotated.status, 200);
  const next = (await rotated.json()) as { access_token: string };
  assert.equal((await exchange(refresh)).status, 400);
  assert.equal(
    (
      await request("/api/mcp", next.access_token, "POST", {
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
      })
    ).status,
    401,
  );
  let syncLoad: { notes: number; tasks: number; bytes: number; requests: number } | undefined;
  if (process.argv.includes("--sync-load")) {
    const document:Document={
      tasks:Array.from({length:25},(_,i)=>({id:`load-task-${i}`,title:`Task ${i}`,done:false})),
      wikiPages:Array.from({length:100},(_,i)=>({id:`load-note-${i}`,title:`Note ${i}`,blocks:[{id:`block-${i}`,text:"Offline notes. ".repeat(40)}]})),
    };
    let pending=diff({},document),revision=0,requests=0;
    while(pending.length) {
      const batch=pending.slice(0,200);
      const body={protocol:2,workspaceId:bob.workspace,cursor:revision,operations:batch};
      const result=await request("/api/native/sync",bob.token,"POST",body);
      assert.equal(result.status,200,"Load sync exceeded the free-tier budget");
      const response=await result.json() as SyncResponse;
      assert.ok(response.applied.length>0 && response.applied.length<=8);
      assert.equal(response.conflicts.length,0);
      if(requests===0) {
        const retry=await request("/api/native/sync",bob.token,"POST",body);
        assert.equal(retry.status,200);
        const repeated=await retry.json() as SyncResponse;
        assert.deepEqual(repeated.applied,response.applied);
        assert.equal(repeated.revision,response.revision);
      }
      pending=pending.filter(op=>!response.applied.includes(op.id));revision=response.revision;requests++;
      if(!pending.length) {
        assert.deepEqual(response.data?.tasks,document.tasks);
        assert.deepEqual(response.data?.wikiPages,document.wikiPages);
      }
    }
    syncLoad={notes:100,tasks:25,bytes:Buffer.byteLength(JSON.stringify(document)),requests};
  }
  const device = await request("/api/devices/revoke", alice.token, "POST", {
    deviceId: alice.device,
  });
  assert.equal(device.status, 200);
  assert.equal(
    (await request("/api/workspace/export", alice.token)).status,
    401,
  );
  console.log(
    JSON.stringify(
      {
        environment: remote ? "remote staging" : "local workerd",
        ...(syncLoad ? {syncLoad} : {}),
        checks: [
          "durable offline queue replay",
          "receipt idempotency",
          "account isolation",
          "retained concurrent conflict",
          "private R2 file",
          "rollback recovery",
          "device revocation",
          "MCP batch revisions",
          "MCP resource-bound grants",
          "refresh replay revocation",
        ],
        clerk: "not exercised: fixture sessions",
        stripe: "not exercised",
        productionData: "not accessed",
      },
      null,
      2,
    ),
  );
} finally {
  const ids = fixtures.map((fixture) => sqlString(fixture.workspace)).join(",");
  const query = `SELECT 'files/'||workspace_id||'/'||id AS key FROM files WHERE workspace_id IN (${ids}) UNION SELECT key FROM backups WHERE workspace_id IN (${ids}) UNION SELECT key FROM migration_archives WHERE workspace_id IN (${ids}) UNION SELECT key FROM staged_parts WHERE workspace_id IN (${ids}) UNION SELECT key FROM recovery_objects WHERE workspace_id IN (${ids})`;
  const result = await promisify(execFile)(
    process.execPath,
    [
      cli,
      "d1",
      "execute",
      "base-cloud-staging",
      remote ? "--remote" : "--local",
      "--command",
      query,
      "--json",
    ],
    { cwd: directory, maxBuffer: 4_000_000 },
  );
  const rows = (
    JSON.parse(result.stdout) as { results: { key: string }[] }[]
  ).flatMap((value) => value.results);
  for (const row of rows) {
    if (
      !fixtures.some((fixture) =>
        ["files", "recovery", "staging"].some((prefix) =>
          row.key.startsWith(`${prefix}/${fixture.workspace}/`),
        ),
      )
    )
      throw new Error("Cleanup object is outside fixture tenants");
    await promisify(execFile)(
      process.execPath,
      [
        cli,
        "r2",
        "object",
        "delete",
        `base-cloud-files-staging/${row.key}`,
        remote ? "--remote" : "--local",
      ],
      { cwd: directory, maxBuffer: 1_000_000 },
    );
  }
  await sql(
    `DELETE FROM oauth_tokens WHERE grant_id IN (SELECT id FROM oauth_grants WHERE workspace_id IN (${ids}));DELETE FROM oauth_grants WHERE workspace_id IN (${ids});DELETE FROM oauth_codes WHERE workspace_id IN (${ids});${oauthFlows.map((id) => `DELETE FROM oauth_flows WHERE id=${sqlString(id)};`).join("")}${oauthClients.map((id) => `DELETE FROM oauth_clients WHERE id=${sqlString(id)};`).join("")}\n` +
      [
        "sessions",
        "devices",
        "documents",
        "receipt_chunks",
        "receipts",
        "tombstones",
        "files",
        "backups",
        "migration_archives",
        "staged_parts",
        "checkout_attempts",
        "recovery_objects",
      ]
        .map((table) => `DELETE FROM ${table} WHERE workspace_id IN (${ids});`)
        .join("\n") +
      `\nDELETE FROM job_leases WHERE job_id IN (SELECT id FROM jobs WHERE workspace_id IN (${ids}));DELETE FROM jobs WHERE workspace_id IN (${ids});DELETE FROM workspaces WHERE id IN (${ids});DELETE FROM accounts WHERE id IN (${fixtures.map((fixture) => sqlString(fixture.account)).join(",")});`,
  );
  await rm(temporary, { recursive: true, force: true });
}
