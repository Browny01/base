"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { readStored, writeStored } from "./prefs";

type Theme = "light" | "dark";
type Preference = Theme | "system";
const Ctx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Preference) => void }>({
  theme: "dark", toggle: () => {}, setTheme: () => {},
});
const themeSnapshot = (): Theme => {
  const preference = readStored("base_theme");
  if (preference === "light" || preference === "dark") return preference;
  if (preference === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const theme = useSyncExternalStore(subscribe, themeSnapshot, () => "dark" as const);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);
  const setTheme = (preference: Preference) => {
    writeStored("base_theme", preference);
    window.dispatchEvent(new Event("base:theme"));
  };
  return <Ctx.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
