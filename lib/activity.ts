"use client";

import { useSyncExternalStore } from "react";

const subscribers = new Set<() => void>();
const active = () => document.visibilityState === "visible" && document.hasFocus();
const notify = () => { for (const listener of subscribers) listener(); };
function subscribe(listener: () => void) {
  if (!subscribers.size) {
    document.addEventListener("visibilitychange", notify);
    window.addEventListener("focus", notify);
    window.addEventListener("blur", notify);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) {
      document.removeEventListener("visibilitychange", notify);
      window.removeEventListener("focus", notify);
      window.removeEventListener("blur", notify);
    }
  };
}
export function useAppActive() { return useSyncExternalStore(subscribe, active, () => true); }
