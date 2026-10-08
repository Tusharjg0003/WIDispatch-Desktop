import { useEffect, useState } from "react";

// JS consumers (Recharts, Cytoscape, Leaflet markers, canvas) cannot resolve
// `var(--token)` themselves. These helpers read the computed token values off
// <html> and re-read them whenever ThemeContext switches the theme.

export const THEME_COLOR_TOKENS = {
  bg: "--bg",
  panel: "--panel",
  panel2: "--panel2",
  line: "--line",
  line2: "--line2",
  tx1: "--tx1",
  tx2: "--tx2",
  mut: "--mut",
  mut2: "--mut2",
  acc: "--acc",
  accTx: "--accTx",
  ok: "--ok",
  okTx: "--okTx",
  warn: "--warn",
  warnTx: "--warnTx",
  amber: "--amber",
  err: "--err",
  errTx: "--errTx",
  onAccent: "--on-accent",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  output: "--chart-output",
  reference: "--chart-reference",
  contracted: "--chart-contracted",
  design: "--chart-design",
  maximum: "--chart-maximum",
  success: "--chart-success",
  warning: "--chart-warning",
  danger: "--chart-danger",
  neutral: "--chart-neutral",
  cyan: "--chart-cyan",
  purple: "--chart-purple",
  grid: "--chart-grid",
  axis: "--chart-axis",
};

export function readCssVar(name, fallback = "") {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function readThemeColors() {
  const colors = {};
  for (const [key, token] of Object.entries(THEME_COLOR_TOKENS)) {
    colors[key] = readCssVar(token);
  }
  colors.theme = typeof document !== "undefined" ? document.documentElement.dataset.theme || "dark" : "dark";
  return colors;
}

/** Subscribe to theme switches; returns an unsubscribe function. */
export function onThemeChange(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("widispatch:themechange", handler);
  return () => window.removeEventListener("widispatch:themechange", handler);
}

/** Resolved colour palette for the active theme, refreshed on theme change. */
export function useThemeColors() {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    setColors(readThemeColors());
    return onThemeChange(() => setColors(readThemeColors()));
  }, []);
  return colors;
}

/** Single resolved token value, refreshed on theme change. */
export function useCssVar(name, fallback = "") {
  const [value, setValue] = useState(() => readCssVar(name, fallback));
  useEffect(() => {
    setValue(readCssVar(name, fallback));
    return onThemeChange(() => setValue(readCssVar(name, fallback)));
  }, [name, fallback]);
  return value;
}
