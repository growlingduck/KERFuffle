import type { JobStatus } from '../data/types';
import { createStore } from './createStore';
import type { JobSummary } from './jobs';

/**
 * How the Jobs register is being viewed. Session only: kept in memory so the
 * search, filter and sort survive opening a job and coming back, and reset
 * when the app restarts.
 */
export type RegisterFilter = 'active' | 'all' | 'archived';
export type RegisterSortKey = 'name' | 'status' | 'edited';
export type SortDirection = 1 | -1;

export interface RegisterView {
  query: string;
  filter: RegisterFilter;
  sort: RegisterSortKey;
  dir: SortDirection;
}

export const DEFAULT_REGISTER_VIEW: RegisterView = { query: '', filter: 'active', sort: 'edited', dir: -1 };

/** A header's first click: names A→Z and statuses Draft→Archived, but newest edits first. */
const FIRST_DIRECTION: Record<RegisterSortKey, SortDirection> = { name: 1, status: 1, edited: -1 };

const STATUS_ORDER: Record<JobStatus, number> = { draft: 0, ready: 1, completed: 2, archived: 3 };

type RegisterAction = { type: 'register/set'; patch: Partial<RegisterView> } | { type: 'register/reset' };

export const registerView = createStore<RegisterView, RegisterAction>((state, action) => {
  switch (action.type) {
    case 'register/set': {
      const next = { ...state, ...action.patch };
      return (Object.keys(next) as (keyof RegisterView)[]).every((k) => next[k] === state[k]) ? state : next;
    }
    case 'register/reset':
      return DEFAULT_REGISTER_VIEW;
  }
}, DEFAULT_REGISTER_VIEW);

export function setRegisterView(patch: Partial<RegisterView>): void {
  registerView.dispatch({ type: 'register/set', patch });
}

/** Clicking a sortable header: the same column flips direction, a new one starts at its natural direction. */
export function toggleSort(view: RegisterView, key: RegisterSortKey): Pick<RegisterView, 'sort' | 'dir'> {
  return view.sort === key ? { sort: key, dir: view.dir === 1 ? -1 : 1 } : { sort: key, dir: FIRST_DIRECTION[key] };
}

/** Window scroll position of the register, restored when coming back from a job. Not in the store: it changes on every scroll. */
let scrollY = 0;
export const registerScroll = {
  get: () => scrollY,
  set: (y: number) => {
    scrollY = y;
  },
};

/** Forget the session's view (tests). */
export function resetRegisterView(): void {
  registerView.dispatch({ type: 'register/reset' });
  scrollY = 0;
}

export function inFilter(status: JobStatus, filter: RegisterFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'archived' ? status === 'archived' : status !== 'archived';
}

export function filterCounts(jobs: readonly JobSummary[]): Record<RegisterFilter, number> {
  const archived = jobs.filter((j) => j.status === 'archived').length;
  return { active: jobs.length - archived, all: jobs.length, archived };
}

/** Case-insensitive matcher for the search text, or null when the search is empty. */
export function searchPattern(query: string): RegExp | null {
  const q = query.trim();
  if (q === '') return null;
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
}

export function matchesSearch(job: JobSummary, pattern: RegExp | null): boolean {
  return !pattern || [job.name, job.customer, job.number].some((text) => pattern.test(text));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byEditedDesc = (a: JobSummary, b: JobSummary) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || b.numberValue - a.numberValue;

function compare(view: RegisterView): (a: JobSummary, b: JobSummary) => number {
  switch (view.sort) {
    case 'name':
      return (a, b) => view.dir * collator.compare(a.name, b.name) || b.numberValue - a.numberValue;
    case 'status':
      return (a, b) => view.dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || byEditedDesc(a, b);
    case 'edited':
      return (a, b) => -view.dir * byEditedDesc(a, b);
  }
}

/**
 * The register's rows: filtered by Show and the search, then sorted. Jobs in
 * `keep` stay listed even if their status no longer fits the filter, so a row
 * can slide out before it disappears.
 */
export function visibleJobs(jobs: readonly JobSummary[], view: RegisterView, keep: ReadonlySet<string> = new Set()): JobSummary[] {
  const pattern = searchPattern(view.query);
  return jobs
    .filter((j) => (inFilter(j.status, view.filter) || keep.has(j.id)) && matchesSearch(j, pattern))
    .sort(compare(view));
}
