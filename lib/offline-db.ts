"use client";

import type { BridgeData } from "@/lib/store";
import type { SyncConflict, SyncOperation } from "@/lib/sync-contract";

const DB_NAME = "bridge-offline";
const DB_VERSION = 1;
const STATE = "state";
const OUTBOX = "outbox";
const CONFLICTS = "conflicts";
const META = "meta";

type MetaValue = string | number | boolean | Record<string, number> | null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CONFLICTS)) db.createObjectStore(CONFLICTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, finish: (value: T) => void) => void,
  fallback: T,
): Promise<T> {
  const db = await openDatabase();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const transaction = db.transaction(storeName, mode);
      operation(transaction.objectStore(storeName), finish);
      transaction.onabort = () => finish(fallback);
      transaction.onerror = () => finish(fallback);
    } catch {
      finish(fallback);
    }
  }).finally(() => db.close());
}

export const offlineDb = {
  loadSnapshot: () =>
    run<BridgeData | null>(STATE, "readonly", (store, finish) => {
      const request = store.get("current");
      request.onsuccess = () => finish((request.result as BridgeData | undefined) ?? null);
      request.onerror = () => finish(null);
    }, null),

  saveSnapshot: (data: BridgeData) =>
    run<boolean>(STATE, "readwrite", (store, finish) => {
      const request = store.put(data, "current");
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
    }, false),

  loadOutbox: () =>
    run<SyncOperation[]>(OUTBOX, "readonly", (store, finish) => {
      const request = store.getAll();
      request.onsuccess = () => finish((request.result as SyncOperation[]) ?? []);
      request.onerror = () => finish([]);
    }, []),

  putOperations: async (operations: SyncOperation[]) => {
    if (operations.length === 0) return true;
    const db = await openDatabase();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(OUTBOX, "readwrite");
        const store = transaction.objectStore(OUTBOX);
        operations.forEach((operation) => store.put(operation));
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => resolve(false);
        transaction.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    }).finally(() => db.close());
  },

  deleteOperations: async (ids: string[]) => {
    if (ids.length === 0) return true;
    const db = await openDatabase();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(OUTBOX, "readwrite");
        const store = transaction.objectStore(OUTBOX);
        ids.forEach((id) => store.delete(id));
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => resolve(false);
        transaction.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    }).finally(() => db.close());
  },

  loadConflicts: () =>
    run<SyncConflict[]>(CONFLICTS, "readonly", (store, finish) => {
      const request = store.getAll();
      request.onsuccess = () => finish((request.result as SyncConflict[]) ?? []);
      request.onerror = () => finish([]);
    }, []),

  putConflicts: async (conflicts: SyncConflict[]) => {
    if (conflicts.length === 0) return true;
    const db = await openDatabase();
    if (!db) return false;
    return new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(CONFLICTS, "readwrite");
        const store = transaction.objectStore(CONFLICTS);
        conflicts.forEach((conflict) => store.put(conflict));
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => resolve(false);
        transaction.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    }).finally(() => db.close());
  },

  deleteConflict: (id: string) =>
    run<boolean>(CONFLICTS, "readwrite", (store, finish) => {
      const request = store.delete(id);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
    }, false),

  getMeta: <T extends MetaValue>(key: string, fallback: T) =>
    run<T>(META, "readonly", (store, finish) => {
      const request = store.get(key);
      request.onsuccess = () => finish((request.result as T | undefined) ?? fallback);
      request.onerror = () => finish(fallback);
    }, fallback),

  setMeta: (key: string, value: MetaValue) =>
    run<boolean>(META, "readwrite", (store, finish) => {
      const request = store.put(value, key);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
    }, false),
};
