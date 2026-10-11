import { diff, equal, overlay, readSlot, type Conflict, type Document, type Operation, type SyncResponse } from "./protocol.ts";

export function isRecovery(response: SyncResponse, previousRevision: number): boolean {
  return response.recovery?.reason === "server-reset" && response.recovery.previousRevision === previousRevision
    && Number.isSafeInteger(response.revision) && response.revision >= 0 && response.revision < previousRevision
    && !!response.data && !Array.isArray(response.data) && typeof response.data === "object"
    && response.applied.length === 0 && response.conflicts.length === 0;
}
/** A reset has lost its ancestors/receipts. Recover local values conservatively:
 * never infer deletion of new server records, and require review before restoring
 * even formerly acknowledged values. The complete previous state is archived. */
export function recoverSnapshot(local: Document, pending: Operation[], remote: Document, revision: number, id: () => string = () => crypto.randomUUID(), baseline?: Document) {
  // Normalization supplies UI defaults which were never cloud records. They do
  // not need recovery unless an acknowledged value or an edit touched the root.
  const touched = new Set(pending.map(op => String(op.path[0])));
  const source = baseline ? Object.fromEntries(Object.entries(local).filter(([root]) => root in baseline || touched.has(root))) : local;
  const candidates = diff({}, source, id, revision);
  const last = new Map<string, Operation>();
  for (const op of pending) last.set(JSON.stringify(op.path), op);
  for (const op of last.values()) if (!op.after.exists) candidates.push({ ...op, id: id(), baseRevision: revision });
  const conflicts: Conflict[] = candidates.filter(op => !equal(readSlot(remote, op.path, op.action), op.after))
    .map(op => ({ id: op.id, operation: { ...op, requiresReview: true }, remote: readSlot(remote, op.path, op.action), revision, reason: "server-reset" }));
  // Opaque local roots have no protocol operation. Preserve them in the local
  // view and archive; only known roots are submitted when resolving conflicts.
  const document = overlay({ ...local, ...remote }, conflicts.map(c => c.operation));
  return { document, conflicts };
}
