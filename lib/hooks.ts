"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getData, updateData, migrateAll, DEFAULT, type BaseData } from "./store";

const SYNC_DELAY_MS = 2500;

async function serverGet(): Promise<BaseData | null> {
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as BaseData;
  } catch {
    return null;
  }
}

async function serverSet(data: BaseData): Promise<void> {
  try {
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // silently fail — local data is always saved
  }
}

// ── One store shared by every useBase() consumer ─────────────────────────────
//
// useBase() used to own per-component state: each of the six consumers
// mounted app-wide (Sidebar, CommandBar, Dock, BottomNav, KeyboardShortcuts and
// the page itself) ran its own hydration — its own getData() and its own
// fetch of the entire dataset — and then registered its own base_update
// listener. Every mutation therefore woke all six, each re-reading the whole
// record, and each kept its own debounce timer that could POST the full
// dataset again. Sharing one snapshot removes that N-fold work.
let snapshot: BaseData = DEFAULT;
let hydrated = false;
let hydration: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSnapshot(next: BaseData) {
  if (next === snapshot) return;
  snapshot = next;
  emit();
}

// Keep local listeners in step with writes made by any part of the app.
if (typeof window !== "undefined") {
  window.addEventListener("base_update", () => setSnapshot(getData()));
}

function hydrate() {
  if (hydration) return hydration;
  hydration = (async () => {
    const local = getData();
    setSnapshot(local);

    const remote = await serverGet();

    if (remote) {
      const localTime = local.updatedAt ?? 0;
      const serverTime = remote.updatedAt ?? 0;

      if (serverTime >= localTime) {
        // Server data is newer (or same age) — use it. migrateAll() is required:
        // a server record may still be legacy-shaped, and updateData() writes
        // straight through the store cache, so it will not be normalised later.
        const merged = migrateAll({ ...DEFAULT, ...remote });
        updateData(() => merged);
        setSnapshot(merged);
      } else {
        // Local data is newer — push it to server so other devices get it
        serverSet(local);
      }
    } else {
      // No server data yet — push local data up
      serverSet(local);
    }

    hydrated = true;
    emit();
  })();
  return hydration;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  void hydrate();
  return () => {
    listeners.delete(fn);
  };
}

const getServerData = () => DEFAULT;
const getServerLoaded = () => false;

export function useBase() {
  const data = useSyncExternalStore(subscribe, getSnapshotOfData, getServerData);
  const loaded = useSyncExternalStore(subscribe, getLoaded, getServerLoaded);

  const mutate = useCallback((updater: (d: BaseData) => BaseData) => {
    const next = updateData((d) => ({ ...updater(d), updatedAt: Date.now() }));
    setSnapshot(next);

    // Push the LATEST local state when the timer fires (not this stale snapshot),
    // so a mutation made before hydration can't clobber freshly-loaded server data.
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => serverSet(getData()), SYNC_DELAY_MS);
  }, []);

  return { data, mutate, loaded };
}

// Module-level getters keep their identity stable, which useSyncExternalStore
// requires of its subscribe/getSnapshot pair.
function getSnapshotOfData() {
  return snapshot;
}
function getLoaded() {
  return hydrated;
}