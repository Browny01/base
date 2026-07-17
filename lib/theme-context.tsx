"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const Ctx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Hydrate from the class the pre-paint script already applied
  useEffect(() => {
    const saved = (localStorage.getItem("bridge_theme") as Theme | null);
    if (saved === "dark" || saved === "light") setThemeState(saved);
    else setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  // Apply + persist on change
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    localStorage.setItem("bridge_theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState(t => (t === "dark" ? "light" : "dark"));

  return (
    <Ctx.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
