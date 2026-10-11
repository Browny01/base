"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { readStored, writeStored, useStoredPref } from "./prefs";

type Theme = "light" | "dark";
type Preference = Theme | "system";
const Ctx = createContext<{ theme: Theme; preference: Preference; toggle: () => void; setTheme: (t: Preference) => void }>({
  theme: "dark", preference: "system", toggle: () => {}, setTheme: () => {},
});
const themeSnapshot = (): Theme => {
  const preference = readStored("base_theme");
  if (preference === "light" || preference === "dark") return preference;
  if (!preference || preference === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
};
function subscribe(listener: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    if (!readStored("base_theme") && "__TAURI_INTERNALS__" in window) {
      document.documentElement.classList.toggle("dark", media.matches);
      document.documentElement.classList.toggle("light", !media.matches);
    }
    listener();
  };
  media.addEventListener("change", update);
  window.addEventListener("storage", update);
  window.addEventListener("base:theme", update);
  return () => { media.removeEventListener("change", update); window.removeEventListener("storage", update); window.removeEventListener("base:theme", update); };
}
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const stored = useStoredPref("base_theme","system");
  const preference:Preference=stored==="light"||stored==="dark"?stored:"system";
  const theme = useSyncExternalStore(subscribe, themeSnapshot, () => "dark" as const);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);
  const setTheme = (preference: Preference) => {
    writeStored("base_theme", preference);
    window.dispatchEvent(new Event("base:theme"));
  };
  return <Ctx.Provider value={{ theme, preference, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
