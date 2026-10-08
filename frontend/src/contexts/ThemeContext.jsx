import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Light / dark switch, mirroring WIDispatch-Production's store.theme (dark by
// default). The attribute lives on <html> so every token in index.css follows
// it; index.html applies the stored value before first paint to avoid a flash.
export const THEME_STORAGE_KEY = "widispatch-theme";
const DEFAULT_THEME = "dark";

const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const fromDom = document.documentElement.dataset.theme;
    return fromDom === "light" || fromDom === "dark" ? fromDom : readStoredTheme();
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies.
    }
    window.dispatchEvent(new CustomEvent("widispatch:themechange", { detail: theme }));
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

export default ThemeContext;
