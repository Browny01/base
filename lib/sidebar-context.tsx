"use client";

import { useStoredPref, writeStored } from "./prefs";
import { createContext, useContext } from "react";

interface SidebarCtx {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const collapsed = useStoredPref("base_sidebar_collapsed","false") === "true";
  function toggle() { writeStored("base_sidebar_collapsed",JSON.stringify(!collapsed)); }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
