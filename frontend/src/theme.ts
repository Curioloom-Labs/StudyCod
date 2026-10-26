export type AppTheme = "dark" | "light";
const STORAGE_KEY = "studycod_theme";
export function getSavedTheme(): AppTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}
export function getPreferredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}
export function getCurrentTheme(): AppTheme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return getSavedTheme() ?? getPreferredTheme();
}
export function applyTheme(theme: AppTheme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The active theme still applies for this page even when persistence is blocked.
    }
  }
}
export function initTheme() {
  const theme = getSavedTheme() ?? getPreferredTheme();
  applyTheme(theme);
}
