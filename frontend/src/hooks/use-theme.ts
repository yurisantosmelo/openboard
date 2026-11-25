import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'openboard:theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';
const LIGHT_CHROME = '#fcfcfc';
const DARK_CHROME = '#000000';

const listeners = new Set<() => void>();
let removeWindowListeners: (() => void) | null = null;
let cachedSnapshot: { theme: ThemePreference; resolvedTheme: ResolvedTheme } | null = null;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(MEDIA_QUERY).matches
  );
}

function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function resolveAppearance(theme: ThemePreference): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return getSystemDark() ? 'dark' : 'light';
}

function applyThemeToDocument(theme: ThemePreference, suppressTransitions: boolean): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveAppearance(theme);
  const root = document.documentElement;
  if (suppressTransitions) root.classList.add('no-transitions');
  root.classList.toggle('dark', resolved === 'dark');
  const chrome = resolved === 'dark' ? DARK_CHROME : LIGHT_CHROME;
  root.style.backgroundColor = chrome;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute('content', chrome);
  if (suppressTransitions) {
    root.getBoundingClientRect();
    requestAnimationFrame(() => {
      root.classList.remove('no-transitions');
    });
  }
}

function emitChange(): void {
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

function handleExternalChange(): void {
  applyThemeToDocument(readStoredTheme(), true);
  emitChange();
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  listeners.add(listener);
  if (!removeWindowListeners) {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(MEDIA_QUERY) : null;
    media?.addEventListener('change', handleExternalChange);
    window.addEventListener('storage', handleExternalChange);
    removeWindowListeners = () => {
      media?.removeEventListener('change', handleExternalChange);
      window.removeEventListener('storage', handleExternalChange);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      removeWindowListeners?.();
      removeWindowListeners = null;
    }
  };
}

function getSnapshot(): { theme: ThemePreference; resolvedTheme: ResolvedTheme } {
  if (cachedSnapshot) return cachedSnapshot;
  const theme = readStoredTheme();
  cachedSnapshot = { theme, resolvedTheme: resolveAppearance(theme) };
  return cachedSnapshot;
}

const SERVER_SNAPSHOT: { theme: ThemePreference; resolvedTheme: ResolvedTheme } = {
  theme: 'system',
  resolvedTheme: 'light',
};

export function setThemePreference(next: ThemePreference): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage write errors in restricted browsing modes.
    }
  }
  applyThemeToDocument(next, true);
  emitChange();
}

const THEME_CYCLE: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return {
    theme: snapshot.theme,
    resolvedTheme: snapshot.resolvedTheme,
    setTheme: setThemePreference,
    cycleTheme: () => {
      setThemePreference(THEME_CYCLE[snapshot.theme]);
    },
  } as const;
}
