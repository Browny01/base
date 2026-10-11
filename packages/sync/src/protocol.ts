/** JSON-preserving protocol shared by the server and desktop. No runtime deps. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Document = { [key: string]: Json };
export type Segment = string | { id: string };
export type Slot = { exists: false } | { exists: true; value: Json };
export type Operation = {
  id: string;
  baseRevision: number;
  path: Segment[];
  action: "set" | "order";
  requiresReview?: boolean;
  before: Slot;
  after: Slot;
};
export type Conflict = {
  id: string;
  operation: Operation;
  remote: Slot;
  /** Captured locally when a remote deletion removed the containing record. */
  localRecord?: Slot;
  revision: number;
  reason: "concurrent-edit" | "deleted-parent" | "protected-field" | "tombstone";
};
export type SyncRequest = { protocol: 2; workspaceId: string; cursor: number; full?: boolean; operations: Operation[] };
export type SyncResponse = {
  protocol: 2;
  workspaceId: string;
  revision: number;
  data?: Document;
  applied: string[];
  conflicts: Conflict[];
};
export type BrowserSyncStatus = {
  pending: number; conflicts: Conflict[]; error: string; syncing: boolean;
  synchronize: () => Promise<void>;
  resolveConflict: (id: string, choice: "local" | "server") => Promise<void>;
  exportLegacy?: () => void;
  hasUnsaved?: boolean;
  retryUnsaved?: () => Promise<void>;
};

export const ROOTS = new Set([
  "tasks", "calendarEvents", "focusSessions", "incomeEntries", "subscriptions",
  "habits", "habitLogs", "dailyRevenueTarget", "projects", "projectNotes",
  "projectLinks", "wallets", "portfolioSnapshots", "milestones", "projectDocuments",
  "projectFiles", "exams", "timetable", "schoolNotes", "playerSkills", "goals",
  "bodyMetrics", "workouts", "socialStats", "businessKPIs", "briefs", "boards",
  "boardItems", "boardDrawings", "wikiPages", "wikiFolders", "profile", "aiSettings",
  "courses", "newsPrefs", "autonomySettings", "shoppingList", "bookmarks",
  "readingList", "watchList", "navPrefs",
]);
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
export const absent: Slot = { exists: false };
export const present = (value: Json): Slot => ({ exists: true, value });
const object = (v: unknown): v is Document => !!v && typeof v === "object" && !Array.isArray(v);
const own = (v: object, key: string) => Object.prototype.hasOwnProperty.call(v, key);
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && equal(a[k], b[k]));
  }
  return false;
}
function jsonSafe(v: unknown, depth = 0): v is Json {
  if (depth > 64) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(x => jsonSafe(x, depth + 1));
  return object(v) && Object.entries(v).every(([k, x]) => !UNSAFE.has(k) && jsonSafe(x, depth + 1));
}
function validSlot(v: unknown): v is Slot {
  return object(v) && (v.exists === false || (v.exists === true && own(v, "value") && jsonSafe(v.value)));
}
export function validOperation(v: unknown): v is Operation {
  if (!object(v) || typeof v.id !== "string" || !/^[\w-]{1,100}$/.test(v.id)) return false;
  if (!Number.isSafeInteger(v.baseRevision) || Number(v.baseRevision) < 0) return false;
  if (!Array.isArray(v.path) || !v.path.length || v.path.length > 32 || typeof v.path[0] !== "string" || !ROOTS.has(v.path[0])) return false;
  if (!v.path.every(s => typeof s === "string"
    ? s.length > 0 && s.length <= 200 && !UNSAFE.has(s)
    : object(s) && Object.keys(s).length === 1 && typeof s.id === "string" && s.id.length > 0 && s.id.length <= 200)) return false;
  if (v.action !== "set" && v.action !== "order") return false;
  if (v.requiresReview !== undefined && typeof v.requiresReview !== "boolean") return false;
  if (!validSlot(v.before) || !validSlot(v.after)) return false;
  if (v.action === "order") {
    return [v.before, v.after].every(s => s.exists && Array.isArray(s.value)
      && s.value.every(id => typeof id === "string") && new Set(s.value).size === s.value.length);
  }
  // A record's identity cannot be changed through a field patch.
  if (v.path.length > 1 && v.path.at(-1) === "id") return false;
  const leaf = v.path.at(-1) as Segment;
  return typeof leaf === "string" || !v.after.exists || (object(v.after.value) && v.after.value.id === leaf.id);
}

export function readSlot(doc: Document, path: Segment[], action: Operation["action"] = "set"): Slot {
  let value: Json = doc;
  for (const segment of path) {
    if (typeof segment === "string") {
      if (!object(value) || !own(value, segment)) return absent;
      value = value[segment];
    } else {
      if (!Array.isArray(value)) return absent;
      const found: Json | undefined = value.find(v => object(v) && v.id === segment.id);
      if (found === undefined) return absent;
      value = found;
    }
  }
  if (action === "order") {
    return Array.isArray(value) ? present(value.filter(object).map(v => v.id)) : absent;
  }
  return present(value);
}

/** Returns null when a containing record was deleted. Never resurrect a parent. */
export function writeSlot(doc: Document, op: Operation): Document | null {
  const result = structuredClone(doc);
  let parent: Json = result;
  for (let i = 0; i < op.path.length - 1; i++) {
    const s = op.path[i];
    if (typeof s === "string") {
      if (!object(parent)) return null;
      if (!own(parent, s)) {
        if (op.before.exists) return null;
        parent[s] = typeof op.path[i + 1] === "string" ? {} : [];
      }
      parent = parent[s];
    } else {
      if (!Array.isArray(parent)) return null;
      const found: Json | undefined = parent.find(v => object(v) && v.id === s.id);
      if (found === undefined) return null;
      parent = found;
    }
  }
  const leaf = op.path.at(-1)!;
  if (op.action === "order") {
    const slot = readSlot(result, op.path);
    if (!slot.exists || !Array.isArray(slot.value) || !op.after.exists || !Array.isArray(op.after.value)) return null;
    const ids = op.after.value;
    const rows = slot.value;
    const ordered = ids.flatMap(id => rows.filter(v => object(v) && v.id === id));
    ordered.push(...rows.filter(v => !object(v) || !ids.includes(v.id)));
    return writeSlot(result, { ...op, action: "set", after: present(ordered) });
  }
  if (typeof leaf === "string") {
    if (!object(parent)) return null;
    if (op.after.exists) parent[leaf] = structuredClone(op.after.value);
    else delete parent[leaf];
  } else {
    if (!Array.isArray(parent)) return null;
    const i = parent.findIndex(v => object(v) && v.id === leaf.id);
    if (!op.after.exists) { if (i >= 0) parent.splice(i, 1); }
    else if (i >= 0) parent[i] = structuredClone(op.after.value);
    else parent.push(structuredClone(op.after.value));
  }
  return result;
}

const idArray = (v: Json): v is Document[] => Array.isArray(v) && v.every(x => object(x) && typeof x.id === "string")
  && new Set(v.map(x => (x as Document).id)).size === v.length;

/** Diff only known roots; opaque/unknown fields survive both sides unchanged. */
export function diff(before: Document, after: Document, id: () => string = () => crypto.randomUUID(), baseRevision = 0): Operation[] {
  const operations: Operation[] = [];
  function walk(a: Slot, b: Slot, path: Segment[]) {
    if (equal(a, b)) return;
    if (a.exists && b.exists && object(a.value) && object(b.value)) {
      for (const key of new Set([...Object.keys(a.value), ...Object.keys(b.value)])) {
        if (UNSAFE.has(key) || key === "id") continue;
        walk(own(a.value, key) ? present(a.value[key]) : absent, own(b.value, key) ? present(b.value[key]) : absent, [...path, key]);
      }
      return;
    }
    // Missing cloud collections behave like an empty list; do not push an
    // empty default that could erase data created on a different device.
    const av = a.exists ? a.value : [];
    if (b.exists && idArray(av) && idArray(b.value)) {
      const old = new Map(av.map(x => [x.id as string, x]));
      const next = new Map(b.value.map(x => [x.id as string, x]));
      for (const recordId of new Set([...old.keys(), ...next.keys()])) {
        walk(old.has(recordId) ? present(old.get(recordId)!) : absent, next.has(recordId) ? present(next.get(recordId)!) : absent, [...path, { id: recordId }]);
      }
      const oldOrder = av.map(x => x.id).filter(x => next.has(x as string));
      const nextOrder = b.value.map(x => x.id).filter(x => old.has(x as string));
      if (!equal(oldOrder, nextOrder)) {
        const fullBefore = [...oldOrder, ...b.value.filter(x => !old.has(x.id as string)).map(x => x.id)];
        operations.push({ id: id(), baseRevision, path, action: "order", before: present(fullBefore), after: present(b.value.map(x => x.id)) });
      }
      return;
    }
    operations.push({ id: id(), baseRevision, path, action: "set", before: a, after: b });
  }
  for (const root of ROOTS) walk(own(before, root) ? present(before[root]) : absent, own(after, root) ? present(after[root]) : absent, [root]);
  return operations;
}

/** Rebase unsent changes without discarding conflicting local values. */
export function overlay(remote: Document, pending: Operation[]): Document {
  let result = remote;
  for (const op of pending) result = writeSlot(result, op) ?? result;
  return result;
}

export function mergeOperations(data: Document, operations: Operation[], revision: number, protectedPath?: (op: Operation) => boolean) {
  let next = data;
  const applied: string[] = [];
  const conflicts: Conflict[] = [];
  for (const op of operations) {
    const remote = readSlot(next, op.path, op.action);
    const reason = protectedPath?.(op) ? "protected-field" : (op.requiresReview && !equal(remote, op.after)) || (!equal(remote, op.before) && !equal(remote, op.after)) ? "concurrent-edit" : null;
    const written = reason ? null : writeSlot(next, op);
    if (reason || !written) conflicts.push({ id: op.id, operation: op, remote, revision, reason: reason ?? "deleted-parent" });
    else { next = written; applied.push(op.id); }
  }
  return { data: next, applied, conflicts };
}
