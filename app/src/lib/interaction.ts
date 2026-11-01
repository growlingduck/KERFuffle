import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Focusable descendants in tab order (positive tabindex is not used in this app). */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('inert') && !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Close on Esc or on a pointer press outside `refs`. Esc is handled in the capture
 * phase and stopped, so a menu inside a dialog closes the menu, not the dialog.
 */
export function useDismiss(
  open: boolean,
  refs: readonly RefObject<HTMLElement | null>[],
  onDismiss: (reason: 'escape' | 'outside') => void,
): void {
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });
  const refsRef = useRef(refs);
  useEffect(() => {
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      dismissRef.current('escape');
    };
    const onPointer = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node | null;
      if (refsRef.current.some((r) => r.current?.contains(target ?? null))) return;
      dismissRef.current('outside');
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);
}

/**
 * True only once `flag` has stayed true for `delay` ms. Spinners use this so work
 * under 300 ms goes straight to its done state (interaction-design §3).
 */
export function useDelayedFlag(flag: boolean, delay = 300): boolean {
  const [shown, setShown] = useState(false);
  // Reset during render when the work ends, so the next run starts hidden again.
  if (!flag && shown) setShown(false);
  useEffect(() => {
    if (!flag) return;
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [flag, delay]);
  return flag && shown;
}

/** Join class names, skipping falsy values. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
