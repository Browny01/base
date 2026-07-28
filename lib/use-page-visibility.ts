"use client";

import { useSyncExternalStore } from "react";
import { getData } from "@/lib/store";

const SERVER_SNAPSHOT: string[] = [];
let cachedKey = "";
let cachedPages: string[] = SERVER_SNAPSHOT;

function snapshot(): string[] {
  const hiddenPages = getData().hiddenPages ?? [];
  const key = hiddenPages.join("\u0000");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedPages = hiddenPages;
  }
  return cachedPages;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("bridge_update", onStoreChange);
  return () => window.removeEventListener("bridge_update", onStoreChange);
}

export function useHiddenPages(): string[] {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
}
