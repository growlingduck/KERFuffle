import { useCallback, useSyncExternalStore } from 'react';

/**
 * "Include fronts" is remembered per job, on this computer. It's a viewing
 * choice, not part of the job, so it isn't saved in the job database and
 * doesn't bump the job's revision.
 */

const PREFIX = 'kerfuffle.cutlist.includeFronts.';
const listeners = new Set<() => void>();

function read(jobId: string): boolean {
  try {
    return window.localStorage.getItem(PREFIX + jobId) !== 'false';
  } catch {
    return true;
  }
}

export function setIncludeFronts(jobId: string, include: boolean): void {
  try {
    // On is the default, so only "off" is stored.
    if (include) window.localStorage.removeItem(PREFIX + jobId);
    else window.localStorage.setItem(PREFIX + jobId, 'false');
  } catch {
    // Storage unavailable: the switch still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Defaults to on. */
export function useIncludeFronts(jobId: string): [boolean, (include: boolean) => void] {
  const include = useSyncExternalStore(subscribe, () => read(jobId), () => true);
  const set = useCallback((value: boolean) => setIncludeFronts(jobId, value), [jobId]);
  return [include, set];
}
