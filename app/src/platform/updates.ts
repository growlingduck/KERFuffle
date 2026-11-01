import { invoke, isTauri } from '@tauri-apps/api/core';
import { jobSession } from '../data/storage';
import { whenFreeToLeave } from '../routes';
import { createStore, useStore } from '../state/createStore';
import { showToast } from '../state/toast';

/**
 * Updates as the screens see them. The checking, downloading and installing
 * happen in Rust (app/src-tauri/src/updates.rs); here the header learns that
 * an update is ready, Settings → About can check by hand, and Restart now
 * flushes autosave before handing over to the installer.
 */

export interface UpdateStatus {
  currentVersion: string;
  /** False in development builds. */
  enabled: boolean;
  checking: boolean;
  readyVersion: string | null;
  /** Unix ms of the last check that reached the server. */
  lastChecked: number | null;
  /** The version this one replaced, on the first run after an update. */
  updatedFrom: string | null;
}

export interface UpdatesState {
  /** Null in a browser (dev:web, tests without a desktop), or before the first read. */
  status: UpdateStatus | null;
  restarting: boolean;
}

export const updatesStore = createStore<UpdatesState, Partial<UpdatesState>>((state, patch) => ({ ...state, ...patch }), {
  status: null,
  restarting: false,
});

export function useUpdates(): UpdatesState {
  return useStore(updatesStore, (s) => s);
}

/** The version built into the app (root package.json, kept in step by scripts/version.mjs). */
export const APP_VERSION: string = __APP_VERSION__;

function message(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Something went wrong.';
}

async function refresh(): Promise<UpdateStatus> {
  const status = await invoke<UpdateStatus>('update_status');
  updatesStore.dispatch({ status });
  return status;
}

/** Start-up: read the status, say so once after an update, and listen for each finished check. */
export async function startUpdates(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    // Sent after every check, so a check that overlapped the background one
    // stops spinning when that one finishes.
    await listen('update-status', () => void refresh().catch(() => undefined));
    const status = await refresh();
    if (status.updatedFrom) showToast(`Updated to KERFuffle ${status.currentVersion}. Your jobs are all here.`);
  } catch (error) {
    console.warn('Could not read the update status', error);
  }
}

/** Settings → About → Check for updates. Rejects with a sentence to show. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const current = updatesStore.getState().status;
  if (current) updatesStore.dispatch({ status: { ...current, checking: true } });
  try {
    const status = await invoke<UpdateStatus>('check_for_updates');
    updatesStore.dispatch({ status });
    return status;
  } catch (error) {
    void refresh().catch(() => undefined);
    throw new Error(message(error), { cause: error });
  }
}

/**
 * Restart now: let Settings save or discard, write the open job, then hand
 * over to the installer, which reopens KERFuffle when it's done. If the job
 * can't be written, nothing restarts.
 */
export function restartToUpdate(): void {
  whenFreeToLeave(() => {
    void (async () => {
      updatesStore.dispatch({ restarting: true });
      try {
        await jobSession.flush();
        if (jobSession.getState().save?.kind === 'error') {
          showToast('Your last change isn’t saved yet, so KERFuffle won’t restart. Retry the save, then Restart now.');
          return;
        }
        await invoke('restart_to_update');
      } catch (error) {
        showToast(message(error));
      } finally {
        updatesStore.dispatch({ restarting: false });
      }
    })();
  });
}
