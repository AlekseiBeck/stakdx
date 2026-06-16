import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'stakdx-theme';
const META_COLOR: Record<Theme, string> = { light: '#f5f5f7', dark: '#0c0c0d' };

// Resolve the boot theme. The inline script in index.html sets data-theme on
// <html> before paint, so reading it back keeps the provider in sync with what
// the user already sees (no flash). localStorage / prefers-color-scheme are
// fallbacks for environments where the script didn't run (e.g. tests).
function resolveInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

// Sync the DOM to a theme (attribute + status-bar color). Deliberately does NOT
// persist — applied on mount so the DOM matches resolved state without pinning a
// new user's system preference into localStorage (keeps "default to system" live).
function applyThemeDom(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[theme]);
}

// Persist an explicit user choice. Only called from setTheme/toggleTheme.
function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage unavailable */
  }
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  // Keep the DOM in sync with the resolved state on mount (defensive — the
  // inline script in index.html normally does this pre-paint). No persistence.
  useEffect(() => {
    applyThemeDom(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyThemeDom(t);
    persistTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyThemeDom(next);
      persistTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Returns a safe default when no provider is mounted (e.g. components rendered
// bare in unit tests), reading the DOM attribute and no-op'ing mutations so
// consumers never crash.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  const domTheme: Theme =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light';
  return { theme: domTheme, toggleTheme: () => {}, setTheme: () => {} };
}
