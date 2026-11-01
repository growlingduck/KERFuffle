import { useEffect } from 'react';
import { getStorageClient } from '../data/client';
import { toStorageError } from '../data/errors';
import type { JobRecord } from '../data/types';
import { createStore, useStore } from './createStore';

/**
 * Full job records for the Jobs screen. The job list carries only outlines;
 * the preview's totals and the drawings' "invalid" placeholders need each
 * job's own rules and complete cabinets. Records are fetched on demand and
 * kept until the job's revision moves past them.
 */
export type JobRecordEntry = { revision: number; job: JobRecord; error?: undefined } | { revision: number; job?: undefined; error: string };

type Action = { type: 'record/set'; id: string; entry: JobRecordEntry } | { type: 'records/clear' };

const recordsStore = createStore<Record<string, JobRecordEntry>, Action>((state, action) => {
  switch (action.type) {
    case 'record/set': {
      const current = state[action.id];
      if (current && current.revision > action.entry.revision) return state;
      return { ...state, [action.id]: action.entry };
    }
    case 'records/clear':
      return {};
  }
}, {});

/** Fetches in flight, by job id, with the revision asked for. */
const loading = new Map<string, number>();
let generation = 0;

/** Keep a record the app already has (a save, a duplicate), saving a fetch. */
export function rememberJobRecord(job: JobRecord): void {
  recordsStore.dispatch({ type: 'record/set', id: job.id, entry: { revision: job.revision, job } });
}

/** Drop everything, e.g. when the whole job list is reloaded. */
export function clearJobRecords(): void {
  generation += 1;
  loading.clear();
  recordsStore.dispatch({ type: 'records/clear' });
}

function load(id: string, revision: number): void {
  const asked = loading.get(id);
  if (asked !== undefined && asked >= revision) return;
  loading.set(id, revision);
  const startedIn = generation;
  void getStorageClient()
    .getJob(id)
    .then(
      (job) => ({ revision: Math.max(job.revision, revision), job }),
      (error: unknown) => ({ revision, error: toStorageError(error).message }),
    )
    .then((entry: JobRecordEntry) => {
      if (startedIn !== generation) return;
      if (loading.get(id) === revision) loading.delete(id);
      recordsStore.dispatch({ type: 'record/set', id, entry });
    });
}

/**
 * The full record for a job at (at least) `revision`. While a newer one loads,
 * the older record is returned so drawings don't flicker.
 */
export function useJobRecord(id: string | undefined, revision: number | undefined): JobRecordEntry | undefined {
  const entry = useStore(recordsStore, (s) => (id ? s[id] : undefined));
  const stale = id !== undefined && revision !== undefined && (!entry || entry.revision < revision);
  useEffect(() => {
    if (stale && id !== undefined && revision !== undefined) load(id, revision);
  }, [stale, id, revision]);
  return entry;
}
