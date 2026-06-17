"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Dark is the product default. The inline script in `layout.tsx` applies the
// stored (or default) theme before paint to avoid a flash; this context only
// mirrors that into React state so components can read/toggle it.
const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function persist(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* private mode / storage disabled — attribute is still applied */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    let current: Theme = "dark";
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        current = stored;
      } else {
        // First visit: fall back to whatever the inline script applied (dark),
        // and persist it so the choice is stable across sessions.
        const applied = document.documentElement.getAttribute("data-theme");
        current = applied === "light" ? "light" : "dark";
        localStorage.setItem("theme", current);
      }
    } catch {
      /* ignore */
    }
    setThemeState(current);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persist(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
