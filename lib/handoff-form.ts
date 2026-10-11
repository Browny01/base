"use client";
import { useState, useSyncExternalStore } from "react";
import { readBaseKey, consumeHandoff } from "./base-storage";
function subscribe(listener: () => void) {
  window.addEventListener("base:handoff",listener);window.addEventListener("storage",listener);
  return () => { window.removeEventListener("base:handoff",listener);window.removeEventListener("storage",listener); };
}
/** A handoff is an external store, including when already on the target page. */
export function useHandoffForm(name: string, legacy: readonly string[]) {
  const incoming = useSyncExternalStore(subscribe,() => [name,...legacy].some(key => readBaseKey(key) !== null),() => false);
  const [opened,setOpened] = useState(false);
  const setOpen = (value: boolean) => { if (!value) consumeHandoff(name,legacy);setOpened(value); };
  return [opened || incoming,setOpen] as const;
}
