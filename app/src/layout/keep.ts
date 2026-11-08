import { materialInputKeys } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput } from '@kerfuffle/engine';
import { readIncludeFronts } from '../cutlist/prefs';
import { getStorageClient } from '../data/client';
import { toStorageError } from '../data/errors';
import type { JobSession } from '../data/jobSession';
import { layoutRecords, layoutsFixed, withLayouts } from '../data/layouts';
import type { JobRecord, SavedLayoutRecord } from '../data/types';
import { materialsStore } from '../state/materials';
import { sawProfilesStore } from '../state/sawProfiles';
import { showToast } from '../state/toast';
import { jobLayoutInput } from './jobInput';
import { readLayoutMode } from './prefs';
import { backgroundRunner } from './runner';

/**
 * Keeping layouts with a job (plan §2.6). A layout is kept when the job is
 * marked Ready to cut, and when it's printed, saved as PDF or exported as DXF. Keeping one
 * isn't an edit: the job's revision stays as it is.
 */

let session: JobSession | null = null;

/** Write the job's saved layouts, and show them in the open job at once. Rejects with a StorageError. */
export async function keepLayouts(jobId: string, layouts: readonly SavedLayoutRecord[]): Promise<void> {
  await getStorageClient().saveJobLayouts(jobId, layouts);
  const open = session?.getJob();
  if (session && open?.id === jobId) session.store.dispatch({ job: { ...open, layouts: [...layouts] } });
}

/**
 * Keep `layout` for every material it lays out (or just `only`), in place of
 * what the job kept for them. Resolves to everything the job now keeps.
 */
export async function keepJobLayout(
  job: Pick<JobRecord, 'id' | 'layouts'>,
  layout: JobLayout,
  input: LayoutInput,
  only?: ReadonlySet<string>,
): Promise<SavedLayoutRecord[]> {
  const records = layoutRecords(layout, materialInputKeys(input), new Date().toISOString()).filter((r) => !only || only.has(r.materialId));
  const all = withLayouts(job.layouts, records);
  await keepLayouts(job.id, all);
  return all;
}

/**
 * Lay out a job just marked Ready to cut and keep the result. On the cut
 * list this is answered from the layouts already on screen (the runners share
 * their results); anywhere else it lays out in the background.
 */
export function keepLayoutsOnReady(job: JobRecord): void {
  const shop = { catalog: materialsStore.getState().catalog, estimate: materialsStore.getState().estimate, saw: sawProfilesStore.getState().settings };
  let input: LayoutInput;
  try {
    input = jobLayoutInput(job, shop, readLayoutMode(job.id), readIncludeFronts(job.id), new Date().toISOString());
  } catch (error) {
    console.warn('Could not lay out the job to keep its layout', error);
    return;
  }
  backgroundRunner().run(
    input,
    {
      onLayout: (layout, final) => {
        if (!final) return;
        // The job as it is by now: another layout may have been kept meanwhile.
        const latest = session?.getJob()?.id === job.id ? session.getJob()! : job;
        if (!layoutsFixed(latest.status)) return;
        keepJobLayout(latest, layout, input).catch((error: unknown) =>
          showToast(`The sheet layout couldn’t be kept with the job. ${toStorageError(error).message}`),
        );
      },
      onError: (message) => showToast(`The job couldn’t be laid out to keep its sheet layout: ${message}`),
    },
    { notes: false },
  );
}

/**
 * Watch the open job: when it goes from Draft to Ready to cut (the header's
 * status menu, or Undo back to it), keep its layout.
 */
export function installLayoutKeeping(jobSession: JobSession): () => void {
  session = jobSession;
  let last: { id: string; status: JobRecord['status'] } | null = null;
  return jobSession.store.subscribe(() => {
    const job = jobSession.getJob();
    const before = last;
    last = job ? { id: job.id, status: job.status } : null;
    if (!job || !before || before.id !== job.id) return;
    if (before.status === 'draft' && job.status === 'ready') keepLayoutsOnReady(job);
  });
}
