import { ROOTS, diff, equal, present, absent, type Document, type Operation } from "./protocol.ts";
/** Imports never infer a cloud ancestor from an unrelated local cache. Creates
 * with colliding IDs conflict; legacy deletion intents require explicit review. */
export function importOperations(document: Document, defaults: Document, source?: Record<string, unknown>): Operation[] {
  const changed: Document = {};
  for (const key of ROOTS) if (key in document && !equal(document[key], defaults[key])) changed[key] = document[key];
  const operations = diff({}, changed);
  const nested = (source?.workspace ?? source?.saved ?? source) as Record<string, unknown> | undefined;
  const pending = Array.isArray(nested?.pending) ? nested.pending : [];
  const last = new Map<string, Record<string, unknown>>();
  for (const value of pending) {
    if (!value || typeof value !== "object") continue;
    const operation = value as Record<string, unknown>;
    if (typeof operation.collection === "string" && typeof operation.recordId === "string" && ROOTS.has(operation.collection)) last.set(`${operation.collection}/${operation.recordId}`,operation);
    else if (Array.isArray(operation.path) && operation.path.length === 2 && typeof operation.path[0] === "string" && typeof operation.path[1]?.id === "string") {
      last.set(`${operation.path[0]}/${operation.path[1].id}`, { ...operation, collection: operation.path[0], recordId: operation.path[1].id, action: (operation.after as { exists?: boolean })?.exists === false ? "delete" : "upsert" });
    }
  }
  for (const op of last.values()) if (op.action === "delete") operations.push({ id: crypto.randomUUID(), baseRevision: 0, path: [String(op.collection), { id: String(op.recordId) }], action: "set", requiresReview: true, before: present({ id: String(op.recordId) }), after: absent });
  return operations;
}
