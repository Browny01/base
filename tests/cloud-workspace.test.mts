import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import worker from "../apps/cloud/src/index.ts";
import { synchronize } from "../apps/cloud/src/sync.ts";
import {
  split,
  snapshot,
  encodeDocument,
  decodeDocument,
  documentWrites,
  replaceForImport,
} from "../apps/cloud/src/storage.ts";
import { entitlements } from "../apps/cloud/src/plans.ts";
import {
  revokeDevice,
  exchangeDevice,
  provision,
} from "../apps/cloud/src/auth.ts";
import {
  STRIPE_API_VERSION,
  verifyStripeSignature,
  webhook,
} from "../apps/cloud/src/billing.ts";
import { sha, now, boundedText } from "../apps/cloud/src/types.ts";
import { schedule, runJob } from "../apps/cloud/src/jobs.ts";
import {
  diff as documentDiff,
  type Document,
  type Operation,
} from "../packages/sync/src/protocol.ts";
const diff = (before: Document, after: Document, revision = 0) =>
  documentDiff(before, after, () => crypto.randomUUID(), revision);
const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
const options = (
  workspaceId: string,
  cursor: number,
  operations: Operation[],
) => ({ protocol: 2 as const, workspaceId, cursor, operations });

test("bounded Cloud sync batches acknowledge only processed edits and drain safely after retries", async () => {
  const {env,account}=cloudEnvironment();
  const {principal}=await account("batch-fixture");
  const before:Document={tasks:[]};
  const after:Document={tasks:Array.from({length:25},(_,i)=>({id:`batch-${i}`,title:`Task ${i}`}))};
  const operations=diff(before,after);
  let pending=[...operations],revision=0;
  const first=await synchronize(env,principal,options(principal.workspace.id,revision,pending));
  assert.equal(first.applied.length,8);
  const retry=await synchronize(env,principal,options(principal.workspace.id,revision,pending));
  assert.equal(retry.revision,first.revision);
  assert.deepEqual(retry.applied,first.applied);
  pending=pending.filter(op=>!first.applied.includes(op.id));revision=first.revision;
  while(pending.length) {
    const response=await synchronize(env,principal,options(principal.workspace.id,revision,pending));
    assert.ok(response.applied.length>0 && response.applied.length<=8);
    assert.equal(response.conflicts.length,0);
    pending=pending.filter(op=>!response.applied.includes(op.id));revision=response.revision;
  }
  assert.deepEqual((await snapshot(env,principal.workspace.id)).data.tasks,after.tasks);
});

test("cloud receipts, revisions, unknown fields and conflicting offline edits survive retries", async () => {
  const { env, account } = cloudEnvironment();
  const { principal } = await account("alice");
  const id = principal.workspace.id;
  const document = {
    tasks: [{ id: "t", title: "Original", opaque: { future: 42 } }],
    futureRoot: { preserved: true },
  };
  // Migrations can carry unknown roots; edits retain them.
  await replaceForImport(env, id, 0, document, "migration-1");
  const first = diff(
    document,
    { ...document, tasks: [{ ...document.tasks[0], title: "Desktop" }] },
    1,
  );
  const second = diff(
    document,
    { ...document, tasks: [{ ...document.tasks[0], title: "Phone" }] },
    1,
  );
  const saved = await synchronize(env, principal, options(id, 1, first));
  assert.equal(saved.revision, 2);
  const retry = await synchronize(env, principal, options(id, 1, first));
  assert.equal(retry.revision, 2);
  assert.deepEqual(retry.applied, saved.applied);
  const conflict = await synchronize(env, principal, options(id, 1, second));
  assert.equal(conflict.conflicts[0].reason, "concurrent-edit");
  assert.deepEqual(conflict.conflicts[0].operation.after, second[0].after);
  assert.deepEqual(conflict.data?.futureRoot, document.futureRoot);
  assert.deepEqual((conflict.data?.tasks as Document[])[0].opaque, {
    future: 42,
  });
  const changed = structuredClone(first);
  changed[0].after = { exists: true, value: "Changed ID" };
  await assert.rejects(
    synchronize(env, principal, options(id, 2, changed)),
    /reused/,
  );
});
test("cloud account isolation covers sync, private files, export and session revocation", async () => {
  const { env, account } = cloudEnvironment();
  const alice = await account("alice"),
    bob = await account("bob");
  await synchronize(
    env,
    alice.principal,
    options(
      alice.principal.workspace.id,
      0,
      diff({}, { tasks: [{ id: "secret", title: "Alice only" }] }, 0),
    ),
  );
  await assert.rejects(
    synchronize(
      env,
      bob.principal,
      options(alice.principal.workspace.id, 0, []),
    ),
    /mismatch/,
  );
  const fetch = (path: string, token: string, init: RequestInit = {}) =>
    worker.fetch(
      new Request(env.PUBLIC_URL + path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
      }),
      env,
    );
  const exported = await fetch("/api/workspace/export", bob.token);
  assert.deepEqual(((await exported.json()) as { data: Document }).data, {});
  const uploaded = await fetch(
    "/api/blob/upload?filename=private.txt",
    alice.token,
    { method: "POST", headers: { "Content-Length": "6" }, body: "secret" },
  );
  assert.equal(uploaded.status, 200);
  const file = (await uploaded.json()) as { id: string };
  assert.equal((await fetch(`/api/files/${file.id}`, bob.token)).status, 404);
  assert.equal(
    await (await fetch(`/api/files/${file.id}`, alice.token)).text(),
    "secret",
  );
  await revokeDevice(env, alice.principal, alice.principal.deviceId);
  assert.equal((await fetch("/api/workspace/export", alice.token)).status, 401);
});
test("cloud rollback recovery is read-only and cannot acknowledge pending operations", async () => {
  const { env, account } = cloudEnvironment();
  const { principal } = await account("alice");
  const ops = diff({}, { tasks: [{ id: "retained", title: "Offline" }] }, 5);
  const result = await synchronize(
    env,
    principal,
    options(principal.workspace.id, 5, ops),
  );
  assert.equal(result.recovery?.reason, "server-reset");
  assert.deepEqual(result.applied, []);
  assert.deepEqual(wire(result.data), {});
});
test("cloud tombstones prevent stale recreation and receipts deduplicate within a batch", async () => {
  const { env, account } = cloudEnvironment();
  const { principal } = await account("alice"),
    id = principal.workspace.id;
  const ops = diff({ tasks: [] }, { tasks: [{ id: "t", title: "Old" }] }, 0);
  const created = await synchronize(
    env,
    principal,
    options(id, 0, [ops[0], ops[0]]),
  );
  assert.equal(created.revision, 1);
  const deleted = diff(created.data!, { ...created.data!, tasks: [] }, 1);
  await synchronize(env, principal, options(id, 1, deleted));
  const stale = structuredClone(ops[0]);
  stale.id = crypto.randomUUID();
  const conflict = await synchronize(env, principal, options(id, 0, [stale]));
  assert.equal(conflict.conflicts[0].reason, "tombstone");
});
test("storage encoding keeps large Unicode notes, ordering and unknown roots intact", () => {
  const note = "x".repeat(127999) + "🧠" + "é".repeat(150000),
    data = {
      wikiPages: [{ id: "n", content: note }],
      tasks: [],
      unknown: { nested: [1, false] },
    };
  const rows = [...encodeDocument(data)].flatMap(([node, body]) =>
    split(body).map((body, part) => ({
      node,
      body: new TextDecoder().decode(new TextEncoder().encode(body)),
      part,
    })),
  );
  assert.deepEqual(wire(decodeDocument(rows)), data);
});
test("Free limits enforce two devices atomically, while downgrades retain readable data", async () => {
  const { env, database } = cloudEnvironment();
  const workspace = await provision(env, "user_free");
  for (let i = 0; i < 3; i++) {
    const verifier = crypto.randomUUID();
    const id = crypto.randomUUID();
    database
      .prepare(
        "INSERT INTO auth_flows(id,challenge,device_id,expires,account_id) VALUES(?,?,?,?,?)",
      )
      .run(id, await sha(verifier), `device-${i}`, now() + 3600, "user_free");
    if (i < 2) await exchangeDevice(env, { id, verifier });
    else
      await assert.rejects(
        exchangeDevice(env, { id, verifier }),
        /two devices/,
      );
  }
  database
    .prepare(
      "UPDATE workspaces SET plan='plus',subscription_status='active',paid_until=? WHERE id=?",
    )
    .run(now() + 3600, workspace.id);
  assert.equal(
    entitlements((await snapshot(env, workspace.id)).workspace).storageBytes,
    10_000_000_000,
  );
  database
    .prepare(
      "UPDATE workspaces SET paid_until=0,document_bytes=300000000 WHERE id=?",
    )
    .run(workspace.id);
  assert.equal(
    entitlements((await snapshot(env, workspace.id)).workspace).storageBytes,
    250_000_000,
  );
  assert.deepEqual(wire((await snapshot(env, workspace.id)).data), {});
});
test("D1 guards roll back all data and receipts when a stale revision attempts a commit", async () => {
  const { env, database, account } = cloudEnvironment();
  const { principal } = await account("alice"),
    id = principal.workspace.id;
  const guard = crypto.randomUUID();
  await assert.rejects(
    env.DB.batch([
      env.DB.prepare("INSERT INTO commit_guards VALUES(?,0)").bind(guard),
      ...documentWrites(env, id, {}, { tasks: [] }),
      env.DB.prepare("INSERT INTO receipts VALUES(?,?,?)").bind(
        id,
        "op",
        "hash",
      ),
    ]),
  );
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM receipts").get()?.n,
    0,
  );
  assert.deepEqual(wire((await snapshot(env, id)).data), {});
});
test("queued backup retries retain one durable archive and its exact revision", async () => {
  const { env, queue, account, database } = cloudEnvironment();
  const { principal } = await account("alice");
  await schedule(env);
  assert.equal(queue.length, 1);
  await runJob(env, queue[0].id);
  await runJob(env, queue[0].id);
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM backups").get()?.n,
    1,
  );
  assert.equal(
    database.prepare("SELECT status FROM jobs").get()?.status,
    "done",
  );
  assert.equal(
    (await snapshot(env, principal.workspace.id)).workspace.revision,
    0,
  );
});
test("Stripe signatures require an intact body, a known secret and a fresh timestamp", async () => {
  const raw = JSON.stringify({ id: "evt_fixture", livemode: false }),
    secret = crypto.randomUUID(),
    at = now();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${at}.${raw}`),
    ),
  ).toString("hex");
  await verifyStripeSignature(raw, `t=${at},v1=${signature}`, secret);
  await assert.rejects(
    verifyStripeSignature(raw + " ", `t=${at},v1=${signature}`, secret),
    /Invalid/,
  );
  await assert.rejects(
    verifyStripeSignature(raw, `t=${at},v1=${signature}`, secret, at + 301),
    /expired/,
  );
  const { env, database } = cloudEnvironment();
  env.STRIPE_WEBHOOK_SECRET = secret;
  env.STRIPE_PLUS_PRICE_ID = "price_fixture";
  const request = () =>
    new Request(env.PUBLIC_URL, {
      method: "POST",
      headers: { "Stripe-Signature": `t=${at},v1=${signature}` },
      body: raw,
    });
  await webhook(env, request());
  await webhook(env, request());
  assert.equal(
    database.prepare("SELECT count(*) AS n FROM webhook_events").get()?.n,
    1,
  );
});
test("untrusted JSON streams stop at the byte limit before buffering the entire body", async () => {
  await assert.rejects(
    boundedText(
      new Request("https://base.example.com", {
        method: "POST",
        body: "🧠".repeat(10),
      }),
      20,
    ),
    /too large/,
  );
});

test("Clerk JWT verification rejects wrong issuer, origin and expired signatures", async () => {
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { clerkIdentity } = await import("../apps/cloud/src/auth.ts");
  const { env } = cloudEnvironment();
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  env.CLERK_JWT_KEY = keys.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  env.CLERK_ISSUER = "https://fixture.clerk.accounts.dev";
  const claims = {
    sub: "user_fixture",
    sid: "sess_fixture",
    iss: env.CLERK_ISSUER,
    azp: env.PUBLIC_URL,
    iat: now(),
    nbf: now() - 1,
    exp: now() + 300,
  };
  const token = (values: typeof claims) => {
    const input =
      Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid: "fixture" }),
      ).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify(values)).toString("base64url");
    return (
      input +
      "." +
      sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString(
        "base64url",
      )
    );
  };
  const request = (values: typeof claims) =>
    new Request(env.PUBLIC_URL, {
      headers: { Authorization: `Bearer ${token(values)}` },
    });
  assert.equal(await clerkIdentity(env, request(claims)), "user_fixture");
  await assert.rejects(
    clerkIdentity(
      env,
      request({ ...claims, iss: "https://other.clerk.accounts.dev" }),
    ),
    /expired/,
  );
  await assert.rejects(
    clerkIdentity(env, request({ ...claims, azp: "https://attacker.example" })),
    /expired/,
  );
  await assert.rejects(
    clerkIdentity(env, request({ ...claims, exp: now() - 100 })),
    /expired/,
  );
});

test("verified Clerk deletion revokes sessions and retains the owner's workspace", async () => {
  const { env, database } = cloudEnvironment();
  const { clerkWebhook } = await import("../apps/cloud/src/auth.ts");
  const secret = crypto.getRandomValues(new Uint8Array(32));
  env.CLERK_WEBHOOK_SIGNING_SECRET =
    "whsec_" + Buffer.from(secret).toString("base64");
  const send = async (
    type: string,
    data: Record<string, unknown>,
    id = crypto.randomUUID(),
  ) => {
    const raw = JSON.stringify({
        type,
        object: "event",
        data,
        timestamp: Date.now(),
      }),
      at = String(now());
    const key = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Buffer.from(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${id}.${at}.${raw}`),
      ),
    ).toString("base64");
    return clerkWebhook(
      env,
      new Request(env.PUBLIC_URL, {
        method: "POST",
        headers: {
          "svix-id": id,
          "svix-timestamp": at,
          "svix-signature": `v1,${signature}`,
        },
        body: raw,
      }),
    );
  };
  const user = {
    id: "user_hook",
    email_addresses: [{ id: "mail", email_address: "fixture@example.com" }],
    primary_email_address_id: "mail",
    first_name: "Fixture",
    last_name: "User",
    updated_at: Date.now(),
  };
  await send("user.created", user);
  const workspace = await provision(env, user.id);
  assert.equal(
    database.prepare("SELECT email FROM accounts WHERE id=?").get(user.id)
      ?.email,
    "fixture@example.com",
  );
  await send("user.deleted", { id: "user_deleted_before_signup" });
  await assert.rejects(
    provision(env, "user_deleted_before_signup"),
    /unavailable/,
  );
  await send("user.deleted", { id: user.id });
  await send("user.updated", { ...user, updated_at: Date.now() + 1000 });
  assert.equal(
    database.prepare("SELECT status FROM accounts WHERE id=?").get(user.id)
      ?.status,
    "deleted",
  );
  assert.equal((await snapshot(env, workspace.id)).workspace.owner_id, user.id);
  await assert.rejects(
    clerkWebhook(
      env,
      new Request(env.PUBLIC_URL, { method: "POST", body: "{}" }),
    ),
    /signature/,
  );
});

test("Stripe lifecycle reconciles authoritative state despite delayed and replayed events", async () => {
  const { env, database, account } = cloudEnvironment();
  const { principal } = await account("stripe-alice");
  env.STRIPE_SECRET_KEY = "sk_test_fixture";
  env.STRIPE_PLUS_PRICE_ID = "price_fixture";
  env.STRIPE_WEBHOOK_SECRET = crypto.randomUUID();
  database
    .prepare("UPDATE workspaces SET customer_id='cus_fixture' WHERE id=?")
    .run(principal.workspace.id);
  const subscription = {
    id: "sub_fixture",
    customer: "cus_fixture",
    status: "active",
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: now() + 3600,
          price: { id: "price_fixture" },
        },
      ],
    },
  };
  let state = structuredClone(subscription),
    hold: (() => void) | null = null,
    started: (() => void) | null = null,
    delay = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith("https://api.stripe.com/v1/subscriptions"))
      throw new Error("Unexpected Stripe fixture request");
    assert.equal(STRIPE_API_VERSION, "2026-09-30.endive");
    assert.equal(
      new Headers(init?.headers).get("Stripe-Version"),
      STRIPE_API_VERSION,
    );
    const value = structuredClone(state);
    if (delay && String(url).includes("/sub_fixture")) {
      delay = false;
      started?.();
      await new Promise<void>((resolve) => {
        hold = resolve;
      });
    }
    return Response.json(
      String(url).includes("?customer=") ? { data: [state] } : value,
    );
  }) as typeof fetch;
  const send = async (id: string, type = "customer.subscription.updated") => {
    const raw = JSON.stringify({
        id,
        livemode: false,
        type,
        data: { object: { id: "sub_fixture", customer: "cus_fixture" } },
      }),
      at = now();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Buffer.from(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${at}.${raw}`),
      ),
    ).toString("hex");
    return webhook(
      env,
      new Request(env.PUBLIC_URL, {
        method: "POST",
        headers: { "Stripe-Signature": `t=${at},v1=${signature}` },
        body: raw,
      }),
    );
  };
  try {
    await send("evt_active");
    assert.equal(
      (await snapshot(env, principal.workspace.id)).workspace.plan,
      "plus",
    );
    const {createWorkspace}=await import("../apps/cloud/src/workspaces.ts");
    principal.workspace=(await snapshot(env,principal.workspace.id)).workspace;
    const secondary=await createWorkspace(env,principal,{name:"Paid second workspace"});
    assert.equal((await snapshot(env,secondary.id)).workspace.plan,"plus");
    delay = true;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const older = send("evt_older");
    await waiting;
    state = { ...state, status: "canceled" };
    await send("evt_canceled", "customer.subscription.deleted");
    assert.equal(
      (await snapshot(env, principal.workspace.id)).workspace.plan,
      "free",
    );
    assert.equal((await snapshot(env,secondary.id)).workspace.plan,"free");
    (hold as unknown as () => void)();
    await older;
    await send("evt_active");
    assert.equal(
      (await snapshot(env, principal.workspace.id)).workspace.plan,
      "free",
    );
    assert.ok(
      (database
        .prepare("SELECT billing_version FROM workspaces WHERE id=?")
        .get(principal.workspace.id)!.billing_version as number) >= 2,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("migration rollback is scoped, checksum-verified and refuses post-import edits", async () => {
  const { env, account } = cloudEnvironment();
  const { rollbackImport } = await import("../apps/cloud/src/storage.ts");
  const alice = await account("migration-alice"),
    bob = await account("migration-bob");
  const data = {
    tasks: [{ id: "migrated", title: "Legacy", future: { kept: true } }],
    futureRoot: { retained: true },
  };
  const imported = await replaceForImport(
    env,
    alice.principal.workspace.id,
    0,
    data,
    "migration-source",
  );
  assert.equal(imported.revision, 1);
  await assert.rejects(
    rollbackImport(env, bob.principal.workspace.id, "migration-source", 1),
    /not found/,
  );
  const restored = await rollbackImport(
    env,
    alice.principal.workspace.id,
    "migration-source",
    1,
  );
  assert.equal(restored.revision, 2);
  assert.deepEqual(
    wire((await snapshot(env, alice.principal.workspace.id)).data),
    {},
  );
  const second = await replaceForImport(
    env,
    bob.principal.workspace.id,
    0,
    data,
    "second-import",
  );
  await synchronize(
    env,
    bob.principal,
    options(
      bob.principal.workspace.id,
      second.revision,
      diff(
        data,
        { ...data, tasks: [{ ...data.tasks[0], title: "New device edit" }] },
        1,
      ),
    ),
  );
  await assert.rejects(
    rollbackImport(env, bob.principal.workspace.id, "second-import", 1),
    /changed after import/,
  );
  assert.equal(
    (
      (await snapshot(env, bob.principal.workspace.id)).data.tasks as Document[]
    )[0].title,
    "New device edit",
  );
});

test("recovery cleanup removes failed-write objects while retaining referenced and pending-job copies", async () => {
  const { env, database, objects, account } = cloudEnvironment();
  const { principal } = await account("gc-alice");
  const { backupBeforeWrite } = await import("../apps/cloud/src/storage.ts");
  const { collectUnreferencedRecovery } =
    await import("../apps/cloud/src/jobs.ts");
  const id = principal.workspace.id,
    orphan = await backupBeforeWrite(env, id, 0, {}),
    retained = await backupBeforeWrite(env, id, 0, {}),
    pending = await backupBeforeWrite(env, id, 0, {}, "queued-job");
  database
    .prepare("INSERT INTO backups VALUES(?,?,?,?,?,?)")
    .run(id, "retained", 0, retained, now(), now() + 86400);
  database
    .prepare("INSERT INTO jobs VALUES(?,?, 'backup',0,'pending',?)")
    .run("queued-job", id, now());
  database
    .prepare("UPDATE recovery_objects SET created_at=?")
    .run(now() - 90000);
  await collectUnreferencedRecovery(env);
  assert.ok(!objects.has(orphan));
  assert.ok(objects.has(retained));
  assert.ok(objects.has(pending));
});

test("Plus expiry limits sync seats without revoking retained data, export or account management", async () => {
  const { env, account, database } = cloudEnvironment(),
    alice = await account("alice"),
    id = alice.principal.workspace.id;
  database
    .prepare(
      "UPDATE workspaces SET plan='plus',subscription_status='active',paid_until=? WHERE id=?",
    )
    .run(now() + 3600, id);
  const thirdToken = `base_desktop_${crypto.randomUUID().replaceAll("-", "").padEnd(43, "x")}`;
  database
    .prepare("INSERT INTO devices VALUES(?,?,?,1,?,?)")
    .run(id, "second", "Second device", now() + 1, now());
  database
    .prepare("INSERT INTO devices VALUES(?,?,?,1,?,?)")
    .run(id, "third", "Third device", now() + 2, now());
  database
    .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
    .run(await sha(thirdToken), id, "third", now() + 3600);
  const request = (path: string, method = "GET", input?: unknown) =>
    worker.fetch(
      new Request(env.PUBLIC_URL + path, {
        method,
        headers: { Authorization: `Bearer ${thirdToken}` },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
      env,
    );
  const input = { protocol: 2, workspaceId: id, cursor: 0, operations: [] };
  assert.equal((await request("/api/native/sync", "POST", input)).status, 200);
  database
    .prepare("UPDATE workspaces SET paid_until=? WHERE id=?")
    .run(now() - 1, id);
  assert.equal((await request("/api/native/sync", "POST", input)).status, 402);
  assert.equal((await request("/api/workspace/export")).status, 200);
  assert.equal((await request("/api/workspace")).status, 200);
  assert.equal(
    database
      .prepare("SELECT count(*) AS count FROM sessions WHERE workspace_id=?")
      .get(id)?.count,
    2,
  );
  assert.equal(
    (
      await request("/api/devices/revoke", "POST", {
        deviceId: alice.principal.deviceId,
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/native/sync", "POST", input)).status, 200);
});

test("unconfigured staging sign-in fails clearly before allocating a device flow", async () => {
  const { env, database } = cloudEnvironment();
  const response = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/auth/device/start", {
      method: "POST",
      body: JSON.stringify({
        challenge: "a".repeat(64),
        deviceId: crypto.randomUUID(),
      }),
    }),
    env,
  );
  assert.equal(response.status, 503);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /setup is not finished/,
  );
  assert.equal(
    database.prepare("SELECT count(*) AS count FROM auth_flows").get()?.count,
    0,
  );
});

test("domain aliases preserve sessions while retaining same-origin browser protection", async () => {
  const { env, account } = cloudEnvironment();
  const original = env.PUBLIC_URL;
  const alias = "https://base-preview.example.com";
  env.PUBLIC_ALIASES = `${original},${alias}`;
  const { token } = await account("domain-transition");
  for (const origin of [original, alias]) {
    const response = await worker.fetch(new Request(origin + "/api/workspace", {
      headers: { Authorization: `Bearer ${token}`, Origin: origin },
    }), env);
    assert.equal(response.status, 200);
    const metadata = await worker.fetch(new Request(origin + "/.well-known/oauth-protected-resource/api/mcp"), env);
    assert.equal((await metadata.json() as {resource:string}).resource, origin + "/api/mcp");
  }
  assert.equal(env.PUBLIC_URL, original, "per-request origin must not mutate shared bindings");
  for (const origin of [original, "https://attacker.example.com"]) {
    const denied = await worker.fetch(new Request(alias + "/api/workspace", {
      method: "POST", headers: { Cookie: `__Host-base_session=${token}`, Origin: origin },
    }), env);
    assert.equal(denied.status, 403);
  }
});

test("attachment deletion accepts retained service origins without crossing workspace ownership", async () => {
  const { deleteFile } = await import("../apps/cloud/src/files.ts");
  const { env, database, account } = cloudEnvironment();
  const { principal } = await account("alias-files-owner");
  const { principal: other } = await account("alias-files-other");
  const old = env.PUBLIC_URL;
  env.PUBLIC_URL = "https://base-preview.example.com";
  env.PUBLIC_ALIASES = old;
  const id = crypto.randomUUID();
  for (const owner of [principal, other]) database.prepare("INSERT INTO files(workspace_id,id,name,mime,size,status,created_at) VALUES(?,?,?,'text/plain',1,'ready',?)").run(owner.workspace.id,id,"fixture.txt",now());
  await assert.rejects(deleteFile(env, principal, {url:`https://attacker.example.com/api/files/${id}`}), /outside this workspace/);
  await deleteFile(env, principal, {url:`${old}/api/files/${id}`});
  assert.equal(database.prepare("SELECT status FROM files WHERE workspace_id=? AND id=?").get(principal.workspace.id,id)?.status,"deleted");
  assert.equal(database.prepare("SELECT status FROM files WHERE workspace_id=? AND id=?").get(other.workspace.id,id)?.status,"ready");
});

test("Cloud attachment mapping stays within configured origins and exact file paths", async () => {
  const {cloudAttachmentPath,BASE_CLOUD_URL} = await import("../packages/core/src/service.ts");
  const path = "/api/files/" + crypto.randomUUID();
  const alias = "https://base.lucasbrown.xyz";
  assert.equal(cloudAttachmentPath(BASE_CLOUD_URL + path, alias), path);
  assert.equal(cloudAttachmentPath(alias + path, BASE_CLOUD_URL), path);
  for (const input of ["https://attacker.example"+path,BASE_CLOUD_URL+"/api/workspace",BASE_CLOUD_URL+path+"?token=x",BASE_CLOUD_URL+path+"#fragment","https://user:pass@base.lucasbrown.xyz"+path]) assert.equal(cloudAttachmentPath(input, alias),null);
  assert.equal(cloudAttachmentPath(BASE_CLOUD_URL+path,"https://attacker.example"),null);
});

test("uploads keep a canonical origin for installed clients while both origins can read them", async () => {
  const {env,account} = cloudEnvironment();
  const {token} = await account("canonical-file-fixture");
  const original = env.PUBLIC_URL, alias = "https://base-preview.example.com";
  env.PUBLIC_ALIASES = `${original},${alias}`;
  env.FILE_PUBLIC_URL = original;
  const uploaded = await worker.fetch(new Request(alias+"/api/blob/upload?filename=fixture.txt", {
    method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Length":"7","Content-Type":"text/plain",Origin:alias},body:"fixture",
  }),env);
  assert.equal(uploaded.status,200);
  const file = await uploaded.json() as {url:string;id:string};
  assert.equal(file.url, original+"/api/files/"+file.id);
  for(const origin of [original,alias]) {
    const read = await worker.fetch(new Request(origin+"/api/files/"+file.id,{headers:{Authorization:`Bearer ${token}`,Origin:origin}}),env);
    assert.equal(read.status,200);
    assert.equal(await read.text(),"fixture");
  }
});
