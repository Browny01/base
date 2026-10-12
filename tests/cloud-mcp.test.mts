import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import { workspaceMcp } from "../apps/cloud/src/mcp.ts";
import { snapshot, replaceForImport } from "../apps/cloud/src/storage.ts";
import { synchronize } from "../apps/cloud/src/sync.ts";
import { diff } from "../packages/sync/src/protocol.ts";
import worker from "../apps/cloud/src/index.ts";

async function call(
  engine: ReturnType<typeof workspaceMcp>,
  name: string,
  args = {},
) {
  const message = (await engine.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  })) as { result: { isError: boolean; content: { text: string }[] } };
  const text = message.result.content[0].text;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { error: message.result.isError, value };
}

test("cloud MCP uses the existing tools and keeps protected notes and unknown fields intact", async () => {
  const { env, account, database } = cloudEnvironment(),
    alice = await account("alice"),
    bob = await account("bob"),
    id = alice.principal.workspace.id;
  await replaceForImport(
    env,
    id,
    0,
    {
      tasks: [],
      futureRoot: { preserved: 42 },
      wikiPages: [
        {
          id: "locked",
          title: "Private",
          locked: true,
          blocks: [{ type: "paragraph", content: "Secret" }],
        },
        { id: "trash", title: "Removed", deletedAt: "2026-10-01", blocks: [] },
        { id: "open", title: "Readable", blocks: [] },
      ],
    },
    "mcp-fixture",
  );
  const engine = workspaceMcp(env, alice.principal);
  assert.equal(engine.toolNames.length, 35);
  const notes = await call(engine, "list_notes");
  assert.deepEqual(
    notes.value.pages.map((page: { id: string }) => page.id),
    ["open"],
  );
  for (const name of ["get_note", "update_note", "delete_note"])
    assert.equal(
      (
        await call(engine, name, {
          id: "locked",
          patch: { title: "Overwritten" },
        })
      ).error,
      true,
    );
  assert.equal(
    (
      await call(engine, "create_record", {
        collection: "projects",
        record: { id: "project", name: "First" },
      })
    ).error,
    false,
  );
  // Two writes in the same engine must read the revision committed by the first.
  assert.equal(
    (
      await call(engine, "update_record", {
        collection: "projects",
        id: "project",
        patch: { name: "Second" },
      })
    ).error,
    false,
  );
  assert.equal(
    (
      await call(engine, "delete_record", {
        collection: "projects",
        id: "project",
      })
    ).error,
    false,
  );
  const saved = await snapshot(env, id);
  assert.equal(saved.data.dataRevision, 3);
  assert.deepEqual(saved.data.futureRoot, { preserved: 42 });
  assert.equal(
    (saved.data.wikiPages as { id: string; title: string }[])[0].title,
    "Private",
  );
  assert.equal(
    database
      .prepare("SELECT count(*) AS count FROM tombstones WHERE workspace_id=?")
      .get(id)?.count,
    1,
  );
  assert.deepEqual(
    (
      await call(workspaceMcp(env, bob.principal), "get_collection", {
        collection: "projects",
      })
    ).value,
    [],
  );
});

test("cloud MCP cannot overwrite a desktop edit made after its cached read", async () => {
  const { env, account } = cloudEnvironment(),
    alice = await account("alice"),
    id = alice.principal.workspace.id;
  const before = { tasks: [{ id: "t", title: "Original", done: false }] };
  await replaceForImport(env, id, 0, before, "mcp-fixture");
  const engine = workspaceMcp(env, alice.principal);
  await call(engine, "get_collection", { collection: "tasks" });
  await synchronize(env, alice.principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    operations: diff(
      before,
      { tasks: [{ id: "t", title: "Desktop", done: false }] },
      () => crypto.randomUUID(),
      1,
    ),
  });
  const result = await call(engine, "update_record", {
    collection: "tasks",
    id: "t",
    patch: { title: "Agent" },
  });
  assert.equal(result.error, true);
  assert.match(result.value ? JSON.stringify(result.value) : "", /changed/);
  assert.equal(
    (await snapshot(env, id)).data.tasks &&
      ((await snapshot(env, id)).data.tasks as { title: string }[])[0].title,
    "Desktop",
  );
});

test("failed autonomy MCP commands are read-only, and HTTP batches remain tenant scoped", async () => {
  const { env, account } = cloudEnvironment(),
    alice = await account("alice"),
    id = alice.principal.workspace.id;
  const engine = workspaceMcp(env, alice.principal);
  const result = await call(engine, "claim_autonomy_task", {
    taskId: "missing",
    runId: "r",
    agent: "agent",
    model: "model",
  });
  assert.equal(result.error, true);
  assert.equal((await snapshot(env, id)).workspace.revision, 0);
  const response = await worker.fetch(
    new Request(env.PUBLIC_URL + "/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${alice.token}` },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ]),
    }),
    env,
  );
  assert.equal(response.status, 200);
  const messages = (await response.json()) as {
    result: { tools: unknown[] };
  }[];
  assert.equal(messages.length, 1);
  assert.equal(messages[0].result.tools.length, 35);
});
