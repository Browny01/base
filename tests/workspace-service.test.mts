import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  diff,
  type Document,
  type SyncResponse,
} from "../packages/sync/src/protocol.ts";
const run = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url));
test(
  "standalone workspace authenticates, retains conflicting offline edits and survives restart",
  { timeout: 120000 },
  async () => {
    await run("cargo", [
      "build",
      "--quiet",
      "--manifest-path",
      join(root, "native/BaseWorkspace/Cargo.toml"),
    ]);
    const binary = join(
        root,
        "native/BaseWorkspace/target/debug/base-workspace",
      ),
      directory = await mkdtemp(join(tmpdir(), "base-workspace-test-"));
    const socket = createServer();
    socket.listen(0, "127.0.0.1");
    await once(socket, "listening");
    const address = socket.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    socket.close();
    await once(socket, "close");
    const origin = `http://127.0.0.1:${port}`,
      password = crypto.randomUUID() + crypto.randomUUID();
    const initialize = spawn(
      binary,
      ["--directory", directory, "--initialize"],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    initialize.stdin.end(JSON.stringify({ password }));
    assert.equal((await once(initialize, "exit"))[0], 0);
    let process = spawn(
      binary,
      ["--directory", directory, "--port", String(port)],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const ready = async () => {
      for (let i = 0; i < 100; i++) {
        if (process.exitCode !== null)
          throw new Error("Workspace stopped during launch");
        try {
          const response = await fetch(origin + "/health");
          if (response.ok)
            return (await response.json()) as { workspaceId: string };
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("Workspace did not become healthy");
    };
    const stop = async () => {
      if (process.exitCode === null) {
        process.kill("SIGTERM");
        assert.equal((await once(process, "exit"))[0], 0);
      }
    };
    try {
      const health = await ready();
      assert.equal((await fetch(origin + "/api/workspace")).status, 401);
      assert.equal(
        (
          await fetch(origin + "/health", {
            headers: { Origin: "https://attacker.example" },
          })
        ).status,
        403,
      );
      const hostileHost = await new Promise<number | undefined>(
        (resolve, reject) => {
          const request = httpRequest(
            origin + "/health",
            { headers: { Host: `attacker.example:${port}` } },
            (response) => {
              response.resume();
              resolve(response.statusCode);
            },
          );
          request.on("error", reject);
          request.end();
        },
      );
      assert.equal(hostileHost, 403);
      const login = async (deviceId: string, supplied = password) => {
        const response = await fetch(origin + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client: "desktop",
            password: supplied,
            deviceId,
          }),
        });
        return {
          response,
          value: (await response.json()) as {
            token: string;
            workspaceId: string;
          },
        };
      };
      assert.equal(
        (await login("wrong", "incorrect-password")).response.status,
        401,
      );
      const first = await login("device-one"),
        second = await login("device-two");
      assert.equal(first.response.status, 200);
      assert.equal(first.value.workspaceId, health.workspaceId);
      const sync = async (
        token: string,
        cursor: number,
        before: Document,
        after: Document,
      ) => {
        const response = await fetch(origin + "/api/native/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            protocol: 2,
            workspaceId: health.workspaceId,
            cursor,
            operations: diff(before, after, () => crypto.randomUUID(), cursor),
          }),
        });
        assert.equal(response.status, 200);
        return (await response.json()) as SyncResponse;
      };
      const initial = {
        tasks: [{ id: "task", title: "Initial", opaque: { retained: true } }],
      };
      const saved = await sync(first.value.token, 0, {}, initial);
      assert.equal(saved.revision, 1);
      const firstEdit = await sync(first.value.token, 1, initial, {
        tasks: [{ ...initial.tasks[0], title: "Desktop offline" }],
      });
      assert.equal(firstEdit.revision, 2);
      const conflicting = await sync(second.value.token, 1, initial, {
        tasks: [{ ...initial.tasks[0], title: "Phone offline" }],
      });
      assert.equal(conflicting.conflicts[0].reason, "concurrent-edit");
      assert.deepEqual(conflicting.conflicts[0].operation.after, {
        exists: true,
        value: "Phone offline",
      });
      const uploaded = await fetch(
        origin + "/api/blob/upload?filename=offline.txt",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${first.value.token}`,
            "Content-Type": "text/plain",
          },
          body: "Persisted attachment",
        },
      );
      assert.equal(uploaded.status, 200);
      const attachment = (await uploaded.json()) as { url: string };
      await stop();
      process = spawn(
        binary,
        ["--directory", directory, "--port", String(port)],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      assert.equal((await ready()).workspaceId, health.workspaceId);
      const exported = await fetch(origin + "/api/workspace/export", {
        headers: { Authorization: `Bearer ${first.value.token}` },
      });
      assert.equal(exported.status, 200);
      const data = ((await exported.json()) as { data: Document }).data;
      assert.equal((data.tasks as Document[])[0].title, "Desktop offline");
      assert.deepEqual((data.tasks as Document[])[0].opaque, {
        retained: true,
      });
      const filePath = new URL(attachment.url).pathname;
      assert.equal(
        await (
          await fetch(origin + filePath, {
            headers: { Authorization: `Bearer ${first.value.token}` },
          })
        ).text(),
        "Persisted attachment",
      );
      assert.equal((await fetch(origin + filePath)).status, 401);
      const recovery = await fetch(origin + "/api/native/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${first.value.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocol: 2,
          workspaceId: health.workspaceId,
          cursor: 100,
          operations: [],
        }),
      });
      assert.equal(
        ((await recovery.json()) as SyncResponse).recovery?.reason,
        "server-reset",
      );
      const revoked = await fetch(origin + "/api/devices/revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${first.value.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId: "device-two" }),
      });
      assert.equal(revoked.status, 200);
      assert.equal(
        (
          await fetch(origin + "/api/workspace/export", {
            headers: { Authorization: `Bearer ${second.value.token}` },
          })
        ).status,
        401,
      );
      await stop();
      const sqlite = new DatabaseSync(join(directory, "workspace.sqlite3"));
      const verifier = sqlite
        .prepare("SELECT value FROM metadata WHERE key='password'")
        .get()?.value as string;
      assert.ok(!verifier.includes(password));
      assert.equal(
        sqlite.prepare("PRAGMA user_version").get()?.user_version,
        2,
      );
      sqlite.close();
      assert.ok(
        (await readFile(join(directory, "workspace.sqlite3"))).length > 0,
      );
    } finally {
      await stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
