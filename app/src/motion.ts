import { useSyncExternalStore } from 'react';

/**
 * Reduced-motion preference. Mirrors `prefers-reduced-motion` onto
 * `<html data-motion="reduce|full">`, which tokens.css and base.css key off, and
 * exposes it to components whose motion is driven from script (e.g. the toast bar).
 */
const QUERY = '(prefers-reduced-motion: reduce)';

let reduced = false;
const listeners = new Set<() => void>();
let media: MediaQueryList | null = null;

function apply(value: boolean): void {
  reduced = value;
  document.documentElement.dataset.motion = value ? 'reduce' : 'full';
  for (const listener of [...listeners]) listener();
}

function onChange(event: MediaQueryListEvent): void {
  apply(event.matches);
}

/** Start following the OS setting. Safe to call more than once. */
export function initMotion(): () => void {
  media?.removeEventListener('change', onChange);
  media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  apply(media?.matches ?? false);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

export function prefersReducedMotion(): boolean {
  return reduced;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => reduced,
    () => false,
  );
}
