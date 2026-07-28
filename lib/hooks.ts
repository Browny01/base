"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT, getData, replaceData, type BridgeData } from "@/lib/store";
import { offlineDb } from "@/lib/offline-db";
import {
  CONFLICT_SENSITIVE_COLLECTIONS,
  RECORD_COLLECTIONS,
  ROOT_COLLECTION,
  ROOT_FIELDS,
  SYNC_PROTOCOL_VERSION,
  recordRevisionKey,
  type SyncChange,
  type SyncConflict,
  type SyncEnvelope,
  type SyncOperation,
} from "@/lib/sync-contract";

export type BridgeSyncState = "offline" | "syncing" | "synced" | "error";

interface BridgeSnapshot {
  data: BridgeData;
  loaded: boolean;
  syncState: BridgeSyncState;
  lastSync: number | null;
  pendingCount: number;
  conflicts: SyncConflict[];
  syncError: string | null;
}

const SERVER_SNAPSHOT: BridgeSnapshot = {
  data: DEFAULT,
  loaded: false,
  syncState: "offline",
  lastSync: null,
  pendingCount: 0,
  conflicts: [],
  syncError: null,
};

let snapshot: BridgeSnapshot = SERVER_SNAPSHOT;
let initialized = false;
let initialization: Promise<void> | null = null;
let syncing = false;
let outbox: SyncOperation[] = [];
let recordRevisions: Record<string, number> = {};
let cursor = -1;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const now = () => Date.now();
const operationId = () => crypto.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}-${Date.now()}`;

function getDeviceId(): string {
  const key = "bridge_device_id";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = operationId();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return "bridge-web";
  }
}

function emit(next: Partial<BridgeSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function persistSnapshot(data: BridgeData) {
  const normalized = replaceData(data);
  void offlineDb.saveSnapshot(normalized);
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function patchBetween(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete("id");
  keys.forEach((key) => {
    if (!jsonEqual(previous[key], next[key])) {
      patch[key] = key in next ? next[key] : null;
    }
  });
  return patch;
}

function deriveOperations(previous: BridgeData, next: BridgeData): SyncOperation[] {
  const deviceId = getDeviceId();
  const clientUpdatedAt = now();
  const operations: SyncOperation[] = [];
  const previousData = previous as unknown as Record<string, unknown>;
  const nextData = next as unknown as Record<string, unknown>;

  for (const collection of RECORD_COLLECTIONS) {
    const before = Array.isArray(previousData[collection]) ? previousData[collection] as unknown[] : [];
    const after = Array.isArray(nextData[collection]) ? nextData[collection] as unknown[] : [];
    const beforeById = new Map(before.map(asRecord).filter((item): item is Record<string, unknown> => !!item && typeof item.id === "string").map((item) => [item.id as string, item]));
    const afterById = new Map(after.map(asRecord).filter((item): item is Record<string, unknown> => !!item && typeof item.id === "string").map((item) => [item.id as string, item]));

    beforeById.forEach((_value, id) => {
      if (afterById.has(id)) return;
      operations.push({
        id: operationId(), deviceId, collection, action: "delete", recordId: id,
        baseRevision: recordRevisions[recordRevisionKey(collection, id)] ?? 0,
        clientUpdatedAt,
      });
    });

    afterById.forEach((value, id) => {
      const old = beforeById.get(id);
      if (old && jsonEqual(old, value)) return;
      const sensitive = CONFLICT_SENSITIVE_COLLECTIONS.has(collection);
      operations.push({
        id: operationId(),
        deviceId,
        collection,
        action: !old || sensitive ? "upsert" : "patch",
        recordId: id,
        value: !old || sensitive ? value : patchBetween(old, value),
        baseRevision: recordRevisions[recordRevisionKey(collection, id)] ?? 0,
        clientUpdatedAt,
      });
    });
  }

  for (const field of ROOT_FIELDS) {
    if (jsonEqual(previousData[field], nextData[field])) continue;
    operations.push({
      id: operationId(),
      deviceId,
      collection: ROOT_COLLECTION,
      action: "set",
      recordId: field,
      value: nextData[field] ?? null,
      baseRevision: recordRevisions[recordRevisionKey(ROOT_COLLECTION, field)] ?? 0,
      clientUpdatedAt,
    });
  }

  return operations;
}

function operationKey(operation: SyncOperation) {
  return recordRevisionKey(operation.collection, operation.recordId);
}

function enqueue(operations: SyncOperation[]) {
  if (operations.length === 0) return;
  const removedIds: string[] = [];
  for (const operation of operations) {
    const key = operationKey(operation);
    // Coalesce edits that have not started uploading. This keeps typing in a
    // note or dragging a board item from producing hundreds of network writes.
    outbox = outbox.filter((queued) => {
      const keep = inFlight.has(queued.id) || operationKey(queued) !== key;
      if (!keep) removedIds.push(queued.id);
      return keep;
    });
    outbox.push(operation);
  }
  void offlineDb.deleteOperations(removedIds);
  void offlineDb.putOperations(outbox);
}

function applyOperation(data: BridgeData, operation: SyncOperation): BridgeData {
  const target = { ...data } as unknown as Record<string, unknown>;
  if (operation.collection === ROOT_COLLECTION) {
    if (operation.action === "set") target[operation.recordId] = operation.value;
    return target as unknown as BridgeData;
  }

  const records = Array.isArray(target[operation.collection])
    ? [...target[operation.collection] as unknown[]]
    : [];
  const index = records.findIndex((record) => asRecord(record)?.id === operation.recordId);
  if (operation.action === "delete") {
    if (index >= 0) records.splice(index, 1);
  } else if (operation.action === "patch") {
    const current = index >= 0 ? asRecord(records[index]) ?? { id: operation.recordId } : { id: operation.recordId };
    const patched = { ...current, ...(asRecord(operation.value) ?? {}), id: operation.recordId };
    if (index >= 0) records[index] = patched; else records.push(patched);
  } else if (operation.action === "upsert") {
    const value = asRecord(operation.value);
    if (value) {
      if (index >= 0) records[index] = value; else records.push(value);
    }
  }
  target[operation.collection] = records;
  return target as unknown as BridgeData;
}

function applyChanges(data: BridgeData, changes: SyncChange[]) {
  return changes.reduce((current, change) => applyOperation(current, change.operation), data);
}

function applyLocalOverlay(data: BridgeData) {
  const overlay = [...outbox, ...snapshot.conflicts.map((conflict) => conflict.operation)];
  return overlay.reduce((current, operation) => applyOperation(current, operation), data);
}

function scheduleSync(delay = 900) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncBridge();
  }, delay);
}

async function initializeBridge() {
  if (initialized) return;
  if (initialization) return initialization;
  initialization = (async () => {
    // The synchronous hot cache is deliberately published before any await.
    // Dashboard rendering therefore never waits for Vercel or IndexedDB.
    const hot = getData();
    emit({
      data: hot,
      loaded: true,
      syncState: typeof navigator !== "undefined" && navigator.onLine ? "syncing" : "offline",
    });

    const [durable, storedOutbox, storedConflicts, storedCursor, storedRevisions, storedLastSync] = await Promise.all([
      offlineDb.loadSnapshot(),
      offlineDb.loadOutbox(),
      offlineDb.loadConflicts(),
      offlineDb.getMeta("cursor", -1),
      offlineDb.getMeta("recordRevisions", {} as Record<string, number>),
      offlineDb.getMeta("lastSync", 0),
    ]);

    outbox = storedOutbox;
    recordRevisions = storedRevisions;
    cursor = storedCursor;
    const durableIsNewer = (durable?.updatedAt ?? 0) > (hot.updatedAt ?? 0);
    const data = durableIsNewer && durable ? persistSnapshot(durable) : hot;
    if (!durable) void offlineDb.saveSnapshot(hot);
    emit({
      data,
      pendingCount: outbox.length,
      conflicts: storedConflicts,
      lastSync: storedLastSync || null,
    });

    const online = () => {
      emit({ syncState: "syncing", syncError: null });
      void syncBridge();
    };
    const offline = () => emit({ syncState: "offline", syncError: null });
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", online);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) online();
    });
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "BRIDGE_SYNC_NOW") online();
    });
    window.setInterval(() => {
      if (navigator.onLine) void syncBridge();
    }, 60 * 60 * 1_000);

    initialized = true;
    if (navigator.onLine) await syncBridge();
  })().finally(() => {
    initialization = null;
  });
  return initialization;
}

export async function syncBridge() {
  if (typeof window === "undefined") return;
  if (!initialized && !initialization) {
    await initializeBridge();
    return;
  }
  if (syncing) return;
  if (!navigator.onLine) {
    emit({ syncState: "offline" });
    return;
  }

  syncing = true;
  emit({ syncState: "syncing", syncError: null, pendingCount: outbox.length });
  const sent = outbox.slice(0, 200);
  sent.forEach((operation) => inFlight.add(operation.id));

  try {
    const response = await fetch(
      sent.length ? "/api/native/sync" : `/api/native/sync?cursor=${cursor}`,
      sent.length
        ? {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ protocol: SYNC_PROTOCOL_VERSION, cursor, operations: sent }),
          }
        : { cache: "no-store", credentials: "same-origin" },
    );
    const envelope = await response.json() as SyncEnvelope;
    if (!response.ok || envelope.configured === false) {
      throw new Error(envelope.error || `Sync failed (${response.status})`);
    }

    const applied = new Set(envelope.applied ?? []);
    const conflicts = envelope.conflicts ?? [];
    const conflicted = new Set(conflicts.map((conflict) => conflict.operation.id));
    const removed = sent.filter((operation) => applied.has(operation.id) || conflicted.has(operation.id)).map((operation) => operation.id);
    outbox = outbox.filter((operation) => !removed.includes(operation.id));
    await offlineDb.deleteOperations(removed);

    if (conflicts.length) {
      const existing = new Set(snapshot.conflicts.map((conflict) => conflict.id));
      const fresh = conflicts.filter((conflict) => !existing.has(conflict.id));
      await offlineDb.putConflicts(fresh);
      emit({ conflicts: [...snapshot.conflicts, ...fresh] });
    }

    recordRevisions = envelope.full && envelope.recordRevisions
      ? envelope.recordRevisions
      : { ...recordRevisions, ...(envelope.recordRevisions ?? {}) };
    for (const change of envelope.changes ?? []) {
      recordRevisions[operationKey(change.operation)] = change.revision;
    }

    // Rebase edits made while this request was in flight onto the newly
    // acknowledged server revision.
    outbox = outbox.map((operation) => ({
      ...operation,
      baseRevision: recordRevisions[operationKey(operation)] ?? operation.baseRevision,
    }));
    await offlineDb.putOperations(outbox);

    let remote = envelope.full && envelope.data
      ? { ...DEFAULT, ...envelope.data } as BridgeData
      : applyChanges(snapshot.data, envelope.changes ?? []);
    remote = applyLocalOverlay(remote);
    remote.updatedAt = Math.max(remote.updatedAt ?? 0, envelope.updatedAt ?? 0);
    const data = persistSnapshot(remote);
    cursor = Math.max(cursor, envelope.revision ?? cursor);
    const lastSync = now();
    await Promise.all([
      offlineDb.setMeta("cursor", cursor),
      offlineDb.setMeta("recordRevisions", recordRevisions),
      offlineDb.setMeta("lastSync", lastSync),
    ]);
    emit({
      data,
      syncState: "synced",
      lastSync,
      pendingCount: outbox.length,
      syncError: null,
    });
  } catch (error) {
    emit({
      syncState: navigator.onLine ? "error" : "offline",
      syncError: error instanceof Error ? error.message : "Bridge could not sync.",
      pendingCount: outbox.length,
    });
  } finally {
    sent.forEach((operation) => inFlight.delete(operation.id));
    syncing = false;
    if (outbox.length > 0 && navigator.onLine) scheduleSync(2_000);
  }
}

function mutateBridge(updater: (data: BridgeData) => BridgeData) {
  const previous = snapshot.loaded ? snapshot.data : getData();
  const next = { ...updater(previous), updatedAt: now() };
  const operations = deriveOperations(previous, next);
  enqueue(operations);
  const data = persistSnapshot(next);
  emit({
    data,
    loaded: true,
    pendingCount: outbox.length,
    syncState: navigator.onLine ? snapshot.syncState : "offline",
  });
  scheduleSync();
  return data;
}

export async function resolveSyncConflict(id: string, resolution: "local" | "cloud") {
  const conflict = snapshot.conflicts.find((item) => item.id === id);
  if (!conflict) return;
  const remaining = snapshot.conflicts.filter((item) => item.id !== id);
  await offlineDb.deleteConflict(id);
  emit({ conflicts: remaining });

  if (resolution === "local") {
    const operation: SyncOperation = {
      ...conflict.operation,
      id: operationId(),
      baseRevision: conflict.serverRevision,
      clientUpdatedAt: now(),
    };
    enqueue([operation]);
    const data = persistSnapshot(applyOperation(snapshot.data, operation));
    emit({ data, pendingCount: outbox.length });
  } else if (conflict.serverValue !== undefined) {
    const cloudOperation: SyncOperation = {
      ...conflict.operation,
      action: conflict.operation.collection === ROOT_COLLECTION ? "set" : "upsert",
      value: conflict.serverValue,
      baseRevision: conflict.serverRevision,
    };
    const data = persistSnapshot(applyOperation(snapshot.data, cloudOperation));
    emit({ data });
  }
  scheduleSync(0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBridge() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    void initializeBridge();
  }, []);
  const mutate = useCallback((updater: (data: BridgeData) => BridgeData) => mutateBridge(updater), []);
  const syncNow = useCallback(() => syncBridge(), []);
  return { ...current, mutate, syncNow };
}
