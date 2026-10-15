import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import { synchronize } from "../apps/cloud/src/sync.ts";
import { nodePage, recordSnapshot } from "../apps/cloud/src/record-sync.ts";
import { snapshot, documentSize } from "../apps/cloud/src/storage.ts";
import { downloadNodes } from "../packages/sync/src/download.ts";
import { diff, type Document } from "../packages/sync/src/protocol.ts";
import { createWorkspace } from "../apps/cloud/src/workspaces.ts";
import { now } from "../apps/cloud/src/types.ts";
async function fixture() {
  const setup = cloudEnvironment(),
    alice = await setup.account("alice");
  return { ...setup, ...alice };
}
function operation(before: Document, after: Document, revision: number) {
  return diff(before, after, () => crypto.randomUUID(), revision);
}
async function download(
  env: ReturnType<typeof cloudEnvironment>["env"],
  id: string,
  baseline: Document,
  cursor: number,
  full = false,
) {
  return downloadNodes(
    async (path) =>
      Response.json(await nodePage(env, id, new URL(env.PUBLIC_URL + path))),
    id,
    baseline,
    cursor,
    full,
  );
}
test("record writes preserve unloaded siblings/unknown fields, support legacy clients, and download incremental pages", async () => {
  const { env, principal, database } = await fixture(),
    id = principal.workspace.id;
  const initial = {
    wikiPages: Array.from({ length: 40 }, (_, i) => ({
      id: "n" + i,
      title: "Note " + i,
      content: "x".repeat(1000),
      future: { color: "blue" },
    })),
    future: { opaque: true },
  };
  // Import the opaque root with the existing authoritative storage API.
  const { replaceForImport } = await import("../apps/cloud/src/storage.ts");
  await replaceForImport(env, id, 0, initial, "initial");
  const baseline = (await download(env, id, {}, 0, true)).data;
  assert.deepEqual({ ...baseline }, initial);
  const next: Document = {
    ...baseline,
    wikiPages: (baseline.wikiPages as Document[]).map((p) =>
      p.id === "n3" ? { ...p, title: "Edited" } : p,
    ),
  };
  const ops = operation(baseline, next, 1);
  const sparse = await recordSnapshot(env, id, ops);
  assert.equal(
    (sparse.data.wikiPages as Document[]).find((p) => p.id === "n4")!.content,
    undefined,
  );
  assert.equal(
    (sparse.data.wikiPages as Document[]).find((p) => p.id === "n3")!.content,
    "x".repeat(1000),
  );
  const response = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: ops,
  });
  assert.equal(response.transport, "nodes-v1");
  assert.equal(response.data, undefined);
  assert.deepEqual(
    response.applied,
    ops.map((o) => o.id),
  );
  const updated = await download(env, id, baseline, 1);
  assert.deepEqual(updated.data.wikiPages, next.wikiPages);
  assert.deepEqual(updated.data.future, next.future);
  assert.equal(updated.revision, 2);
  assert.equal(
    database
      .prepare(
        "SELECT count(*) AS n FROM node_history WHERE workspace_id=? AND node=?",
      )
      .get(id, '["wikiPages","n3"]')!.n,
    1,
  );
  const retry = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: ops,
  });
  assert.equal(retry.revision, 2);
  assert.deepEqual(retry.applied, response.applied);
  const legacy = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    operations: [],
  });
  assert.deepEqual(legacy.data, updated.data);
  assert.equal(
    (await snapshot(env, id)).workspace.document_bytes,
    documentSize(updated.data),
  );
});
test("offline concurrent fields merge, same-field conflicts retain both values, deleted notes cannot resurrect", async () => {
  const { env, principal } = await fixture(),
    id = principal.workspace.id;
  const base = { wikiPages: [{ id: "n", title: "Old", content: "Paragraph" }] };
  await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 0,
    transport: "nodes-v1",
    operations: operation({}, base, 0),
  });
  const edit = (field: string, value: string) =>
    operation(
      base,
      { wikiPages: [{ ...base.wikiPages[0], [field]: value }] },
      1,
    );
  const first = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: edit("title", "First"),
  });
  const second = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: edit("content", "Other device"),
  });
  assert.equal(second.conflicts.length, 0);
  const conflicting = edit("title", "Offline");
  const conflict = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: conflicting,
  });
  assert.equal(
    conflict.conflicts[0].operation.after.exists &&
      conflict.conflicts[0].operation.after.value,
    "Offline",
  );
  assert.deepEqual(conflict.conflicts[0].remote, {
    exists: true,
    value: "First",
  });
  const before = (await snapshot(env, id)).data;
  await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: conflict.revision,
    transport: "nodes-v1",
    operations: operation(
      before,
      { ...before, wikiPages: [] },
      conflict.revision,
    ),
  });
  const late = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 1,
    transport: "nodes-v1",
    operations: edit("content", "Late"),
  });
  assert.equal(late.conflicts[0].reason, "tombstone");
  assert.equal(
    ((await download(env, id, base, 1)).data.wikiPages as Document[]).length,
    0,
  );
  assert.equal(first.applied.length, 1);
});
test("pagination joins multi-part notes, retries concurrent pages and never accepts cached or incomplete data", async () => {
  const { env, principal } = await fixture(),
    id = principal.workspace.id,
    base = { wikiPages: [{ id: "large", content: "🪷".repeat(140000) }] };
  await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 0,
    transport: "nodes-v1",
    operations: operation({}, base, 0),
  });
  assert.deepEqual(
    (await download(env, id, {}, 0, true)).data.wikiPages,
    base.wikiPages,
  );
  let calls = 0;
  const result = await downloadNodes(
    async (path) => {
      calls++;
      if (calls === 2)
        return Response.json({ error: "changed" }, { status: 409 });
      return Response.json(
        await nodePage(env, id, new URL(env.PUBLIC_URL + path)),
      );
    },
    id,
    {},
    0,
    true,
  );
  assert.deepEqual(result.data.wikiPages, base.wikiPages);
  assert.ok(calls > 2);
  await assert.rejects(
    downloadNodes(
      async () => new Response("<html>Unavailable</html>"),
      id,
      {},
      0,
      true,
    ),
    /unreadable.*retained/,
  );
  await assert.rejects(
    downloadNodes(async () => Response.json(null), id, {}, 0, true),
    /Invalid incremental/,
  );
  await assert.rejects(
    downloadNodes(
      async () => Response.json({}, { headers: { "X-Base-Cached": "1" } }),
      id,
      {},
      0,
      true,
    ),
    /retained/,
  );
  await assert.rejects(
    downloadNodes(
      async () =>
        Response.json({
          workspaceId: id,
          revision: 1,
          parts: [
            {
              node: '["wikiPages","large"]',
              part: 1,
              body: "oops",
              deleted: 0,
            },
          ],
          next: null,
        }),
      id,
      {},
      0,
      true,
    ),
    /incomplete/,
  );
});
test("owner quota is pooled across workspaces and includes pending file reservations", async () => {
  const { env, principal, database } = await fixture(),
    id = principal.workspace.id;
  database
    .prepare(
      "UPDATE workspaces SET plan='plus',subscription_status='active',paid_until=? WHERE id=?",
    )
    .run(now() + 3600, id);
  principal.workspace = (await snapshot(env, id)).workspace;
  const other = await createWorkspace(env, principal, { name: "Other" });
  database
    .prepare("UPDATE workspaces SET reserved_bytes=9999999990 WHERE id=?")
    .run(other.id);
  await assert.rejects(
    synchronize(env, principal, {
      protocol: 2,
      workspaceId: id,
      cursor: 0,
      transport: "nodes-v1",
      operations: operation(
        {},
        { tasks: [{ id: "t", title: "Storage across workspaces" }] },
        0,
      ),
    }),
    /storage is full/,
  );
  assert.equal((await snapshot(env, id)).workspace.revision, 0);
  const { upload } = await import("../apps/cloud/src/files.ts");
  await assert.rejects(
    upload(
      env,
      principal,
      new Request(env.PUBLIC_URL + "/api/blob/upload", {
        method: "POST",
        headers: { "Content-Length": "20" },
        body: "x".repeat(20),
      }),
    ),
    /storage is full/,
  );
  database
    .prepare("UPDATE workspaces SET reserved_bytes=0 WHERE id=?")
    .run(other.id);
  const accepted = await synchronize(env, principal, {
    protocol: 2,
    workspaceId: id,
    cursor: 0,
    transport: "nodes-v1",
    operations: operation({}, { tasks: [{ id: "t", title: "Now fits" }] }, 0),
  });
  assert.equal(accepted.applied.length, 1);
});

test("Cloud acknowledges one operation per request and old batch clients drain without duplicate records", async () => {
  const { env, principal } = await fixture(),
    id = principal.workspace.id,
    doc = {
      tasks: Array.from({ length: 4 }, (_, i) => ({
        id: "t" + i,
        title: "Task " + i,
      })),
    };
  let pending = operation({}, doc, 0),
    cursor = 0;
  while (pending.length) {
    const input = {
      protocol: 2 as const,
      transport: "nodes-v1" as const,
      workspaceId: id,
      cursor,
      operations: pending,
    };
    const first = await synchronize(env, principal, input);
    assert.equal(first.applied.length, 1);
    const repeated = await synchronize(env, principal, input);
    assert.equal(repeated.revision, first.revision);
    assert.deepEqual(repeated.applied, first.applied);
    pending = pending.filter((op) => !first.applied.includes(op.id));
    cursor = first.revision;
  }
  assert.deepEqual(
    (await download(env, id, {}, 0, true)).data.tasks,
    doc.tasks,
  );
});
test("changed-record recovery is workspace scoped and respects the plan retention horizon", async () => {
  const { env, principal, database } = await fixture(),
    id = principal.workspace.id,
    doc = { tasks: [{ id: "t", title: "Original", future: { keep: true } }] };
  const first = await synchronize(env, principal, {
    protocol: 2,
    transport: "nodes-v1",
    workspaceId: id,
    cursor: 0,
    operations: operation({}, doc, 0),
  });
  await synchronize(env, principal, {
    protocol: 2,
    transport: "nodes-v1",
    workspaceId: id,
    cursor: first.revision,
    operations: operation(
      doc,
      { tasks: [{ ...doc.tasks[0], title: "Changed" }] },
      first.revision,
    ),
  });
  const { recordHistory } = await import("../apps/cloud/src/record-sync.ts");
  const url = new URL(
    env.PUBLIC_URL +
      "/api/workspace/record-history?" +
      new URLSearchParams({ node: '["tasks","t"]' }),
  );
  const history = await recordHistory(env, principal.workspace, url);
  assert.equal(JSON.parse(history.parts[0].body).title, "Original");
  assert.deepEqual(JSON.parse(history.parts[0].body).future, { keep: true });
  const other = await (await import("./support/cloud-environment.mts"))
    .cloudEnvironment()
    .account("other");
  assert.deepEqual(
    (await recordHistory(env, other.principal.workspace, url)).parts,
    [],
  );
  database
    .prepare("UPDATE node_history SET created_at=?")
    .run(now() - 8 * 86400);
  assert.deepEqual(
    (await recordHistory(env, principal.workspace, url)).parts,
    [],
  );
  principal.workspace.plan = "plus";
  principal.workspace.subscription_status = "active";
  principal.workspace.paid_until = now() + 3600;
  assert.ok(
    (await recordHistory(env, principal.workspace, url)).parts.length > 0,
  );
});

test('opaque roots and valid record IDs are preserved without changing object prototypes',async()=>{
 const {encodeNodes,decodeNodes}=await import('../packages/sync/src/nodes.ts');
 const data=JSON.parse('{"constructor":{"future":true},"__proto__":{"kept":"opaque"},"tasks":[{"id":"__proto__","title":"Valid identity"}]}');
 const decoded=decodeNodes(encodeNodes(data));assert.deepEqual(JSON.parse(JSON.stringify(decoded)),data);assert.equal(Object.getPrototypeOf(decoded),null);assert.equal(({} as Record<string,unknown>).kept,undefined);
 const {env,principal}=await fixture();const response=await synchronize(env,principal,{protocol:2,transport:'nodes-v1',workspaceId:principal.workspace.id,cursor:0,operations:operation({},{tasks:data.tasks},0)});
 assert.equal(response.applied.length,1);assert.deepEqual((await download(env,principal.workspace.id,{},0,true)).data.tasks,data.tasks);
});
