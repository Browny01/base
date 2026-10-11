import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { validOperation, type Operation } from "../packages/sync/src/protocol.ts";
import { MAX_STAGED_BYTES, type StagedOperation } from "../packages/sync/src/upload.ts";
export { CHUNK_BYTES } from "../packages/sync/src/upload.ts";
export function validReference(value: unknown): value is StagedOperation {
  if (!value || typeof value !== "object") return false;
  const v = value as StagedOperation;
  return typeof v.id === "string" && /^[\w-]{1,100}$/.test(v.id) && /^[a-f0-9]{64}$/.test(v.uploadId) && Number.isInteger(v.parts) && v.parts > 0 && v.parts <= 44;
}
export const chunkKey = (workspace: string, upload: string, index: number) => `base:sync:v2:staging:${workspace}:${upload}:${index}`;
export async function expandOperations(redis: Redis, workspace: string, values: unknown[]): Promise<Operation[]> {
  let bytes = 0;
  const operations: Operation[] = [];
  for (const value of values) {
    if (validOperation(value)) { operations.push(value); continue; }
    if (!validReference(value)) throw new Error("Invalid staged operation reference.");
    const chunks = await redis.mget<(string | null)[]>(...Array.from({ length: value.parts }, (_, i) => chunkKey(workspace, value.uploadId, i)));
    if (chunks.some(chunk => typeof chunk !== "string")) throw new Error("Upload staging expired. Retry the upload; your local original is retained.");
    const raw = Buffer.concat((chunks as string[]).map(chunk => Buffer.from(chunk, "base64"))).toString("utf8");
    bytes += Buffer.byteLength(raw);
    if (bytes > MAX_STAGED_BYTES || createHash("sha256").update(raw).digest("hex") !== value.uploadId) throw new Error("Staged operation exceeded its size limit or failed integrity verification.");
    const operation: unknown = JSON.parse(raw);
    if (!validOperation(operation) || operation.id !== value.id) throw new Error("Invalid staged operation.");
    operations.push(operation);
  }
  return operations;
}
