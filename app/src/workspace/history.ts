import { jobSession } from '../data/storage';
import type { JobRecord } from '../data/types';
import { createStore, useStore } from '../state/createStore';
import { cabinetSpec } from '../data/jobSession';
import { prefersReducedMotion } from '../motion';
import { jobsStore } from '../state/jobs';
import { showToast } from '../state/toast';
import { calculate } from './calc';
import { applyCommand } from './commands';
import type { Command, JobContent } from './commands';
import { diffParts } from './revision';
import { resetUi, selectedCabinetId, setUi, workspaceUi } from './ui';

/**
 * Undo history for the open job: in memory, last 100 steps, cleared when another
 * job is opened or the job is closed. Every command, undo and redo goes through
 * `commitContent`, which saves (jobSession: journal now, save debounced) and
 * records revision marks. One path for all three.
 */

export const HISTORY_LIMIT = 100;
/** Revision marks (△n) stay this long, then fade (interaction-design §5.6). */
export const MARK_MS = 4000;

export interface HistoryEntry {
  id: number;
  label: string;
  before: JobContent;
  after: JobContent;
  selectBefore: string | null;
  selectAfter: string | null;
}

export interface HistoryState {
  jobId: string | null;
  past: readonly HistoryEntry[];
  future: readonly HistoryEntry[];
}

const EMPTY: HistoryState = { jobId: null, past: [], future: [] };

export const historyStore = createStore<HistoryState, HistoryState>((_state, next) => next, EMPTY);

let nextEntryId = 1;
let markTimer: ReturnType<typeof setTimeout> | null = null;

// A different job (or none) means the old history no longer applies.
jobSession.store.subscribe(() => {
  const jobId = jobSession.getState().jobId;
  if (historyStore.getState().jobId === jobId) return;
  historyStore.dispatch({ ...EMPTY, jobId });
  if (markTimer !== null) clearTimeout(markTimer);
  resetUi();
});

function contentOf(job: JobRecord): JobContent {
  return { cabinets: job.cabinets, status: job.status, rules: job.rules };
}

function partsOf(content: JobContent, cabinetId: string) {
  const cabinet = content.cabinets.find((c) => c.id === cabinetId);
  return cabinet ? calculate(cabinetSpec(cabinet), content.rules).parts : null;
}

/**
 * Replace the job's contents, select a cabinet and mark what changed on it.
 * Marks only appear when the same cabinet stays selected and it was valid both
 * before and after; a new selection starts clean.
 */
function commitContent(job: JobRecord, next: JobContent, select: string | null): void {
  const selectedBefore = selectedCabinetId();
  jobSession.commit((current) => ({ ...current, cabinets: next.cabinets, status: next.status, rules: next.rules }));
  if (next.status !== job.status) jobsStore.dispatch({ type: 'job/statusChanged', id: job.id, status: next.status });

  const ui = workspaceUi.getState();
  const rev = ui.rev + 1;
  const target = next.cabinets.some((c) => c.id === select) ? select : (next.cabinets[0]?.id ?? null);
  if (target !== selectedBefore || target === null) {
    setUi({ rev, selectedId: target, marks: null, pinPart: null, hoverPart: null, focusPart: null, draft: null });
    return;
  }
  const before = partsOf(contentOf(job), target);
  const after = partsOf(next, target);
  const changes = before && after && before.length > 0 && after.length > 0 ? diffParts(before, after) : {};
  const marks = Object.keys(changes).length > 0 ? { rev, cabinetId: target, changes } : null;
  setUi({ rev, selectedId: target, marks });
  if (markTimer !== null) clearTimeout(markTimer);
  if (marks) {
    markTimer = setTimeout(() => {
      if (workspaceUi.getState().marks?.rev === rev) setUi({ marks: null });
    }, MARK_MS);
  }
}

/** Run a command on the open job. Returns its history entry, or null when nothing changed. */
export function runCommand(command: Command): HistoryEntry | null {
  const job = jobSession.getJob();
  if (!job) return null;
  const before = contentOf(job);
  const result = applyCommand(before, command);
  if (!result) return null;
  const selectBefore = selectedCabinetId();
  const selectAfter = result.select !== undefined ? result.select : selectBefore;
  const entry: HistoryEntry = { id: nextEntryId++, label: result.label, before, after: result.content, selectBefore, selectAfter };
  const history = historyStore.getState();
  historyStore.dispatch({ jobId: job.id, past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] });
  commitContent(job, result.content, selectAfter);
  return entry;
}

export function undo(): HistoryEntry | null {
  const job = jobSession.getJob();
  const history = historyStore.getState();
  const entry = history.past[history.past.length - 1];
  if (!job || !entry) return null;
  historyStore.dispatch({ ...history, past: history.past.slice(0, -1), future: [entry, ...history.future] });
  commitContent(job, entry.before, entry.selectBefore);
  return entry;
}

export function redo(): HistoryEntry | null {
  const job = jobSession.getJob();
  const history = historyStore.getState();
  const entry = history.future[0];
  if (!job || !entry) return null;
  historyStore.dispatch({ ...history, past: [...history.past, entry].slice(-HISTORY_LIMIT), future: history.future.slice(1) });
  commitContent(job, entry.after, entry.selectAfter);
  return entry;
}

/** Undo `entry` only if it's still the latest step (a toast's Undo after more edits does nothing). */
export function undoIfLatest(entry: HistoryEntry): boolean {
  const past = historyStore.getState().past;
  if (past[past.length - 1]?.id !== entry.id) return false;
  undo();
  return true;
}

/** Undo from the header or Ctrl+Z, with a toast naming the step. */
export function undoWithToast(): void {
  const entry = undo();
  if (entry) showToast(`Undid: ${entry.label}`);
}

export function redoWithToast(): void {
  const entry = redo();
  if (entry) showToast(`Redid: ${entry.label}`);
}

export function canUndo(): boolean {
  return historyStore.getState().past.length > 0;
}

export function canRedo(): boolean {
  return historyStore.getState().future.length > 0;
}

/** Label of the step Undo / Redo would take, or null. */
export function useUndoLabel(): string | null {
  return useStore(historyStore, (h) => h.past[h.past.length - 1]?.label ?? null);
}

export function useRedoLabel(): string | null {
  return useStore(historyStore, (h) => h.future[0]?.label ?? null);
}

/** Slide-out time for a removed row before it leaves the list (§5.2). */
export const ROW_EXIT_MS = 180;

/** Remove with the slide-out, then run the command. Resolves to the entry for the toast's Undo. */
export function removeWithExit(cabinetId: string, done: (entry: HistoryEntry | null) => void): void {
  if (workspaceUi.getState().leaving) return;
  setUi({ leaving: cabinetId });
  setTimeout(
    () => {
      setUi({ leaving: null });
      done(runCommand({ type: 'removeCabinet', cabinetId }));
    },
    prefersReducedMotion() ? 0 : ROW_EXIT_MS,
  );
}
