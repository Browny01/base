import test from "node:test";
import assert from "node:assert/strict";
import { readSyncResponse } from "../packages/sync/src/response.ts";
import { responseOf } from "../apps/desktop/src/native.ts";

test("native sync errors report HTTP status instead of leaking a JSON SyntaxError", async () => {
  for (const [status, body] of [[502, "<html>Bad gateway</html>"], [429, "Too many requests"], [200, "{"], [204, ""]] as const) {
    const response = responseOf({ status, bodyBase64: Buffer.from(body).toString("base64"), contentType: "text/html", cached: false });
    await assert.rejects(readSyncResponse(response), (error: Error) => {
      assert.equal(error.name, "Error");
      assert.match(error.message, new RegExp(String(status)));
      assert.match(error.message, /offline edits are retained/);
      assert.doesNotMatch(error.message, /<html>/);
      return true;
    });
  }
});

test("sync accepts only successful JSON objects and preserves server error details", async () => {
  for (const body of [null, [], "success"]) {
    await assert.rejects(readSyncResponse(Response.json(body)), /Invalid sync response/);
  }
  await assert.rejects(readSyncResponse(Response.json({error:"Storage limit exceeded"}, {status:413})), /413.*Storage limit exceeded.*offline edits are retained/);
  const result = { protocol: 2, workspaceId: "test", revision: 4, applied: [], conflicts: [] };
  assert.deepEqual(await readSyncResponse(Response.json(result)), result);
});
