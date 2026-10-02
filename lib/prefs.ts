"use client";

// View preferences (density, sort, layout toggles) are not synced data, so they
// live in localStorage instead of bloating the shared payload. Reading them
// through useSyncExternalStore keeps the server snapshot and the first client
// render in agreement, which reading localStorage into useState would not.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
  emit();
}

export function useStoredPref(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key) ?? fallback,
    () => fallback,
  );
}