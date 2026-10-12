import type { Document } from "./protocol.ts";
import {
  DATA_KEY, PREVIOUS_DATA_KEYS, DATA_REVISION_KEY, PREVIOUS_REVISION_KEYS,
  DATA_HISTORY_KEY, PREVIOUS_HISTORY_KEYS,
} from "../../../lib/base-data.ts";

const DATA_KEYS = [DATA_KEY, ...PREVIOUS_DATA_KEYS];
const REVISION_KEYS = [DATA_REVISION_KEY, ...PREVIOUS_REVISION_KEYS];
export const EXPORT_KEYS = [...DATA_KEYS, ...REVISION_KEYS, DATA_HISTORY_KEY, ...PREVIOUS_HISTORY_KEYS];
export type LegacyReader = { mget(...keys: string[]): Promise<unknown[]> };
export type MigrationSnapshot = {
  format: "base-migration-v1";
  source: { selectedKey: string; revision: number; exportedAt: string; readOnly: true };
  data: Document;
  archives: Record<string, unknown>;
  sha256: string;
};
async function digest(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function record(value: unknown): Document {
  if (typeof value === "string") value = JSON.parse(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid legacy document. Export stopped without changing its source.");
  return value as Document;
}
/** One atomic MGET; no read-through migrations, credential reads or writes. */
export async function exportLegacy(reader: LegacyReader): Promise<MigrationSnapshot> {
  const values = await reader.mget(...EXPORT_KEYS);
  if (values.length !== EXPORT_KEYS.length) throw new Error("Incomplete legacy export");
  const archives = Object.fromEntries(EXPORT_KEYS.flatMap((key, index) => values[index] == null ? [] : [[key, values[index]]]));
  const selectedKey = DATA_KEYS.find(key => archives[key] != null);
  if (!selectedKey) throw new Error("No application snapshot exists. Nothing was changed.");
  const revisionKey = REVISION_KEYS.find(key => archives[key] != null);
  const revision = Number(revisionKey ? archives[revisionKey] : 0);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid legacy revision; review the source before migrating.");
  const result = { format: "base-migration-v1" as const, source: { selectedKey, revision, exportedAt: new Date().toISOString(), readOnly: true as const }, data: record(archives[selectedKey]), archives };
  return { ...result, sha256: await digest(result) };
}
export async function verifyMigration(value: unknown): Promise<MigrationSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid migration archive");
  const snapshot = value as MigrationSnapshot;
  const { sha256, ...contents } = snapshot;
  if (snapshot.format !== "base-migration-v1" || !/^[a-f0-9]{64}$/.test(sha256 ?? "") || !snapshot.source?.readOnly || !DATA_KEYS.includes(snapshot.source.selectedKey) || !snapshot.archives || !Number.isSafeInteger(snapshot.source.revision) || snapshot.source.revision < 0 || await digest(contents) !== sha256) throw new Error("Migration archive checksum or source identity failed");
  const source = record(snapshot.archives[snapshot.source.selectedKey]);
  if (JSON.stringify(source) !== JSON.stringify(snapshot.data)) throw new Error("Migration document does not match its retained source");
  record(snapshot.data);
  return snapshot;
}
export function legacyAttachments(document: Document): string[] {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") { try { const url = new URL(value); if (url.protocol === "https:" && /^[-\w]+\.(?:public|private)\.blob\.vercel-storage\.com$/.test(url.hostname)) urls.add(value); } catch { /* ordinary record text */ } }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(document); return [...urls];
}
