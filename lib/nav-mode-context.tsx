"use client";

import { useStoredPref, writeStored } from "./prefs";
import { createContext, useContext, useEffect } from "react";

export type NavMode = "sidebar" | "dock";

// Layout visibility is driven by the `data-nav` attribute on <html> (set pre-paint,
// see app/layout.tsx) + CSS, so switching modes never causes a flash. This context
// only mirrors the value for the Settings toggle and updates it on change.
const Ctx = createContext<{ mode: NavMode; setMode: (m: NavMode) => void }>({ mode: "sidebar", setMode: () => {} });

export function NavModeProvider({ children }: { children: React.ReactNode }) {
  const stored = useStoredPref("base_nav_mode","sidebar");
  const mode: NavMode = stored === "dock" ? "dock" : "sidebar";
  useEffect(() => { document.documentElement.dataset.nav = mode; },[mode]);
  const setMode = (m: NavMode) => { writeStored("base_nav_mode",m); document.documentElement.dataset.nav = m; };

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useNavMode = () => useContext(Ctx);
