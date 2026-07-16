"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type NavMode = "sidebar" | "dock";

// Layout visibility is driven by the `data-nav` attribute on <html> (set pre-paint,
// see app/layout.tsx) + CSS, so switching modes never causes a flash. This context
// only mirrors the value for the Settings toggle and updates it on change.
const Ctx = createContext<{ mode: NavMode; setMode: (m: NavMode) => void }>({ mode: "sidebar", setMode: () => {} });

export function NavModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<NavMode>("sidebar");

  // Read from localStorage and RE-APPLY data-nav on <html> — React hydration drops
  // the attribute the pre-paint script set, so we must put it back after mount.
  useEffect(() => {
    let m: NavMode = "sidebar";
    try { m = localStorage.getItem("bridge_nav_mode") === "dock" ? "dock" : "sidebar"; } catch {}
    setModeState(m);
    document.documentElement.dataset.nav = m;
  }, []);

  const setMode = (m: NavMode) => {
    setModeState(m);
    try {
      localStorage.setItem("bridge_nav_mode", m);
      document.documentElement.dataset.nav = m;
    } catch {}
  };

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useNavMode = () => useContext(Ctx);
