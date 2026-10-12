import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import {
  credentialStatus,
  saveCredential,
  readCredential,
} from "../apps/cloud/src/credentials.ts";
import { authenticate, browserSignIn } from "../apps/cloud/src/auth.ts";
import { integration } from "../apps/cloud/src/integrations.ts";
import {
  newBrowserState,
  newBrowserWorkspace,
  changeBrowserWorkspace,
} from "../packages/sync/src/browser-state.ts";
import { diff, overlay, type Document } from "../packages/sync/src/protocol.ts";
import {
  installNotifications,
  enableNotifications,
} from "../lib/notifications.ts";

test("integration keys are encrypted, owner/provider-bound and omitted from statuses and synced documents", async () => {
  const { env, database, account } = cloudEnvironment();
  env.INTEGRATION_ENCRYPTION_KEY = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64");
  const a = await account("key-owner-a"),
    b = await account("key-owner-b"),
    secret = "private-calcom-fixture";
  await saveCredential(env, a.principal, { provider: "calcom", key: secret });
  const row = database
    .prepare(
      "SELECT ciphertext FROM integration_credentials WHERE workspace_id=?",
    )
    .get(a.principal.workspace.id)!;
  assert.equal(String(row.ciphertext).includes(secret), false);
  assert.equal(await readCredential(env, a.principal, "calcom"), secret);
  assert.equal(await readCredential(env, b.principal, "calcom"), undefined);
  assert.equal(
    JSON.stringify(await credentialStatus(env, a.principal)).includes(secret),
    false,
  );
  database
    .prepare("INSERT INTO integration_credentials VALUES(?,?,?,0)")
    .run(b.principal.workspace.id, "calcom", row.ciphertext);
  await assert.rejects(readCredential(env, b.principal, "calcom"), /unlocked/);
  await assert.rejects(
    saveCredential(env, a.principal, { provider: "unknown", key: secret }),
    /Unsupported/,
  );
  await saveCredential(env, a.principal, { provider: "calcom", key: null });
  assert.equal(await readCredential(env, a.principal, "calcom"), undefined);
});
test("credential storage fails closed before writing when its encryption secret is unavailable", async () => {
  const { env, database, account } = cloudEnvironment(),
    a = await account("key-owner");
  await assert.rejects(
    saveCredential(env, a.principal, { provider: "tmdb", key: "fixture" }),
    /not configured/,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM integration_credentials").get()!
      .n,
    0,
  );
});
test("cookie sessions enforce browser mutation origins and the selected workspace", async () => {
  const { env, account } = cloudEnvironment(),
    a = await account("cookie-owner"),
    b = await account("other-owner");
  const cookie = "__Host-base_session=" + a.token;
  const request = (method: string, headers: Record<string, string> = {}) =>
    new Request(env.PUBLIC_URL + "/api/workspace", {
      method,
      headers: { Cookie: cookie, ...headers },
    });
  assert.equal(
    (await authenticate(env, request("GET"))).accountId,
    a.principal.accountId,
  );
  await assert.rejects(authenticate(env, request("POST")), /origin/);
  await assert.rejects(
    authenticate(env, request("POST", { Origin: "https://attacker.test" })),
    /origin/,
  );
  assert.equal(
    (await authenticate(env, request("POST", { Origin: env.PUBLIC_URL })))
      .accountId,
    a.principal.accountId,
  );
  await assert.rejects(
    authenticate(
      env,
      request("GET", { "X-Base-Workspace": b.principal.workspace.id }),
    ),
    /different workspace/,
  );
});
test("public TMDB adapter passes only the caller's key to the fixed provider origin", async () => {
  const { env } = cloudEnvironment(),
    original = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    assert.equal(new URL(String(url)).origin, "https://api.themoviedb.org");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer private-tmdb-fixture",
    );
    return Response.json({
      results: [
        {
          id: 1,
          media_type: "movie",
          title: "A film",
          release_date: "2026-01-01",
        },
      ],
    });
  }) as typeof fetch;
  try {
    const response = await integration(
      env,
      new Request(env.PUBLIC_URL + "/api/tmdb/search?q=film", {
        headers: { "X-Base-Key-tmdb": "private-tmdb-fixture" },
      }),
    );
    assert.equal(response?.status, 200);
    assert.equal((await response!.json()).results[0].title, "A film");
  } finally {
    globalThis.fetch = original;
  }
});
test("browser local writes retain durable operations, enforce stale revision guards and archive recovery", () => {
  const state = newBrowserState(),
    scope = "cloud-a",
    document: Document = {
      tasks: [{ id: "t", title: "Original", opaque: { future: 42 } }],
    };
  state.workspaces[scope] = newBrowserWorkspace(
    scope,
    "https://base.test",
    "a",
    document,
  );
  state.activeScope = scope;
  const edited = {
      tasks: [{ id: "t", title: "Offline", opaque: { future: 42 } }],
    },
    operations = diff(document, edited, () => crypto.randomUUID(), 0);
  const saved = changeBrowserWorkspace(state, "commit_local", {
    scope,
    expectedRevision: 0,
    document: edited,
    operations,
  });
  assert.equal(saved.pending.length, 1);
  assert.deepEqual(saved.document, edited);
  assert.throws(
    () =>
      changeBrowserWorkspace(state, "commit_local", {
        scope,
        expectedRevision: 0,
        document,
        operations,
      }),
    /another tab/,
  );
  state.workspaces[scope].revision = 5;
  const response = {
    protocol: 2,
    workspaceId: "a",
    revision: 0,
    data: { tasks: [] },
    applied: [],
    conflicts: [],
    recovery: { reason: "server-reset", previousRevision: 5 },
  };
  const recovered = changeBrowserWorkspace(state, "apply_sync", {
    scope,
    expectedRevision: 1,
    response,
    document: overlay(response.data, operations),
    recoveryConflicts: [],
  });
  assert.equal(recovered.pending.length, 0);
  assert.equal(Object.keys(state.archives).length, 1);
  assert.deepEqual(
    (Object.values(state.archives)[0] as { document: Document }).document,
    edited,
  );
  state.activeScope = "another";
  assert.throws(
    () =>
      changeBrowserWorkspace(state, "commit_local", {
        scope,
        expectedRevision: 2,
        document,
        operations,
      }),
    /another tab/,
  );
});
test("notification enabling sends a visible test alert and denied permission never sends one", async () => {
  let sent = 0,
    requested = 0;
  installNotifications({
    permission: async () => "default",
    request: async () => {
      requested++;
      return "granted";
    },
    send: async () => {
      sent++;
    },
  });
  assert.equal(await enableNotifications(), "granted");
  assert.equal(requested, 1);
  assert.equal(sent, 1);
  installNotifications({
    permission: async () => "denied",
    request: async () => "denied",
    send: async () => {
      sent++;
    },
  });
  await assert.rejects(enableNotifications(), /blocked/);
  assert.equal(sent, 1);
});

test("browser device identifiers accept generated UUIDs and reject untrusted identifiers", async () => {
  const { env } = cloudEnvironment();
  const request = () =>
    new Request(env.PUBLIC_URL + "/api/auth/browser", {
      method: "POST",
      headers: { Origin: env.PUBLIC_URL },
    });
  await assert.rejects(
    browserSignIn(env, request(), {
      deviceId: "browser-" + crypto.randomUUID(),
    }),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 503,
  );
  await assert.rejects(
    browserSignIn(env, request(), { deviceId: "desktop-owner" }),
    /Invalid browser device/,
  );
});

test("market history falls back to real Yahoo crypto data and indices remain points with daily changes",async()=>{
 const {GET}=await import("../packages/server/src/market-charts.ts");
 const original=globalThis.fetch;
 globalThis.fetch=(async(input)=>{
  const url=new URL(String(input));
  if(url.hostname==="cdn.jsdelivr.net")return Response.json({usd:{aud:1.5}});
  if(url.hostname==="api.coingecko.com")return Response.json({error:"rate limited"},{status:429});
  if(url.hostname==="query1.finance.yahoo.com")return Response.json({chart:{result:[{meta:{regularMarketPrice:110,chartPreviousClose:80,instrumentType:url.pathname.includes("%5E")?"INDEX":"EQUITY",currency:"USD"},timestamp:[1000,2000],indicators:{quote:[{close:[100,110]}]}}]}});
  throw new Error("Unexpected provider");
 }) as typeof fetch;
 try{
  const value=await(await GET()).json();
  const bitcoin=value.assets.find((asset:{id:string})=>asset.id==="bitcoin"),index=value.assets.find((asset:{id:string})=>asset.id==="sp500");
  assert.equal(bitcoin.price,165);assert.equal(bitcoin.note,"Yahoo Finance");assert.equal(bitcoin.history.length,2);
  assert.equal(index.currency,"points");assert.equal(index.price,110);assert.equal(index.change24h,10);
 }finally{globalThis.fetch=original;}
});

test("briefings never call a paid provider without an explicitly unlocked key on native/web clients", async () => {
  const { loadNewsBriefing } = await import("../lib/news-briefing.ts");
  const { installApiTransport } = await import("../lib/api-client.ts");
  const { DEFAULT_AI_SETTINGS } = await import("../lib/ai-settings.ts");
  const { installSecretCache, encryptSecret } = await import("../lib/vault.ts");
  let calls = 0;
  let password: string | null = null;
  installSecretCache({ get: () => password, set: (v) => { password = v; }, clear: () => { password = null; } });
  installApiTransport(async (path, options) => {
    calls++;
    assert.equal(path, "/api/news/summary");
    assert.equal(options?.method, "POST");
    assert.equal(JSON.parse(String(options?.body)).apiKey, "isolated-briefing-key");
    return Response.json({ ok: true, summary: "Fixture briefing" });
  });
  assert.match((await loadNewsBriefing(DEFAULT_AI_SETTINGS)).error!, /disabled/);
  const settings = { ...DEFAULT_AI_SETTINGS, briefingEnabled: true };
  assert.match((await loadNewsBriefing(settings)).error!, /Add your provider key/);
  const encrypted = await encryptSecret("isolated-briefing-key", "fixture-password");
  const saved = { ...settings, keyCipher: encrypted.cipher, keySalt: encrypted.salt };
  assert.match((await loadNewsBriefing(saved)).error!, /locked/);
  password = "wrong-password";
  assert.match((await loadNewsBriefing(saved)).error!, /could not be unlocked/);
  assert.equal(calls, 0);
  password = "fixture-password";
  assert.equal((await loadNewsBriefing(saved)).summary, "Fixture briefing");
  assert.equal(calls, 1);
  password = null;
});
