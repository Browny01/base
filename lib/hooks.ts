"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getData, updateData, DEFAULT, type NexusData } from "./store";

const SYNC_DELAY_MS = 2500;

async function serverGet(): Promise<NexusData | null> {
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as NexusData;
  } catch {
    return null;
  }
}

async function serverSet(data: NexusData): Promise<void> {
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

export function useNexus() {
  const [data, setData] = useState<NexusData>(DEFAULT);
  const [loaded, setLoaded] = useState(false);   // true once Redis hydration has settled
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      const local = getData();
      setData(local);

      const remote = await serverGet();

      if (remote) {
        const localTime = local.updatedAt ?? 0;
        const serverTime = remote.updatedAt ?? 0;

        if (serverTime >= localTime) {
          // Server data is newer (or same age) — use it
          const merged = { ...DEFAULT, ...remote };
          updateData(() => merged);
          setData(merged);
        } else {
          // Local data is newer — push it to server so other devices get it
          serverSet(local);
        }
      } else {
        // No server data yet — push local data up
        serverSet(local);
      }
      setLoaded(true);   // hydration settled — safe for consumers to mutate
    }

    init();

    const sync = () => setData(getData());
    window.addEventListener("nexus_update", sync);
    return () => window.removeEventListener("nexus_update", sync);
  }, []);

  const mutate = useCallback((updater: (d: NexusData) => NexusData) => {
    const next = updateData((d) => ({ ...updater(d), updatedAt: Date.now() }));
    setData(next);

    // Push the LATEST local state when the timer fires (not this stale snapshot),
    // so a mutation made before hydration can't clobber freshly-loaded server data.
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => serverSet(getData()), SYNC_DELAY_MS);
  }, []);

  return { data, mutate, loaded };
}
