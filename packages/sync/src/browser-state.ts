import {
  validOperation,
  type Document,
  type Operation,
  type Conflict,
  type SyncResponse,
} from "./protocol.ts";
export type BrowserWorkspace = {
  scope: string;
  origin: string;
  workspaceId: string;
  document: Document;
  baseline: Document;
  revision: number;
  localRevision: number;
  pending: Operation[];
  conflicts: Conflict[];
};
export type BrowserState = {
  activeScope: string;
  deviceId: string;
  workspaces: Record<string, BrowserWorkspace>;
  archives: Record<string, unknown>;
  notes: Record<string, { salt: string; hash: string }>;
  access?: { workspaceId: string; expiresAt: number };
  offlineSource?: string;
};
export function newBrowserState(): BrowserState {
  return {
    activeScope: "local",
    deviceId: "browser-" + crypto.randomUUID(),
    workspaces: {},
    archives: {},
    notes: {},
  };
}
export function canUseBrowserOffline(workspace: BrowserWorkspace | undefined, access: BrowserState["access"], at = Date.now()): boolean {
  return !!workspace?.origin && workspace.workspaceId.startsWith("base_cloud_") && access?.workspaceId === workspace.workspaceId && Number.isFinite(access.expiresAt) && access.expiresAt > at;
}
export function newBrowserWorkspace(
  scope: string,
  origin: string,
  workspaceId: string,
  defaults: Document,
): BrowserWorkspace {
  return {
    scope,
    origin,
    workspaceId,
    document: structuredClone(defaults),
    baseline: {},
    revision: 0,
    localRevision: 0,
    pending: [],
    conflicts: [],
  };
}
export function changeBrowserWorkspace(
  state: BrowserState,
  command: string,
  args: Record<string, unknown>,
) {
  const scope = String(args.scope),
    current = state.workspaces[scope];
  if (
    !current ||
    state.activeScope !== scope ||
    current.localRevision !== args.expectedRevision
  )
    throw new Error(
      "This workspace changed in another tab. Your edit is retained; export it before reloading.",
    );
  const next = structuredClone(current),
    operations = (args.operations ?? []) as Operation[];
  if (operations.some((op) => !validOperation(op)))
    throw new Error("Invalid local operation");
  if (
    !args.document ||
    typeof args.document !== "object" ||
    Array.isArray(args.document)
  )
    throw new Error("Invalid local document");
  if (command === "commit_local") {
    next.document = args.document as Document;
    if (next.origin) next.pending.push(...operations);
  } else if (command === "resolve_conflict") {
    const conflict = next.conflicts.find((c) => c.id === args.id);
    if (!conflict) throw new Error("Conflict already resolved");
    state.archives["resolved:" + scope + ":" + conflict.id] = conflict;
    next.conflicts = next.conflicts.filter((c) => c.id !== args.id);
    next.pending.push(...operations);
    next.document = args.document as Document;
  } else if (command === "apply_sync") {
    const response = args.response as SyncResponse;
    if (response.workspaceId !== next.workspaceId)
      throw new Error("Workspace mismatch");
    if (response.recovery) {
      if (
        response.recovery.reason !== "server-reset" ||
        response.recovery.previousRevision !== next.revision ||
        response.revision >= next.revision ||
        response.applied.length ||
        response.conflicts.length ||
        !response.data
      )
        throw new Error("Invalid recovery");
      state.archives["recovery:" + scope + ":" + next.localRevision] =
        structuredClone(current);
      next.pending = [];
      next.conflicts.push(...((args.recoveryConflicts as Conflict[]) ?? []));
    } else {
      if (response.revision < next.revision)
        throw new Error("Stale server revision");
      const sent = new Set(next.pending.map((op) => op.id));
      if (
        [...response.applied, ...response.conflicts.map((c) => c.id)].some(
          (id) => !sent.has(id),
        )
      )
        throw new Error("Unknown acknowledgement");
      const acknowledged = new Set([
        ...response.applied,
        ...response.conflicts.map((c) => c.id),
      ]);
      next.pending = next.pending.filter((op) => !acknowledged.has(op.id));
      next.conflicts = [
        ...new Map(
          [...next.conflicts, ...response.conflicts].map((c) => [c.id, c]),
        ).values(),
      ];
    }
    next.document = args.document as Document;
    next.baseline = response.data ?? next.baseline;
    next.revision = response.revision;
  } else throw new Error("Unsupported local write");
  next.localRevision++;
  state.workspaces[scope] = next;
  return structuredClone(next);
}
