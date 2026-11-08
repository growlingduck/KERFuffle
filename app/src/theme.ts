import { useSyncExternalStore } from 'react';
import { setWindowTheme } from './platform/window';

/**
 * Light / Dark / System. A viewing preference kept per PC in localStorage, like
 * the cut list's prefs: not a shop setting, so it never travels with backups or
 * .kerfjob files.
 *
 * Light and Dark put `data-theme` on <html>; System removes it, and the
 * prefers-color-scheme block in tokens.css follows the OS live. The inline
 * script in index.html does the same before first paint (it reads THEME_KEY;
 * test/theme.test.ts keeps the two in step).
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_KEY = 'kerfuffle.theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
export const THEME_LABELS: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

let choice: ThemeChoice = 'system';
let media: MediaQueryList | null = null;
const listeners = new Set<() => void>();

function isChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** System when nothing (or nothing valid) is stored, or storage fails. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(next: ThemeChoice): void {
  choice = next;
  const root = document.documentElement;
  if (next === 'system') delete root.dataset.theme;
  else root.dataset.theme = next;
  // The native title bar: null follows the OS.
  setWindowTheme(next === 'system' ? null : next).catch((error: unknown) => console.error('Could not set the window theme', error));
  notify();
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function setThemeChoice(next: ThemeChoice): void {
  try {
    // System is the default, so only an explicit choice is stored.
    if (next === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage unavailable: the theme still changes for this visit.
  }
  apply(next);
}

/** Light → Dark → System → Light: the header's theme button. */
export function nextThemeChoice(current: ThemeChoice): ThemeChoice {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(current) + 1) % THEME_CHOICES.length]!;
}

export function themeChoice(): ThemeChoice {
  return choice;
}

/** What is on screen now: System resolved against the OS. */
export function resolvedTheme(): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return media?.matches ? 'dark' : 'light';
}

/** Apply the stored choice and follow OS changes. Safe to call more than once. */
export function initTheme(): () => void {
  media?.removeEventListener('change', notify);
  media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  media?.addEventListener('change', notify);
  apply(readThemeChoice());
  return () => media?.removeEventListener('change', notify);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, themeChoice, () => 'system');
}

export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, resolvedTheme, () => 'light');
}
