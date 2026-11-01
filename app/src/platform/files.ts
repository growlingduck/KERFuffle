import { invoke, isTauri } from '@tauri-apps/api/core';
import { toStorageError } from '../data/errors';
import { JOB_FILE_EXTENSION } from '../data/jobFile';

/**
 * Files and folders outside the job database: picking a .kerfjob to import,
 * and the backup folder. In the desktop app these are Tauri commands
 * (app/src-tauri/src/backups.rs); in a browser (dev:web) a file input stands in
 * and the folder actions aren't available.
 */

export interface PickedFile {
  name: string;
  text: string;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toStorageError(error);
  }
}

/** True when the PC's file system can be reached (folder pickers, Open folder). */
export const hasFileSystem = (): boolean => isTauri();

/** Read a .kerfjob by path (a dropped file). Other files are refused. */
export async function readJobFileAt(path: string): Promise<PickedFile> {
  const text = await call<string>('read_job_file', { path });
  return { name: path.split(/[\\/]/).at(-1) ?? path, text };
}

/** Ask for a .kerfjob file and read it. Null when the user cancels. */
export async function pickJobFile(): Promise<PickedFile | null> {
  if (isTauri()) {
    const path = await call<string | null>('choose_job_file');
    return path ? readJobFileAt(path) : null;
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${JOB_FILE_EXTENSION}`;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else file.text().then((text) => resolve({ name: file.name, text }), reject);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function isJobFileName(name: string): boolean {
  return name.toLowerCase().endsWith(`.${JOB_FILE_EXTENSION}`);
}

/** Ask for a backup folder. Null when cancelled or there's no file system (browser). */
export async function chooseBackupFolder(): Promise<string | null> {
  return isTauri() ? call<string | null>('choose_backup_folder') : null;
}

export async function openBackupFolder(): Promise<void> {
  if (isTauri()) await call('open_backup_folder');
}
