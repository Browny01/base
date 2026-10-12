// Operator-only, read-only export. Node is a build/migration tool; it is never
// required by the installed workspace service. Credentials remain in the env.
import { Redis } from "@upstash/redis";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { exportLegacy, verifyMigration, legacyAttachments } from "../packages/sync/src/migration.ts";
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) throw new Error("Load the existing backend environment privately before exporting. Do not paste credentials in chat.");
if (!process.argv[2]) throw new Error("Supply a new private backup file path");
const client = new Redis({ url, token });
const snapshot = await exportLegacy({ mget: (...keys) => client.mget(...keys) });
await verifyMigration(snapshot);
const path = resolve(process.argv[2]);
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
await writeFile(path, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ file: path, sourceKey: snapshot.source.selectedKey, revision: snapshot.source.revision, checksum: snapshot.sha256, attachmentCount: legacyAttachments(snapshot.data).length, sourceWrites: 0, status: "Exported and verified; no import or production change was performed" }, null, 2));
