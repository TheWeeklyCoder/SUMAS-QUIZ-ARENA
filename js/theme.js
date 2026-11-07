// Light is the default. The student's choice is remembered on this device.
const KEY = "sumas_theme";
const COLORS = { light: "#e4edff", dark: "#0e1230" };

export function getTheme() {
  try { const v = localStorage.getItem(KEY); return v === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function setTheme(t) {
  const theme = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLORS[theme]);
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("sumas:theme", { detail: theme }));
  return theme;
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");
export const initTheme = () => setTheme(getTheme());
