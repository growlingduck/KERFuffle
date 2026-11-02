import { validate } from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules, ValidationIssue } from '@kerfuffle/engine';
import { createStore } from '../state/createStore';
import type { Store } from '../state/createStore';
import type { StorageClient } from './client';
import { toStorageError } from './errors';
import { RULES_VERSION } from './rules';
import type { CabinetRecord, JobRecord, Saved } from './types';
import { toSnapshot } from './types';

/**
 * The open job, held in memory so the UI reads it synchronously, and saved
 * automatically.
 *
 * Commits (prompt 05 commits on blur/Enter, never per keystroke) go through
 * `commit`. Each commit:
 *   1. replaces the in-memory job at once;
 *   2. writes the job to the crash-recovery journal right away;
 *   3. schedules a save ~400 ms later. Commits inside that window coalesce
 *      into one save: one transaction and one revision.
 * All storage calls run one at a time, in order, so a save never overtakes
 * a journal write.
 *
 * The job's rules change only when its construction is changed (a draft
 * only). They go to the database only while they differ from what it holds.
 */

export type SaveState =
  | { kind: 'saved'; at: string }
  | { kind: 'saving' }
  | { kind: 'error'; message: string; retry: () => void };

export interface JobSessionState {
  jobId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'failed';
  job: JobRecord | null;
  /** Why loading failed, when status is 'failed'. */
  loadError: string | null;
  /** For the header's Saved cell. Null until a job is ready. */
  save: SaveState | null;
  /**
   * Engine validation by cabinet id. Only cabinets with issues appear. Invalid
   * cabinets are still saved, so a field can be left invalid and fixed later.
   */
  issues: Readonly<Record<string, readonly ValidationIssue[]>>;
}

export interface JobSessionOptions {
  client: StorageClient | (() => StorageClient);
  /** Quiet time after the last commit before saving. */
  debounceMs?: number;
  /** "Saving…" appears only if a save takes longer than this. */
  savingIndicatorMs?: number;
  /** Called after each successful save with the job as saved. */
  onSaved?: (job: JobRecord) => void;
}

export interface JobSession {
  store: Store<JobSessionState, Partial<JobSessionState>>;
  getState(): JobSessionState;
  /** The open job, or null. Synchronous. */
  getJob(): JobRecord | null;
  /** Load a job, first saving anything pending for the current one. */
  open(id: string): Promise<void>;
  /** Replace the open job's editable contents (and, for a draft, its rules) and schedule a save. */
  commit(next: JobRecord | ((job: JobRecord) => JobRecord)): void;
  /** Save now and wait until every pending write has finished. Never rejects. */
  flush(): Promise<void>;
  /** True while a commit hasn't reached the database yet. */
  hasUnsavedChanges(): boolean;
  /** Save pending work, then forget the job. */
  close(): Promise<void>;
  /** Drop timers without saving (tests simulate a crash with this). */
  dispose(): void;
}

const EMPTY: JobSessionState = { jobId: null, status: 'idle', job: null, loadError: null, save: null, issues: {} };

export function cabinetSpec(cabinet: CabinetRecord): CabinetSpec {
  return {
    id: cabinet.label,
    type: cabinet.type,
    width: cabinet.width,
    height: cabinet.height,
    depth: cabinet.depth,
    shelfCount: cabinet.shelfCount,
    finishedEnds: cabinet.finishedEnds,
    quantity: cabinet.quantity,
    ...(cabinet.run ? { run: cabinet.run } : {}),
  };
}

export function validateJob(job: JobRecord): Record<string, ValidationIssue[]> {
  const issues: Record<string, ValidationIssue[]> = {};
  for (const cabinet of job.cabinets) {
    const found = validate(cabinetSpec(cabinet), job.rules);
    if (found.length > 0) issues[cabinet.id] = found;
  }
  return issues;
}

/**
 * The rules a commit may leave the job with. Only the construction method may
 * change, and only while the job is (or becomes) a draft, as the database
 * enforces; anything else keeps the rules the job has.
 */
function committedRules(current: JobRecord, proposed: JobRecord): ConstructionRules {
  if (proposed.rules === current.rules) return current.rules;
  const draft = current.status === 'draft' || proposed.status === 'draft';
  const keys = Object.keys(current.rules) as (keyof ConstructionRules)[];
  const onlyMethod = keys.every((key) => key === 'method' || current.rules[key] === proposed.rules[key]);
  return draft && onlyMethod ? proposed.rules : current.rules;
}

export function createJobSession(options: JobSessionOptions): JobSession {
  const debounceMs = options.debounceMs ?? 400;
  const savingIndicatorMs = options.savingIndicatorMs ?? 300;
  const client = () => (typeof options.client === 'function' ? options.client() : options.client);

  const store = createStore<JobSessionState, Partial<JobSessionState>>((state, patch) => ({ ...state, ...patch }), EMPTY);
  const set = (patch: Partial<JobSessionState>) => store.dispatch(patch);

  let dirty = false;
  let journalQueued = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let tail: Promise<void> = Promise.resolve();
  let disposed = false;
  /** The rules the database holds for the open job; a different object means they changed. */
  let storedRules: ConstructionRules | null = null;

  /** Run storage work strictly one after another. Tasks handle their own errors. */
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    tail = tail.then(task).catch((error: unknown) => console.error('Job storage task failed', error));
    return tail;
  };

  const writeJournal = async () => {
    journalQueued = false;
    const job = store.getState().job;
    if (!dirty || !job || disposed) return;
    try {
      await client().writePendingEdit(toSnapshot(job, job.rules !== storedRules), job.revision);
    } catch (error) {
      // The save that follows reports the problem; the journal is only insurance.
      console.warn('Could not write the recovery journal', toStorageError(error));
    }
  };

  const save = async () => {
    const job = store.getState().job;
    if (!dirty || !job || disposed) return;
    const jobId = job.id;
    const sentRules = job.rules !== storedRules ? job.rules : null;
    dirty = false;
    const indicator = setTimeout(() => {
      if (store.getState().jobId === jobId) set({ save: { kind: 'saving' } });
    }, savingIndicatorMs);
    let saved: Saved;
    try {
      saved = await client().saveJob(toSnapshot(job, sentRules !== null));
    } catch (error) {
      clearTimeout(indicator);
      if (store.getState().jobId !== jobId) return;
      dirty = true;
      set({ save: { kind: 'error', message: toStorageError(error).message, retry: () => void session.flush() } });
      return;
    }
    clearTimeout(indicator);
    const current = store.getState();
    if (current.jobId !== jobId || !current.job) return;
    // Rules written by this save are stored in the current shape from now on.
    const version = sentRules !== null ? { rulesVersion: RULES_VERSION } : {};
    if (sentRules !== null) storedRules = sentRules;
    const updated = { ...current.job, ...version, revision: saved.revision, updatedAt: saved.updatedAt };
    set({ job: updated, save: { kind: 'saved', at: saved.updatedAt } });
    options.onSaved?.({ ...job, ...version, revision: saved.revision, updatedAt: saved.updatedAt });
  };

  const cancelTimer = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
  };

  const session: JobSession = {
    store,
    getState: store.getState,
    getJob: () => store.getState().job,

    async open(id) {
      const state = store.getState();
      if (state.jobId === id && state.status !== 'failed') return;
      await session.flush();
      set({ ...EMPTY, jobId: id, status: 'loading' });
      try {
        const job = await client().getJob(id);
        if (store.getState().jobId !== id) return;
        storedRules = job.rules;
        set({ status: 'ready', job, save: { kind: 'saved', at: job.updatedAt }, issues: validateJob(job) });
      } catch (error) {
        if (store.getState().jobId !== id) return;
        const e = toStorageError(error);
        set(e.kind === 'notFound' ? { status: 'missing' } : { status: 'failed', loadError: e.message });
      }
    },

    commit(next) {
      const current = store.getState().job;
      if (!current || disposed) return;
      const proposed = typeof next === 'function' ? next(current) : next;
      if (proposed === current) return;
      // The database owns these; an edit (or an undo to an older copy) never
      // changes them. A draft's construction method may change; the save says so.
      const job: JobRecord = {
        ...proposed,
        id: current.id,
        number: current.number,
        rules: committedRules(current, proposed),
        rulesVersion: current.rulesVersion,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        revision: current.revision,
      };
      dirty = true;
      set({ job, issues: validateJob(job) });
      if (!journalQueued) {
        journalQueued = true;
        void enqueue(writeJournal);
      }
      cancelTimer();
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void enqueue(save);
      }, debounceMs);
    },

    flush() {
      cancelTimer();
      return dirty ? enqueue(save) : enqueue(async () => {});
    },

    hasUnsavedChanges: () => dirty,

    async close() {
      await session.flush();
      set(EMPTY);
    },

    dispose() {
      disposed = true;
      cancelTimer();
    },
  };
  return session;
}
