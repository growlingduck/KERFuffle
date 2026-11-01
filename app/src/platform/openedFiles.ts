import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { toStorageError } from '../data/errors';
import { navigate } from '../routes';
import { createStore, useStore } from '../state/createStore';
import { showToast } from '../state/toast';
import { readJobFileAt } from './files';
import type { PickedFile } from './files';

/**
 * A `.kerfjob` opened from Explorer (double-click, or Open with). Rust holds
 * the path (app/src-tauri/src/opened_files.rs); this takes it at start-up and
 * whenever a second launch passes one on, goes to the Jobs screen, and lets
 * that screen start the import preview when it's free.
 */

export const openedFileStore = createStore<string | null, string | null>((_state, path) => path, null);

async function take(): Promise<void> {
  const path = await invoke<string | null>('take_opened_job_file');
  if (!path) return;
  openedFileStore.dispatch(path);
  navigate({ name: 'jobs' });
}

export async function startOpenedFiles(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('job-file-opened', () => void take());
    await take();
  } catch (error) {
    console.warn('Could not read the opened job file', error);
  }
}

/**
 * The Jobs screen: when `ready` (no dialog open), read the waiting file and
 * pass it on. A file opened while a dialog is up waits until it closes.
 */
export function useOpenedJobFile(onFile: (file: PickedFile) => void, ready: boolean): void {
  const path = useStore(openedFileStore, (s) => s);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });
  useEffect(() => {
    if (!path || !ready) return;
    openedFileStore.dispatch(null);
    readJobFileAt(path).then(
      (file) => onFileRef.current(file),
      (error: unknown) => showToast(toStorageError(error).message),
    );
  }, [path, ready]);
}
