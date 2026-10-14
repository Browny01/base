import { reportSyntaxError } from "./runtime-errors";
import { useSyncExternalStore } from "react";
import {
  DEFAULT,
  migrateAll,
  installLocalSnapshot,
  type BaseData,
} from "@/lib/store";
import {
  diff,
  overlay,
  readSlot,
  writeSlot,
  equal,
  validOperation,
  type Document,
  type SyncResponse,
  type Operation,
} from "@/packages/sync/src/protocol";
import { native, request, documentOf, isTauri, type Workspace } from "./native";
import { prepareBatch } from "@/packages/sync/src/upload";
import { clearSessionSecret } from "@/lib/vault";
import { isRecovery, recoverSnapshot } from "@/packages/sync/src/recovery";
import { importOperations } from "@/packages/sync/src/import";

const normalize = (document: Document) =>
  migrateAll({ ...DEFAULT, ...document } as unknown as BaseData, {
    preserveArchived: true,
  });
let workspace: Workspace | null = null;
let snapshot: BaseData = normalize(documentOf(DEFAULT));
let status = {
  saving: false,
  hasUnsaved: false,
  syncing: false,
  error: "",
  pending: 0,
  conflicts: 0,
  lastSync: 0,
  local: true,
};
let failedEdit: {
  scope: string;
  expectedRevision: number;
  document: Document;
  operations: Operation[];
} | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => {
  for (const listener of listeners) listener();
};
function setStatus(patch: Partial<typeof status>) {
  status = { ...status, ...patch };
  emit();
}
function accept(next: Workspace) {
  workspace = next;
  snapshot = normalize(next.document);
  installLocalSnapshot(snapshot);
  setStatus({
    saving: false,
    pending: next.pending.length,
    conflicts: next.conflicts.length,
    local: !next.origin,
  });
}
// Serialize all SQLite mutations. Network waits do not block local edits.
let tail: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = tail.then(action);
  tail = result.catch(() => {});
  return result;
}
let edits = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let syncing: Promise<void> | null = null;
let requestedAgain = false;
function schedule(delay = 750) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (!workspace?.origin || document.hidden || !navigator.onLine) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void sync();
  }, delay);
}
export async function initialize() {
  accept(
    await native<Workspace>("load_workspace", {
      defaults: documentOf(snapshot),
    }),
  );
  window.addEventListener("online", () => {
    failures = 0;
    schedule(0);
  });
  window.addEventListener("focus", () => {
    failures = 0;
    schedule(0);
  });
  window.addEventListener("offline", () => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;
    setStatus({ error: "Offline. Changes are saved on this device." });
  });
  document.addEventListener("visibilitychange", () => {
    document.documentElement.dataset.inactive = String(document.hidden);
    if (document.hidden) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = null;
    } else schedule(0);
  });
  schedule(0);
}
function mutate(updater: (data: BaseData) => BaseData) {
  void persistEdit(updater).catch(() => {});
}
export function persistEdit(updater: (data: BaseData) => BaseData) {
  const scopeAtStart = workspace?.scope;
  edits++;
  setStatus({ saving: true });
  return serialized(async () => {
    if (!workspace) throw new Error("Local storage has not loaded.");
    if (workspace.scope !== scopeAtStart) throw new Error("The workspace changed before this edit could save. Reopen the original workspace to continue.");
    if (failedEdit)
      throw new Error(
        "Editing is paused. Retry saving or export the unsaved edit before closing Base.",
      );
    const before = documentOf(snapshot);
    const next = documentOf(updater(snapshot));
    // A default board shown by normalization must exist remotely before items
    // can reference it. Include it when the first local edit uses the board.
    if (
      !Array.isArray(workspace.document.boards) ||
      !workspace.document.boards.length
    )
      before.boards = [];
    const ancestor = workspace.origin
      ? overlay(
          overlay(
            workspace.baseline,
            workspace.conflicts.map((c) => c.operation),
          ),
          workspace.pending,
        )
      : workspace.document;
    const operations = diff(
      before,
      next,
      () => crypto.randomUUID(),
      workspace.revision,
    ).map((op) =>
      op.action === "set" ? { ...op, before: readSlot(ancestor, op.path) } : op,
    );
    let saved: Workspace;
    try {
      saved = await native<Workspace>("commit_local", {
        scope: workspace.scope,
        expectedRevision: workspace.localRevision,
        document: next,
        operations,
      });
    } catch (error) {
      failedEdit = {
        scope: workspace.scope,
        expectedRevision: workspace.localRevision,
        document: next,
        operations,
      };
      setStatus({ hasUnsaved: true });
      throw error;
    }
    accept(saved);
    setStatus({ error: "" });
    failures = 0;
    schedule();
  })
    .catch((error) => {
      reportSyntaxError(error, "Saving or synchronizing the local workspace");
      setStatus({
        error: `This edit could not be saved: ${String(error)}. Please retry or export your data.`,
      });
      throw error;
    })
    .finally(() => {
      edits--;
      setStatus({ saving: edits > 0 });
    });
}
export async function sync(): Promise<void> {
  if (syncing) {
    requestedAgain = true;
    return syncing;
  }
  if (!workspace?.origin || failedEdit || !navigator.onLine) return;
  const scopeAtStart = workspace.scope;
  syncing = (async () => {
    await tail;
    const sent = workspace!;
    setStatus({ syncing: true, error: "" });
    const operations = await prepareBatch(
      sent.pending,
      sent.workspaceId,
      async (body) => {
        const response = await request(sent.scope, "/api/native/sync/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok)
          throw new Error(
            `Attachment upload failed (${response.status}); your original is saved locally.`,
          );
      },
    );
    const res = await request(sent.scope, "/api/native/sync", {
      method: "POST",
      body: JSON.stringify({
        protocol: 2,
        workspaceId: sent.workspaceId,
        cursor: sent.revision,
        full: Object.keys(sent.baseline).length === 0,
        operations,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.status === 401)
      throw new Error(
        "Your session expired. Reconnect your account; offline edits are retained.",
      );
    if (!res.ok)
      throw new Error(
        (await res.json()).error ?? `Sync failed (${res.status}).`,
      );
    const response = (await res.json()) as SyncResponse;
    if (
      response.protocol !== 2 ||
      response.workspaceId !== sent.workspaceId ||
      !Array.isArray(response.applied) ||
      !Array.isArray(response.conflicts)
    )
      throw new Error(
        "The server does not support this sync protocol. Deploy the desktop API first.",
      );
    if (response.recovery && !isRecovery(response, sent.revision))
      throw new Error(
        "Invalid recovery response; your local workspace is retained.",
      );
    if (
      !Number.isSafeInteger(response.revision) ||
      response.revision < 0 ||
      (response.revision < sent.revision &&
        !isRecovery(response, sent.revision)) ||
      (response.data !== undefined &&
        (!response.data ||
          typeof response.data !== "object" ||
          Array.isArray(response.data)))
    )
      throw new Error(
        "Invalid server snapshot; no local changes were acknowledged.",
      );
    const sentIds = new Set(operations.map((op) => op.id));
    if (
      [...response.applied, ...response.conflicts.map((c) => c.id)].some(
        (id) => !sentIds.has(id),
      )
    )
      throw new Error(
        "Server acknowledged unknown operations; no local data was changed.",
      );
    if (
      response.conflicts.some(
        (c) =>
          !validOperation(c.operation) ||
          !equal(
            c.operation,
            sent.pending.find((op) => op.id === c.id),
          ),
      )
    )
      throw new Error(
        "The server returned a changed operation; your original edit is still queued.",
      );
    await serialized(async () => {
      if (!workspace || workspace.scope !== sent.scope) return;
      if (isRecovery(response, sent.revision)) {
        const recovered = recoverSnapshot(
          workspace.document,
          [
            ...workspace.pending,
            ...workspace.conflicts.map((c) => c.operation),
          ],
          response.data!,
          response.revision,
          undefined,
          workspace.baseline,
        );
        const document = overlay(
          recovered.document,
          workspace.conflicts.map((c) => c.operation),
        );
        accept(
          await native<Workspace>("apply_sync", {
            scope: workspace.scope,
            expectedRevision: workspace.localRevision,
            response,
            document,
            recoveryConflicts: recovered.conflicts,
          }),
        );
        failures = 0;
        setStatus({
          lastSync: Date.now(),
          error: recovered.conflicts.length
            ? "The service restarted. Your local records are preserved. Review recovery conflicts in Settings → Account & sync."
            : "",
        });
        return;
      }
      const acknowledged = new Set([
        ...response.applied,
        ...response.conflicts.map((c) => c.id),
      ]);
      const pending = workspace.pending.filter(
        (op) => !acknowledged.has(op.id),
      );
      const remote = response.data ?? workspace.baseline;
      response.conflicts = response.conflicts.map((conflict) => {
        const path = conflict.operation.path;
        if (
          typeof path[1] !== "string" &&
          path[1] &&
          !readSlot(remote, path.slice(0, 2)).exists
        ) {
          return {
            ...conflict,
            localRecord: readSlot(workspace!.document, path.slice(0, 2)),
          };
        }
        return conflict;
      });
      const conflictMap = new Map(
        [...workspace.conflicts, ...response.conflicts].map((c) => [c.id, c]),
      );
      // Both conflicting values remain archived. Project local choices onto
      // the view until the user resolves them, then replay unsent edits.
      const document = overlay(
        overlay(
          remote,
          [...conflictMap.values()].map((c) => c.operation),
        ),
        pending,
      );
      const saved = await native<Workspace>("apply_sync", {
        scope: workspace.scope,
        expectedRevision: workspace.localRevision,
        response,
        document,
      });
      accept(saved);
      failures = 0;
      setStatus({ lastSync: Date.now() });
    });
  })()
    .catch((error) => {
      reportSyntaxError(error, "Saving or synchronizing the local workspace");
      if (workspace?.scope !== scopeAtStart) {
        requestedAgain = true;
        return;
      }
      failures++;
      setStatus({ error: String(error) });
      // Bounded retries; an event/manual retry restarts after five failures.
      if (failures <= 5) schedule(Math.min(60_000, 1000 * 2 ** failures));
    })
    .finally(() => {
      syncing = null;
      setStatus({ syncing: false });
      const rerun = requestedAgain;
      requestedAgain = false;
      if (rerun || (!status.error && workspace?.pending.length)) schedule(0);
    });
  return syncing;
}
export async function connect(origin: string, password: string) {
  window.dispatchEvent(new Event("base:flush-editors"));
  return serialized(async () => {
    flushLocalWritesBeforeSwitch();
    const next = await native<Workspace>("connect_account", {
      origin,
      password,
      defaults: documentOf(normalize(documentOf(DEFAULT))),
    });
    clearSessionSecret();
    accept(next);
    failures = 0;
    setStatus({ error: "" });
    schedule(0);
  });
}
export async function connectHosted() {
  return connectNative("connect_hosted_workspace");
}
export async function completeCloudSignIn() {
  return connectNative("cloud_sign_in_finish");
}
async function connectNative(command: string) {
  window.dispatchEvent(new Event("base:flush-editors"));
  return serialized(async () => {
    flushLocalWritesBeforeSwitch();
    const next = await native<Workspace>(command, {
      defaults: documentOf(normalize(documentOf(DEFAULT))),
    });
    clearSessionSecret();
    accept(next);
    failures = 0;
    setStatus({ error: "" });
    schedule(0);
  });
}
export async function disconnect() {
  window.dispatchEvent(new Event("base:flush-editors"));
  return serialized(async () => {
    flushLocalWritesBeforeSwitch();
    accept(
      await native<Workspace>("disconnect_account", {
        defaults: documentOf(normalize(documentOf(DEFAULT))),
      }),
    );
    clearSessionSecret();
    setStatus({ error: "" });
  });
}
export function currentWorkspace() {
  return workspace;
}
export async function resolve(id: string, choice: "local" | "server") {
  return serialized(async () => {
    if (!workspace) return;
    const conflict = workspace.conflicts.find((c) => c.id === id);
    if (!conflict) return;
    let op = {
      ...conflict.operation,
      requiresReview: false,
      id: crypto.randomUUID(),
      baseRevision: workspace.revision,
      before: readSlot(
        workspace.baseline,
        conflict.operation.path,
        conflict.operation.action,
      ),
    };
    if (choice === "local" && conflict.localRecord?.exists) {
      op = {
        ...op,
        path: op.path.slice(0, 2),
        action: "set",
        before: readSlot(workspace.baseline, op.path.slice(0, 2)),
        after: conflict.localRecord,
      };
    }
    if (
      op.before.exists &&
      op.after.exists &&
      typeof op.before.value === "object" &&
      op.before.value !== null &&
      !Array.isArray(op.before.value) &&
      typeof op.after.value === "object" &&
      op.after.value !== null &&
      !Array.isArray(op.after.value)
    ) {
      op = {
        ...op,
        after: {
          exists: true,
          value: { ...op.before.value, ...op.after.value },
        },
      };
    }
    const operations = choice === "local" ? [op] : [];
    const remaining = workspace.conflicts.filter((c) => c.id !== id);
    const resolved =
      choice === "local"
        ? writeSlot(workspace.baseline, op)
        : workspace.baseline;
    if (!resolved)
      throw new Error(
        "The parent record was deleted. Export the local value and restore the full record to keep this edit.",
      );
    const document = overlay(
      overlay(
        resolved,
        remaining.map((c) => c.operation),
      ),
      workspace.pending,
    );
    accept(
      await native<Workspace>("resolve_conflict", {
        scope: workspace.scope,
        expectedRevision: workspace.localRevision,
        id,
        document,
        operations,
      }),
    );
    schedule(0);
  });
}
export function useBase() {
  const data = useSyncExternalStore(subscribe, () => snapshot);
  return {
    data,
    mutate,
    loaded: workspace !== null,
    syncStatus: null as
      import("@/packages/sync/src/protocol").BrowserSyncStatus | null,
  };
}
export function useDesktopStatus() {
  return useSyncExternalStore(subscribe, () => status);
}
export function useWorkspaceScope() {
  return useSyncExternalStore(subscribe, () => workspace?.scope ?? "");
}
export function useUnsaved() {
  return useSyncExternalStore(subscribe, () => status.hasUnsaved);
}
export function unsavedCopy() {
  return failedEdit;
}
export async function flushLocalWrites() {
  window.dispatchEvent(new Event("base:flush-editors"));
  await tail;
  if (failedEdit)
    throw new Error(
      "An edit is still unsaved. Retry saving or export its full copy before closing Base.",
    );
}
export async function retrySave() {
  return serialized(async () => {
    if (!failedEdit) return;
    const saved = await native<Workspace>("commit_local", failedEdit);
    failedEdit = null;
    accept(saved);
    setStatus({ hasUnsaved: false, error: "" });
    schedule(0);
  });
}
export async function importBackup() {
  window.dispatchEvent(new Event("base:flush-editors"));
  const copyToAccount = await serialized(async () => {
    await flushLocalWritesBeforeSwitch();
    const next = await native<Workspace | null>("import_workspace", isTauri() ? {} : { keepActive: true });
    if (next) {
      if (!isTauri()) return true;
      clearSessionSecret();
      accept(next);
      setStatus({ error: "" });
    }
    return false;
  });
  if (copyToAccount) await transferOffline();
}
function flushLocalWritesBeforeSwitch() {
  if (failedEdit)
    throw new Error(
      "Save or export your unsaved edit before switching workspaces.",
    );
}
export async function selectOffline(scope: string) {
  window.dispatchEvent(new Event("base:flush-editors"));
  return serialized(async () => {
    flushLocalWritesBeforeSwitch();
    // Switching away from a cloud account keeps its scoped queue and session;
    // the UI cannot access another cloud cache through this command.
    accept(await native<Workspace>("activate_offline_workspace", { scope }));
    clearSessionSecret();
    setStatus({ error: "" });
  });
}
export async function transferOffline() {
  return serialized(async () => {
    flushLocalWritesBeforeSwitch();
    if (!workspace?.origin)
      throw new Error("Connect the destination account first.");
    const source = await native<{
      workspace: Workspace;
      source?: Record<string, unknown>;
    }>("read_offline_source");
    const imported = (source.source?.workspace ??
      source.source?.saved ??
      source.source) as { pending?: unknown[] } | undefined;
    const operations = importOperations(
      source.workspace.document,
      documentOf(DEFAULT),
      { pending: [...(imported?.pending ?? []), ...source.workspace.pending] },
    );
    const document = overlay(workspace.document, operations);
    accept(
      await native<Workspace>("commit_local", {
        scope: workspace.scope,
        expectedRevision: workspace.localRevision,
        document,
        operations,
      }),
    );
    schedule(0);
  });
}

export const browserSaving = () => status.saving || status.hasUnsaved;
