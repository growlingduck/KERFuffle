import { createStore, useStore } from '../state/createStore';
import { showToast } from '../state/toast';
import { getStorageClient } from './client';
import { toStorageError } from './errors';
import { jobSession, loadDisplaySettings, refreshJobList } from './storage';
import type { BackupInfo, BackupOverview, BackupSettings, RestoreResult } from './types';

/**
 * Backups as the screens see them: the folder, how many are kept and the list,
 * shared by the Jobs backup strip and Settings. The work itself happens in the
 * database layer (app/src-tauri/src/db/backup.rs).
 */

export interface BackupsState {
  overview: BackupOverview | null;
  /** Why the list couldn't be read, if it couldn't. */
  error: string | null;
}

export const backupsStore = createStore<BackupsState, Partial<BackupsState>>((state, patch) => ({ ...state, ...patch }), {
  overview: null,
  error: null,
});

export function useBackups(): BackupsState {
  return useStore(backupsStore, (s) => s);
}

export async function refreshBackups(): Promise<void> {
  try {
    backupsStore.dispatch({ overview: await getStorageClient().backupOverview(), error: null });
  } catch (error) {
    backupsStore.dispatch({ error: toStorageError(error).message });
  }
}

export function jobsPhrase(count: number | null): string {
  if (count === null) return 'an older job database';
  return count === 1 ? '1 job' : `${count} jobs`;
}

/** Back up now. Rejects with a StorageError. */
export async function backUpNow(): Promise<BackupInfo> {
  // Edits still waiting for their debounced save belong in the backup.
  await jobSession.flush();
  try {
    return await getStorageClient().backUpNow();
  } finally {
    await refreshBackups();
  }
}

/**
 * Make a backup the job database. The open job is saved and closed first (its
 * undo history goes with it: those steps belong to the jobs being replaced).
 * Rejects with a StorageError; the database then still holds the jobs it had.
 */
export async function restoreBackup(fileName: string): Promise<RestoreResult> {
  await jobSession.close();
  try {
    return await getStorageClient().restoreBackup(fileName);
  } finally {
    await refreshJobList().catch((error: unknown) => showToast(toStorageError(error).message));
    await loadDisplaySettings();
    await refreshBackups();
  }
}

/** Save the folder and count. Rejects with a StorageError (e.g. a folder that won't take files). */
export async function saveBackupSettings(settings: BackupSettings): Promise<void> {
  backupsStore.dispatch({ overview: await getStorageClient().setBackupSettings(settings), error: null });
}

/** Rough size of `keep` backups, from the ones already made. */
export function estimateBackupBytes(overview: BackupOverview | null, keep: number): number | null {
  const sizes = overview?.backups.map((b) => b.sizeBytes) ?? [];
  if (sizes.length === 0) return null;
  return Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * keep);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
