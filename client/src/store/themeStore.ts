import { create } from "zustand";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const THEME_KEY = "moon-theme";
const VALID_THEMES = new Set<ThemePreference>(["dark", "light", "system"]);

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function userThemeKey(userId?: string) {
  return userId ? `${THEME_KEY}:${userId}` : THEME_KEY;
}

function readTheme(key: string): ThemePreference | null {
  const value = safeLocalStorage()?.getItem(key);
  return value && VALID_THEMES.has(value as ThemePreference) ? (value as ThemePreference) : null;
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

type State = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  userId?: string;
  hydrateForUser: (userId?: string) => void;
  setPreference: (preference: ThemePreference) => void;
  syncSystemTheme: () => void;
};

const initialPreference = typeof window === "undefined" ? "dark" : readTheme(THEME_KEY) || "dark";

export const useThemeStore = create<State>((set, get) => ({
  preference: initialPreference,
  resolvedTheme: typeof document === "undefined" ? "dark" : applyTheme(initialPreference),
  hydrateForUser: (userId) => {
    const preference = readTheme(userThemeKey(userId)) || readTheme(THEME_KEY) || "dark";
    const resolvedTheme = applyTheme(preference);
    set({ preference, resolvedTheme, userId });
  },
  setPreference: (preference) => {
    const resolvedTheme = applyTheme(preference);
    const storage = safeLocalStorage();
    storage?.setItem(THEME_KEY, preference);
    const { userId } = get();
    if (userId) storage?.setItem(userThemeKey(userId), preference);
    set({ preference, resolvedTheme });
  },
  syncSystemTheme: () => {
    const { preference } = get();
    if (preference !== "system") return;
    const resolvedTheme = applyTheme(preference);
    set({ resolvedTheme });
  }
}));
