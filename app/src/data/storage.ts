import { isTauri } from '@tauri-apps/api/core';
import { useStore } from '../state/createStore';
import { clearJobRecords, rememberJobRecord } from '../state/jobRecords';
import { jobsStore, summarize } from '../state/jobs';
import type { JobStatus, JobSummary } from '../state/jobs';
import { setDisplaySettings } from '../state/display';
import { loadMaterials, materialsStore } from '../state/materials';
import { showToast } from '../state/toast';
import { getStorageClient } from './client';
import { installCloseGuard } from './closeGuard';
import { toStorageError } from './errors';
import { createJobSession } from './jobSession';
import { defaultJobMaterials } from './materials';
import type { SaveState } from './jobSession';
import { recoverPendingEdits } from './recovery';
import { RULES_VERSION, withConstruction } from './rules';
import type { JobRecord, NewJob } from './types';
import { DISPLAY_SETTING, parseDisplaySettings, toSnapshot } from './types';

/** The app's one open job. Screens read it synchronously; commits autosave. */
export const jobSession = createJobSession({
  client: getStorageClient,
  onSaved: (job) => {
    rememberJobRecord(job);
    jobsStore.dispatch({ type: 'job/upserted', job: summarize(job) });
  },
});

export async function refreshJobList(): Promise<void> {
  const jobs = await getStorageClient().listJobs();
  clearJobRecords();
  jobsStore.dispatch({ type: 'jobs/loaded', jobs: jobs.map(summarize) });
}

function listed(job: JobRecord): JobSummary {
  rememberJobRecord(job);
  const summary = summarize(job);
  jobsStore.dispatch({ type: 'job/upserted', job: summary });
  return summary;
}

/**
 * Duplicate a job: the next job number, today's date, Draft, "(copy)", and the
 * source job's own rules snapshot (not the current shop defaults). Failures are
 * shown as a toast and resolve to null.
 */
export async function duplicateJob(id: string): Promise<JobSummary | null> {
  try {
    return listed(await getStorageClient().duplicateJob(id));
  } catch (error) {
    showToast(toStorageError(error).message);
    return null;
  }
}

/**
 * Create a job from the New job dialog. An empty job snapshots the shop
 * defaults with the chosen construction. A copy of a job takes that job's
 * cabinets and its own rules (as Duplicate does) under the new name, customer
 * and notes, and the chosen construction if it differs. Rejects with a
 * StorageError.
 */
export async function createJob(input: NewJob, copyFromId?: string): Promise<JobSummary> {
  const client = getStorageClient();
  if (!copyFromId) {
    // A new job copies the shop's default materials, prices and all, as they are now.
    const { catalog, estimate } = materialsStore.getState();
    const materials = input.materials ?? defaultJobMaterials(catalog, estimate, new Date().toISOString());
    return listed(await client.createJob({ ...input, materials }));
  }

  // Duplicate, then rename. Two calls: if the rename fails, the copy is still
  // listed as "… (copy)" and can be renamed or archived like any job.
  const copy = await client.duplicateJob(copyFromId);
  listed(copy);
  const fields = {
    name: input.name.trim(),
    customer: input.customer?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const rules = input.construction ? withConstruction(copy.rules, input.construction) : copy.rules;
  if (rules === copy.rules) {
    const saved = await client.updateJobFields(copy.id, fields);
    return listed({ ...copy, ...fields, ...saved });
  }
  // The copy is a draft, so its construction can be saved with the new name.
  const renamed = { ...copy, ...fields, rules, rulesVersion: RULES_VERSION };
  const saved = await client.saveJob(toSnapshot(renamed, true));
  return listed({ ...renamed, ...saved });
}

/** Read the "round shown sizes to" setting. Keeps the current one if it can't be read. */
export async function loadDisplaySettings(): Promise<void> {
  try {
    const { other } = await getStorageClient().getShopSettings();
    setDisplaySettings(parseDisplaySettings(other[DISPLAY_SETTING]));
  } catch (error) {
    console.warn('Could not read the display settings', toStorageError(error));
  }
}

/**
 * Startup: take the day's first backup (before anything else touches the
 * database), apply edits left by a crash (with a toast), load the display
 * setting and the job list, and make closing the window wait for pending saves.
 * Failures are shown, not thrown, so the window still opens.
 */
export async function startStorage(): Promise<void> {
  const client = getStorageClient();
  try {
    await client.runDailyBackup();
  } catch (error) {
    showToast(`Today’s automatic backup didn’t work. ${toStorageError(error).message}`);
  }
  try {
    await recoverPendingEdits(client, (message) => showToast(message));
    await loadDisplaySettings();
    await loadMaterials();
    await refreshJobList();
  } catch (error) {
    showToast(toStorageError(error).message);
  }
  if (isTauri()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await installCloseGuard(getCurrentWindow(), jobSession);
  }
}

/**
 * Change a job's status. The open job saves through its session (one path for
 * autosave and undo); any other job is written directly.
 */
export function changeJobStatus(id: string, status: JobStatus): void {
  const previous = jobsStore.getState().jobs[id]?.status;
  jobsStore.dispatch({ type: 'job/statusChanged', id, status });
  if (jobSession.getJob()?.id === id) {
    jobSession.commit((job) => ({ ...job, status }));
    return;
  }
  getStorageClient()
    .setJobStatus(id, status)
    .then((saved) => {
      const job = jobsStore.getState().jobs[id];
      if (job) jobsStore.dispatch({ type: 'job/upserted', job: { ...job, savedAt: saved.updatedAt, revision: saved.revision } });
    })
    .catch((error: unknown) => {
      if (previous) jobsStore.dispatch({ type: 'job/statusChanged', id, status: previous });
      showToast(toStorageError(error).message);
    });
}

/** The save state for a job if it is the open one, otherwise null. */
export function useSaveState(jobId: string | undefined): SaveState | null {
  return useStore(jobSession.store, (s) => (jobId && s.jobId === jobId ? s.save : null));
}

/** Development builds only: add the sample jobs (wireframes, cut-list sample, 40-cabinet stress job). */
export async function loadSampleJobs(): Promise<void> {
  try {
    await getStorageClient().devLoadSampleJobs();
    await refreshJobList();
  } catch (error) {
    showToast(toStorageError(error).message);
  }
}
