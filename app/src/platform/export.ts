import { invoke, isTauri } from '@tauri-apps/api/core';
import type { PageSize } from '../cutlist/format';

/**
 * Cut-list output. In the desktop app every call is a Tauri command
 * (app/src-tauri/src/export.rs): WebView2 prints and saves the PDF from this
 * very page with the print stylesheet. In a browser (dev:web) the CSV is
 * downloaded and printing uses the browser's own dialog.
 */

export type ExportErrorKind = 'fileInUse' | 'diskFull' | 'denied' | 'unsupported' | 'failed';

const KINDS: readonly string[] = ['fileInUse', 'diskFull', 'denied', 'unsupported', 'failed'];

/** An export failure with a message written to be shown as is. */
export class ExportError extends Error {
  readonly kind: ExportErrorKind;

  constructor(kind: ExportErrorKind, message: string) {
    super(message);
    this.name = 'ExportError';
    this.kind = kind;
  }
}

export function toExportError(error: unknown): ExportError {
  if (error instanceof ExportError) return error;
  if (typeof error === 'object' && error !== null) {
    const { kind, message } = error as { kind?: unknown; message?: unknown };
    if (typeof kind === 'string' && KINDS.includes(kind) && typeof message === 'string') {
      return new ExportError(kind as ExportErrorKind, message);
    }
  }
  console.error('Export failed', error);
  return new ExportError('failed', 'The file couldn’t be saved. Try again.');
}

export interface SavedFile {
  /** File name shown in the toast. */
  name: string;
  /** Folder name shown in the toast, e.g. "KERFuffle". Null for a browser download. */
  folder: string | null;
  /** Full path for Show in folder. Null for a browser download. */
  path: string | null;
}

/** Show in folder is a desktop feature. */
export const canShowInFolder = (): boolean => isTauri();

function describe(path: string): SavedFile {
  const parts = path.split(/[\\/]/);
  return { name: parts.at(-1) ?? path, folder: parts.at(-2) ?? null, path };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toExportError(error);
  }
}

/** Ask where to save; null when the user cancels. */
async function choosePath(fileName: string, kind: 'csv' | 'pdf' | 'job'): Promise<string | null> {
  return call<string | null>('choose_export_path', { fileName, kind });
}

/**
 * Save the CSV. `onStart` runs once the user has picked a file (the time spent
 * in the dialog isn't "saving"). Resolves null when cancelled.
 */
export async function saveCsv(fileName: string, contents: string, onStart: () => void = () => {}): Promise<SavedFile | null> {
  if (!isTauri()) {
    onStart();
    download(fileName, contents);
    return { name: fileName, folder: null, path: null };
  }
  const path = await choosePath(fileName, 'csv');
  if (!path) return null;
  onStart();
  await call('write_export_file', { path, contents });
  return describe(path);
}

/**
 * Save a .kerfjob file (Documents\KERFuffle by default). `onStart` runs once a
 * file is picked. Resolves null when cancelled.
 */
export async function saveJobFile(fileName: string, contents: string, onStart: () => void = () => {}): Promise<SavedFile | null> {
  if (!isTauri()) {
    onStart();
    download(fileName, contents, 'application/json');
    return { name: fileName, folder: null, path: null };
  }
  const path = await choosePath(fileName, 'job');
  if (!path) return null;
  onStart();
  await call('write_export_file', { path, contents });
  return describe(path);
}

export interface ExportFile {
  name: string;
  contents: string;
}

export interface SavedFolder {
  /** How many files were written. */
  count: number;
  /** Folder name shown in the toast. Null for browser downloads. */
  folder: string | null;
  /** The first file, for Show in folder (Explorer opens the folder with it selected). Null for downloads. */
  path: string | null;
  /** The job's DXFs from an earlier export that this one replaced, removed from the folder. */
  removed: string[];
  /** Such files that couldn't be removed (open in another program). */
  notRemoved: string[];
}

/**
 * Save several files into one folder (the DXFs, one per sheet pattern). The
 * folder dialog starts in `Documents\KERFuffle\{folderName}`. `onStart` runs
 * once a folder is picked. Resolves null when cancelled. In a browser each
 * file is downloaded.
 *
 * `staleDxfOf` (the job part of the DXF names, dxfJobPart) clears that job's
 * DXFs from an earlier export out of the folder, so no old pattern is left to cut.
 */
export async function saveFolder(
  folderName: string,
  files: readonly ExportFile[],
  onStart: () => void = () => {},
  staleDxfOf: string | null = null,
): Promise<SavedFolder | null> {
  if (!isTauri()) {
    onStart();
    for (const f of files) download(f.name, f.contents, 'application/dxf');
    return { count: files.length, folder: null, path: null, removed: [], notRemoved: [] };
  }
  const dir = await call<string | null>('choose_export_folder', { folderName });
  if (!dir) return null;
  onStart();
  const written = await call<{ paths: string[]; removed: string[]; notRemoved: string[] }>('write_export_files', { dir, files, staleDxfOf });
  return {
    count: written.paths.length,
    folder: dir.split(/[\\/]/).filter(Boolean).at(-1) ?? dir,
    path: written.paths[0] ?? null,
    removed: written.removed,
    notRemoved: written.notRemoved,
  };
}

export type PdfResult = { kind: 'saved'; file: SavedFile } | { kind: 'cancelled' } | { kind: 'printDialog' };

/**
 * Save the page as a PDF through WebView2. Where that isn't available (an old
 * WebView2, or a browser) the print dialog opens instead, so the user can pick
 * "Microsoft Print to PDF": the same pages either way.
 */
export async function savePdf(fileName: string, page: PageSize, onStart: () => void = () => {}): Promise<PdfResult> {
  if (!isTauri()) {
    await printSheets();
    return { kind: 'printDialog' };
  }
  const path = await choosePath(fileName, 'pdf');
  if (!path) return { kind: 'cancelled' };
  onStart();
  try {
    await call('print_to_pdf', { path, page: { widthIn: page.widthIn, heightIn: page.heightIn } });
  } catch (error) {
    if (toExportError(error).kind !== 'unsupported') throw error;
    await printSheets();
    return { kind: 'printDialog' };
  }
  return { kind: 'saved', file: describe(path) };
}

/** The Windows print dialog for the printed sheets. */
export async function printSheets(): Promise<void> {
  if (isTauri()) {
    try {
      await call('show_print_dialog');
      return;
    } catch (error) {
      if (toExportError(error).kind !== 'unsupported') throw error;
    }
  }
  window.print();
}

export async function showInFolder(path: string): Promise<void> {
  await call('reveal_in_folder', { path });
}

function download(fileName: string, contents: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
