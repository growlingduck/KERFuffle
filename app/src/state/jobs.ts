import type { CabinetOutline, JobListItem, JobRecord, JobStatus } from '../data/types';
import { formatJobNumber } from '../data/types';
import { createStore, useStore } from './createStore';

export type { JobStatus } from '../data/types';
export { JOB_STATUSES } from '../data/types';

/** Header and register data for a job, loaded from the job database. */
export interface JobSummary {
  id: string;
  /** Drawing number shown in the register, e.g. J-0014. */
  number: string;
  /** The same number as stored, e.g. 14. */
  numberValue: number;
  name: string;
  customer: string;
  notes: string;
  status: JobStatus;
  /** ISO timestamp of the last successful save, or null while unsaved. */
  savedAt: string | null;
  /** Database revision this summary was read at; keys the full-record cache (state/jobRecords.ts). */
  revision: number;
  /** Sizes for the register's elevation strip, in list order. */
  cabinets: CabinetOutline[];
}

export interface JobsState {
  jobs: Record<string, JobSummary>;
  /** Job opened most recently; Ctrl+2 / Ctrl+3 go to its workspace and cut list. */
  lastJobId: string | null;
}

export type JobsAction =
  | { type: 'jobs/loaded'; jobs: JobSummary[] }
  | { type: 'job/upserted'; job: JobSummary }
  | { type: 'job/removed'; id: string }
  | { type: 'job/opened'; id: string }
  | { type: 'job/statusChanged'; id: string; status: JobStatus };

export function summarize(job: JobListItem | JobRecord): JobSummary {
  return {
    id: job.id,
    number: formatJobNumber(job.number),
    numberValue: job.number,
    name: job.name,
    customer: job.customer ?? '',
    notes: job.notes ?? '',
    status: job.status,
    savedAt: job.updatedAt,
    revision: job.revision,
    cabinets: job.cabinets.map(({ label, type, width, height, depth, quantity }) => ({ label, type, width, height, depth, quantity })),
  };
}

export function jobsReducer(state: JobsState, action: JobsAction): JobsState {
  switch (action.type) {
    case 'jobs/loaded': {
      const jobs = Object.fromEntries(action.jobs.map((job) => [job.id, job]));
      const lastJobId = state.lastJobId && jobs[state.lastJobId] ? state.lastJobId : null;
      return { jobs, lastJobId };
    }
    case 'job/upserted':
      return { ...state, jobs: { ...state.jobs, [action.job.id]: action.job } };
    case 'job/removed': {
      if (!state.jobs[action.id]) return state;
      const jobs = Object.fromEntries(Object.entries(state.jobs).filter(([id]) => id !== action.id));
      return { jobs, lastJobId: state.lastJobId === action.id ? null : state.lastJobId };
    }
    case 'job/opened':
      if (!state.jobs[action.id] || state.lastJobId === action.id) return state;
      return { ...state, lastJobId: action.id };
    case 'job/statusChanged': {
      const job = state.jobs[action.id];
      if (!job || job.status === action.status) return state;
      return { ...state, jobs: { ...state.jobs, [action.id]: { ...job, status: action.status } } };
    }
  }
}

/** Empty until the job list loads at startup (data/storage.ts). */
export const jobsStore = createStore(jobsReducer, { jobs: {}, lastJobId: null });

export function useJob(id: string | undefined): JobSummary | undefined {
  return useStore(jobsStore, (s) => (id ? s.jobs[id] : undefined));
}

export function useLastJobId(): string | null {
  return useStore(jobsStore, (s) => s.lastJobId);
}
