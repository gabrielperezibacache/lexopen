"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "lexopen_theme";
const CHANGE_EVENT = "lexopen-theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyResolved(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

function subscribe(onStoreChange: () => void) {
  const onChange = () => onStoreChange();
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

function getModeSnapshot(): ThemeMode {
  return readStoredThemeMode();
}

function getResolvedSnapshot(): "light" | "dark" {
  return resolveMode(readStoredThemeMode());
}

function emitThemeChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, getModeSnapshot, () => "system");
  const resolved = useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    () => "light"
  );

  useEffect(() => {
    applyResolved(resolved);
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyResolved(resolveMode(next));
    emitThemeChange();
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider");
  }
  return ctx;
}
