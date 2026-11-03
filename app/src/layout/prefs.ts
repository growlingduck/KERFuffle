import { useCallback, useSyncExternalStore } from 'react';
import { LAYOUT_MODES } from '@kerfuffle/engine';
import type { LayoutMode } from '@kerfuffle/engine';

/**
 * The Layouts tab's mode (Cost · Grain · Time), remembered per job on this
 * computer, like "Include fronts". A saved layout keeps its own mode; this is
 * what a draft lays out in.
 */

const PREFIX = 'kerfuffle.layouts.mode.';
const listeners = new Set<() => void>();

export function readLayoutMode(jobId: string): LayoutMode {
  try {
    const stored = window.localStorage.getItem(PREFIX + jobId);
    return LAYOUT_MODES.includes(stored as LayoutMode) ? (stored as LayoutMode) : 'cost';
  } catch {
    return 'cost';
  }
}

export function setLayoutMode(jobId: string, mode: LayoutMode): void {
  try {
    // Cost is the default, so only the others are stored.
    if (mode === 'cost') window.localStorage.removeItem(PREFIX + jobId);
    else window.localStorage.setItem(PREFIX + jobId, mode);
  } catch {
    // Storage unavailable: the switch still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLayoutMode(jobId: string): [LayoutMode, (mode: LayoutMode) => void] {
  const mode = useSyncExternalStore(subscribe, () => readLayoutMode(jobId), () => 'cost' as const);
  const set = useCallback((value: LayoutMode) => setLayoutMode(jobId, value), [jobId]);
  return [mode, set];
}

