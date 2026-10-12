// Real SQLite transactions execute the production D1 SQL; only the bindings
// are adapted. Files stay in memory so no live account/data is touched.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type {
  Env,
  Principal,
  WorkspaceRow,
} from "../../apps/cloud/src/types.ts";
import { sha, now } from "../../apps/cloud/src/types.ts";
class Statement {
  database: DatabaseSync;
  sql: string;
  parameters: (string | number | null)[] = [];
  constructor(database: DatabaseSync, sql: string) {
    this.database = database;
    this.sql = sql;
  }
  bind(...parameters: (string | number | null)[]) {
    const statement = new Statement(this.database, this.sql);
    statement.parameters = parameters;
    return statement;
  }
  execute() {
    const statement = this.database.prepare(this.sql);
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql))
      return {
        results: statement.all(...this.parameters),
        success: true,
        meta: { changes: 0 },
      };
    const result = statement.run(...this.parameters);
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }
  async first(column?: string) {
    const row = this.database.prepare(this.sql).get(...this.parameters);
    return row ? (column ? row[column] : row) : null;
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
}
export function cloudEnvironment() {
  const database = new DatabaseSync(":memory:");
  const migrations = new URL("../../apps/cloud/migrations/", import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    database.exec(readFileSync(new URL(name, migrations), "utf8"));
  const objects = new Map<
    string,
    { data: Uint8Array; customMetadata?: Record<string, string> }
  >();
  const queue: { id: string }[] = [];
  const env = {
    DB: {
      prepare: (sql: string) => new Statement(database, sql),
      async batch(statements: Statement[]) {
        database.exec("BEGIN IMMEDIATE");
        try {
          const values = statements.map((statement) => statement.execute());
          database.exec("COMMIT");
          return values;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      },
    },
    FILES: {
      async put(
        key: string,
        input: string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array>,
        options?: { customMetadata?: Record<string, string> },
      ) {
        const data =
          typeof input === "string"
            ? new TextEncoder().encode(input)
            : input instanceof Uint8Array
              ? input
              : new Uint8Array(await new Response(input).arrayBuffer());
        objects.set(key, { data, customMetadata: options?.customMetadata });
        return { key, size: data.length };
      },
      async head(key: string) {
        const object = objects.get(key);
        return object
          ? {
              key,
              size: object.data.length,
              customMetadata: object.customMetadata,
            }
          : null;
      },
      async get(key: string) {
        const object = objects.get(key);
        return object
          ? {
              key,
              body: new Response(Uint8Array.from(object.data).buffer).body,
              customMetadata: object.customMetadata,
              size: object.data.length,
              async arrayBuffer() {
                return object.data.buffer;
              },
              async text() {
                return new TextDecoder().decode(object.data);
              },
            }
          : null;
      },
      async delete(key: string) {
        objects.delete(key);
      },
    },
    CACHE: {},
    JOBS: {
      async send(value: { id: string }) {
        queue.push(value);
      },
    },
    PUBLIC_URL: "https://base.example.com",
    ENVIRONMENT: "staging",
  } as unknown as Env;
  async function account(
    id: string,
  ): Promise<{ principal: Principal; token: string }> {
    database
      .prepare("INSERT INTO accounts(id,created_at) VALUES(?,?)")
      .run(id, now());
    const workspace = `workspace-${id}`;
    database
      .prepare("INSERT INTO workspaces(id,owner_id) VALUES(?,?)")
      .run(workspace, id);
    const device = `device-${id}`;
    database
      .prepare("INSERT INTO devices VALUES(?,?,?,1,?,?)")
      .run(workspace, device, "Test device", now(), now());
    const token =
      "base_desktop_" + crypto.randomUUID().replaceAll("-", "").padEnd(43, "x");
    database
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(await sha(token), workspace, device, now() + 3600);
    return {
      principal: {
        accountId: id,
        deviceId: device,
        workspace: database
          .prepare("SELECT * FROM workspaces WHERE id=?")
          .get(workspace) as unknown as WorkspaceRow,
      },
      token,
    };
  }
  return { env, database, objects, queue, account };
}
