import { version as APP_VERSION } from '../../package.json';
import { canShowInFolder, ExportError, saveJobFile, showInFolder } from '../platform/export';
import type { PickedFile } from '../platform/files';
import { jobsStore } from '../state/jobs';
import type { JobSummary } from '../state/jobs';
import { showToast } from '../state/toast';
import { refreshBackups } from './backups';
import { getStorageClient } from './client';
import { toStorageError } from './errors';
import { jobFileName, readJobFile, writeJobFile } from './jobFile';
import type { FlaggedCabinet, JobFileHeader } from './jobFile';
import { jobSession, refreshJobList } from './storage';
import type { ImportMode, JobRecord } from './types';

/** Moving a job between PCs: Export job file… and Import job… (data/jobFile.ts has the format). */

/**
 * Save a job as a .kerfjob file through the Save dialog. Unsaved edits to the
 * open job are saved first, so the file has them. Shows a toast either way.
 */
export async function exportJob(jobId: string): Promise<void> {
  try {
    if (jobSession.getJob()?.id === jobId) await jobSession.flush();
    const job = await getStorageClient().getJob(jobId);
    const text = await writeJobFile(job, { appVersion: APP_VERSION, exportedAt: new Date().toISOString() });
    const saved = await saveJobFile(jobFileName(job), text);
    if (!saved) return;
    const where = saved.folder ? ` in ${saved.folder}` : '';
    const path = saved.path;
    showToast(
      `Saved “${saved.name}”${where}. Copy it to the other PC and use Import job… there.`,
      path && canShowInFolder() ? { label: 'Show in folder', run: () => void showInFolder(path) } : undefined,
    );
  } catch (error) {
    showToast(error instanceof ExportError ? error.message : toStorageError(error).message);
  }
}

/** A checked job file, ready to confirm in the import dialog. */
export interface ImportPlan {
  fileName: string;
  job: JobRecord;
  header: JobFileHeader;
  flagged: FlaggedCabinet[];
  /** The job on this PC with the same id, if there is one. */
  existing: JobSummary | null;
  /** Another job here already has this number, so the import gets the next one. */
  numberTaken: boolean;
}

/** Check a picked or dropped file. Null (with a toast saying why) when it can't be imported. */
export async function prepareImport(file: PickedFile): Promise<ImportPlan | null> {
  const reading = await readJobFile(file.text);
  if (!reading.ok) {
    showToast(reading.message);
    return null;
  }
  const jobs = Object.values(jobsStore.getState().jobs);
  const existing = jobs.find((j) => j.id === reading.job.id) ?? null;
  const numberTaken = jobs.some((j) => j.numberValue === reading.job.number && j.id !== reading.job.id);
  return { fileName: file.name, job: reading.job, header: reading.header, flagged: reading.flagged, existing, numberTaken };
}

/**
 * Store the job. 'replace' backs up all jobs first (in the database layer) and
 * closes the job if it's open here, dropping its undo history. Rejects with a
 * StorageError; nothing is changed then.
 */
export async function completeImport(plan: ImportPlan, mode: ImportMode): Promise<JobRecord> {
  if (mode === 'replace' && jobSession.getJob()?.id === plan.job.id) await jobSession.close();
  const job = await getStorageClient().importJob(plan.job, mode);
  await refreshJobList();
  if (mode === 'replace') await refreshBackups();
  return job;
}
