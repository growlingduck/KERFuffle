import { jobsStore } from '../state/jobs';
import type { JobSummary } from '../state/jobs';
import { showToast } from '../state/toast';
import { cleanDetails, detailsChangeLabel } from '../workspace/commands';
import type { JobDetails } from '../workspace/commands';
import { markedText } from '../workspace/construction';
import { runCommand, undoIfLatest } from '../workspace/history';
import { getStorageClient } from './client';
import { toStorageError } from './errors';
import { changeJobStatus, jobSession } from './storage';

/** A summary's details in the shape the dialog and the command use. */
export function detailsOf(job: JobSummary): JobDetails {
  return { name: job.name, customer: job.customer || null, notes: job.notes || null, status: job.status };
}

/**
 * Save a job's name, customer, notes and status from the Job details dialog,
 * with a toast that can undo it. The open job saves as one workspace step, so
 * Ctrl+Z covers it too. Any other job is written directly, and shows the change
 * at once; a failed write puts the old details back and says why.
 * Returns false when nothing changed or the name is blank.
 */
export function saveJobDetails(job: JobSummary, next: JobDetails): boolean {
  const before = detailsOf(job);
  const details = cleanDetails(next);
  const label = detailsChangeLabel(before, details);
  if (!label) return false;
  const onlyStatus = (['name', 'customer', 'notes'] as const).every((k) => details[k] === before[k]);
  // A status change alone reads as it does from the status menu ("…Construction is locked.").
  const message = onlyStatus ? markedText(before.status, details.status) : label;

  if (jobSession.getJob()?.id === job.id) {
    const entry = runCommand({ type: 'setDetails', details });
    if (!entry) return false;
    showToast(message, { label: 'Undo', run: () => void undoIfLatest(entry) });
    return true;
  }

  writeDetails(job.id, before, details);
  showToast(message, { label: 'Undo', run: () => writeDetails(job.id, details, before) });
  return true;
}

/** Write another job's details: fields with one call, the status through its own path. */
function writeDetails(id: string, from: JobDetails, to: JobDetails): void {
  const fieldsChanged = from.name !== to.name || from.customer !== to.customer || from.notes !== to.notes;
  if (fieldsChanged) {
    const show = (d: JobDetails) =>
      jobsStore.dispatch({ type: 'job/detailsChanged', id, name: d.name, customer: d.customer ?? '', notes: d.notes ?? '' });
    show(to);
    getStorageClient()
      .updateJobFields(id, { name: to.name, customer: to.customer, notes: to.notes })
      .then((saved) => {
        const job = jobsStore.getState().jobs[id];
        if (job) jobsStore.dispatch({ type: 'job/upserted', job: { ...job, savedAt: saved.updatedAt, revision: saved.revision } });
      })
      .catch((error: unknown) => {
        show(from);
        showToast(toStorageError(error).message);
      });
  }
  if (from.status !== to.status) changeJobStatus(id, to.status);
}
