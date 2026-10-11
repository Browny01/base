"use client";

import { useStoredPref, writeStored } from "./prefs";
import { createContext, useContext, useEffect } from "react";

// Accent presets. --accent-soft / --accent-border are color-mix(var(--accent)…) in
// globals.css, so overriding just --accent cascades to every accent surface.
export const ACCENTS: { key: string; label: string; value: string }[] = [
  { key: "indigo",  label: "Indigo",  value: "#5b50e8" },
  { key: "violet",  label: "Violet",  value: "#7c3aed" },
  { key: "blue",    label: "Blue",    value: "#2563eb" },
  { key: "cyan",    label: "Cyan",    value: "#0891b2" },
  { key: "emerald", label: "Emerald", value: "#059669" },
  { key: "amber",   label: "Amber",   value: "#d97706" },
  { key: "rose",    label: "Rose",    value: "#e11d48" },
  { key: "pink",    label: "Pink",    value: "#db2777" },
];

const DEFAULT = ACCENTS[0].value;

const Ctx = createContext<{ accent: string; setAccent: (v: string) => void }>({ accent: DEFAULT, setAccent: () => {} });

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const accent = useStoredPref("base_accent", DEFAULT);
  useEffect(() => { document.documentElement.style.setProperty("--accent",accent); },[accent]);
  const setAccent = (v: string) => { writeStored("base_accent",v); document.documentElement.style.setProperty("--accent",v); };

  return <Ctx.Provider value={{ accent, setAccent }}>{children}</Ctx.Provider>;
}

export const useAccent = () => useContext(Ctx);
