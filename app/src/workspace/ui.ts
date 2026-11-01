import type { PartRole, TraceKey } from '@kerfuffle/engine';
import { jobSession } from '../data/storage';
import { createStore, useStore } from '../state/createStore';
import type { Draft, FieldKey } from './calc';
import type { RevisionChanges } from './revision';

/**
 * Workspace UI state: selection, tracing, the field being typed, revision marks.
 * Kept apart from the job so pointing at things never triggers a save.
 *
 * Tracing (interaction-design §5.5): one trace key, hover beating focus, and
 * one hot part, hover (or a focused row button) beating the pin.
 */
export interface RevisionMarks {
  /** Revision counter, shown as △n. */
  rev: number;
  cabinetId: string;
  changes: RevisionChanges;
}

export interface WorkspaceUi {
  /** Null → the first cabinet. Read through selectedCabinetId(). */
  selectedId: string | null;
  hoverKey: TraceKey | null;
  focusKey: TraceKey | null;
  hoverPart: PartRole | null;
  focusPart: PartRole | null;
  pinPart: PartRole | null;
  /** The field being typed in, for "EDITING WIDTH". */
  editing: FieldKey | null;
  draft: Draft | null;
  marks: RevisionMarks | null;
  /** Counts commits, undos and redos in this job. */
  rev: number;
  /** Just added or duplicated: gets the blue sweep. */
  fresh: string | null;
  /** Sliding out before it's removed. */
  leaving: string | null;
  showDims: boolean;
  showOversize: boolean;
  constructionOpen: boolean;
  /** A field to focus once the editor shows it (Alt+↑/↓, Go to width, clicking a dimension). */
  focusRequest: { field: FieldKey; select: boolean; n: number } | null;
}

const INITIAL: WorkspaceUi = {
  selectedId: null,
  hoverKey: null,
  focusKey: null,
  hoverPart: null,
  focusPart: null,
  pinPart: null,
  editing: null,
  draft: null,
  marks: null,
  rev: 0,
  fresh: null,
  leaving: null,
  showDims: true,
  showOversize: false,
  constructionOpen: false,
  focusRequest: null,
};

export const workspaceUi = createStore<WorkspaceUi, Partial<WorkspaceUi>>((state, patch) => {
  for (const key of Object.keys(patch) as (keyof WorkspaceUi)[]) {
    if (!Object.is(state[key], patch[key])) return { ...state, ...patch };
  }
  return state;
}, INITIAL);

export const setUi = (patch: Partial<WorkspaceUi>) => workspaceUi.dispatch(patch);

export function useUi<T>(selector: (ui: WorkspaceUi) => T): T {
  return useStore(workspaceUi, selector);
}

export function resetUi(): void {
  workspaceUi.dispatch({ ...INITIAL });
}

/** The selected cabinet: the chosen one if it still exists, else the first. */
export function selectedCabinetId(): string | null {
  const cabinets = jobSession.getJob()?.cabinets ?? [];
  const chosen = workspaceUi.getState().selectedId;
  return cabinets.some((c) => c.id === chosen) ? chosen : (cabinets[0]?.id ?? null);
}

export function useSelectedCabinetId(): string | null {
  const cabinets = useStore(jobSession.store, (s) => s.job?.cabinets);
  const chosen = useUi((ui) => ui.selectedId);
  if (!cabinets) return null;
  return cabinets.some((c) => c.id === chosen) ? chosen : (cabinets[0]?.id ?? null);
}

/** Selecting a cabinet clears the pinned part, revision marks and any half-typed size. */
export function selectCabinet(id: string | null): void {
  if (id === selectedCabinetId() && id === workspaceUi.getState().selectedId) return;
  setUi({ selectedId: id, pinPart: null, hoverPart: null, focusPart: null, marks: null, draft: null });
}

export function requestFocus(field: FieldKey, select = true): void {
  setUi({ focusRequest: { field, select, n: (workspaceUi.getState().focusRequest?.n ?? 0) + 1 } });
}

export function traceKeyOf(ui: WorkspaceUi): TraceKey | null {
  return ui.hoverKey ?? ui.focusKey;
}

export function hotPartOf(ui: WorkspaceUi): PartRole | null {
  return ui.hoverPart ?? ui.focusPart ?? ui.pinPart;
}

/** Click a part (drawing shape or row button): pin it, or unpin it if it's pinned. */
export function togglePin(role: PartRole): void {
  const pinned = workspaceUi.getState().pinPart;
  setUi({ pinPart: pinned === role ? null : role });
}

/** Pointer handlers for anything that traces a key while hovered. */
export function hoverKeyHandlers(key: TraceKey) {
  return {
    onPointerEnter: () => setUi({ hoverKey: key }),
    onPointerLeave: () => {
      if (workspaceUi.getState().hoverKey === key) setUi({ hoverKey: null });
    },
  };
}

export function hoverPartHandlers(role: PartRole) {
  return {
    onPointerEnter: () => setUi({ hoverPart: role }),
    onPointerLeave: () => {
      if (workspaceUi.getState().hoverPart === role) setUi({ hoverPart: null });
    },
  };
}
