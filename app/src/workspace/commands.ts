import { CONSTRUCTION_NAMES } from '@kerfuffle/engine';
import type { CabinetType, ConstructionChoice, FinishedEnds, Ticks } from '@kerfuffle/engine';
import { STATUS_INFO } from '../components/Stamp';
import type { CabinetRecord, JobRecord, JobStatus } from '../data/types';
import { nextLabel } from './cabinets';
import { constructionLocked, withConstruction } from './construction';

/**
 * Domain commands for the job workspace. Every user change is one of these.
 * Each produces the job's next contents plus a human label ("Change width on
 * B1"), so undo/redo, autosave and revision marks share one path (history.ts).
 *
 * Reducers are pure: anything random (a new cabinet's id) comes in the command.
 */

/** The parts of a job the workspace edits. Rules change only with the construction, in a draft. */
export type JobContent = Pick<JobRecord, 'cabinets' | 'status' | 'rules' | 'name' | 'customer' | 'notes'>;

/** The job's own details, as the Job details dialog edits them. */
export type JobDetails = Pick<JobRecord, 'name' | 'customer' | 'notes' | 'status'>;

export type DimensionField = 'width' | 'height' | 'depth';

export type Command =
  | { type: 'setDimension'; cabinetId: string; field: DimensionField; value: Ticks }
  | { type: 'setType'; cabinetId: string; value: CabinetType }
  | { type: 'setShelves'; cabinetId: string; value: number }
  /** Tall cabinets only. */
  | { type: 'setFixedShelves'; cabinetId: string; value: number }
  | { type: 'setMidNailer'; cabinetId: string; value: boolean }
  | { type: 'setSplitBack'; cabinetId: string; value: boolean }
  | { type: 'setQuantity'; cabinetId: string; value: number }
  | { type: 'setFinishedEnds'; cabinetId: string; value: FinishedEnds }
  | { type: 'renameCabinet'; cabinetId: string; label: string }
  /** Null or blank: no run (the cabinet gets its own base). */
  | { type: 'setRun'; cabinetId: string; run: string | null }
  | { type: 'setConstruction'; choice: ConstructionChoice }
  | { type: 'addCabinet'; cabinet: CabinetRecord }
  | { type: 'duplicateCabinet'; cabinetId: string; newId: string }
  | { type: 'removeCabinet'; cabinetId: string }
  | { type: 'reorderCabinet'; cabinetId: string; toIndex: number }
  | { type: 'setStatus'; status: JobStatus }
  /** Name, customer, notes and status as one step. Blank customer or notes are cleared; a blank name is refused. */
  | { type: 'setDetails'; details: JobDetails };

export interface CommandResult {
  content: JobContent;
  /** For the Undo / Redo tooltips, e.g. "Change width on B1". */
  label: string;
  /** Cabinet to select afterwards, when the command changes the selection. */
  select?: string | null;
}

const FIELD_NAME: Record<DimensionField, string> = { width: 'width', height: 'height', depth: 'depth' };

/** Name used in labels; a blank label still needs to read as something. */
function named(cabinet: CabinetRecord): string {
  return cabinet.label.trim() || 'the unnamed cabinet';
}

function patchCabinet(
  content: JobContent,
  cabinetId: string,
  patch: (c: CabinetRecord) => Partial<CabinetRecord>,
  label: (c: CabinetRecord) => string,
): CommandResult | null {
  const index = content.cabinets.findIndex((c) => c.id === cabinetId);
  const cabinet = content.cabinets[index];
  if (!cabinet) return null;
  const changes = patch(cabinet);
  const next = { ...cabinet, ...changes };
  if ((Object.keys(changes) as (keyof CabinetRecord)[]).every((k) => Object.is(next[k], cabinet[k]))) return null;
  const cabinets = [...content.cabinets];
  cabinets[index] = next;
  return { content: { ...content, cabinets }, label: label(cabinet) };
}

/** Apply a command. Null when it would change nothing (no undo step, no save). */
export function applyCommand(content: JobContent, command: Command): CommandResult | null {
  switch (command.type) {
    case 'setDimension':
      return patchCabinet(
        content,
        command.cabinetId,
        () => ({ [command.field]: command.value }),
        (c) => `Change ${FIELD_NAME[command.field]} on ${named(c)}`,
      );
    case 'setType':
      // The height stays as typed: a 36″ base becomes a 36″ wall cabinet. The
      // tall-only values stay too (ignored), so switching back restores them.
      return patchCabinet(
        content,
        command.cabinetId,
        () => ({ type: command.value }),
        (c) => `Make ${named(c)} a ${command.value} cabinet`,
      );
    case 'setShelves':
      if (!Number.isInteger(command.value) || command.value < 0) return null;
      return patchCabinet(content, command.cabinetId, () => ({ shelfCount: command.value }), (c) => `Change shelves on ${named(c)}`);
    case 'setFixedShelves':
      if (!Number.isInteger(command.value) || command.value < 0) return null;
      return patchCabinet(
        content,
        command.cabinetId,
        (c) => ((c.fixedShelfCount ?? 0) === command.value ? {} : { fixedShelfCount: command.value }),
        (c) => `Change fixed shelves on ${named(c)}`,
      );
    case 'setMidNailer':
      return patchCabinet(
        content,
        command.cabinetId,
        (c) => ((c.midNailer ?? false) === command.value ? {} : { midNailer: command.value }),
        (c) => `${command.value ? 'Add' : 'Remove'} the mid nailer on ${named(c)}`,
      );
    case 'setSplitBack':
      return patchCabinet(
        content,
        command.cabinetId,
        (c) => ((c.splitBack ?? false) === command.value ? {} : { splitBack: command.value }),
        (c) => `${command.value ? 'Split' : 'Join'} the back on ${named(c)}`,
      );
    case 'setQuantity':
      if (!Number.isInteger(command.value) || command.value < 1) return null;
      return patchCabinet(content, command.cabinetId, () => ({ quantity: command.value }), (c) => `Change quantity on ${named(c)}`);
    case 'setFinishedEnds':
      return patchCabinet(
        content,
        command.cabinetId,
        () => ({ finishedEnds: command.value }),
        (c) => `Change finished ends on ${named(c)}`,
      );
    case 'renameCabinet': {
      const label = command.label.trim();
      return patchCabinet(
        content,
        command.cabinetId,
        () => ({ label }),
        (c) => (label ? `Rename ${named(c)} to ${label}` : `Clear the ID of ${named(c)}`),
      );
    }
    case 'setRun': {
      const run = command.run?.trim() || null;
      return patchCabinet(
        content,
        command.cabinetId,
        // A cabinet saved before runs has no run at all; that's the same as none.
        (c) => (run === (c.run ?? null) ? {} : { run }),
        (c) => (run ? `Put ${named(c)} in run ${run}` : `Take ${named(c)} out of its run`),
      );
    }
    case 'setConstruction': {
      if (constructionLocked(content.status)) return null;
      const rules = withConstruction(content.rules, command.choice);
      if (rules === content.rules) return null;
      return { content: { ...content, rules }, label: `Change construction to ${CONSTRUCTION_NAMES[command.choice].short}` };
    }
    case 'addCabinet': {
      if (content.cabinets.some((c) => c.id === command.cabinet.id)) return null;
      return {
        content: { ...content, cabinets: [...content.cabinets, command.cabinet] },
        label: `Add ${named(command.cabinet)}`,
        select: command.cabinet.id,
      };
    }
    case 'duplicateCabinet': {
      const index = content.cabinets.findIndex((c) => c.id === command.cabinetId);
      const source = content.cabinets[index];
      if (!source || content.cabinets.some((c) => c.id === command.newId)) return null;
      const copy: CabinetRecord = { ...source, id: command.newId, label: nextLabel(content.cabinets, source.type) };
      const cabinets = [...content.cabinets];
      cabinets.splice(index + 1, 0, copy);
      return { content: { ...content, cabinets }, label: `Duplicate ${named(source)} as ${copy.label}`, select: copy.id };
    }
    case 'removeCabinet': {
      // A job keeps at least one cabinet.
      if (content.cabinets.length <= 1) return null;
      const index = content.cabinets.findIndex((c) => c.id === command.cabinetId);
      const gone = content.cabinets[index];
      if (!gone) return null;
      const cabinets = content.cabinets.filter((c) => c.id !== gone.id);
      const neighbor = cabinets[Math.min(index, cabinets.length - 1)];
      return { content: { ...content, cabinets }, label: `Remove ${named(gone)}`, select: neighbor?.id ?? null };
    }
    case 'reorderCabinet': {
      const from = content.cabinets.findIndex((c) => c.id === command.cabinetId);
      const moving = content.cabinets[from];
      if (!moving) return null;
      const to = Math.min(Math.max(0, Math.trunc(command.toIndex)), content.cabinets.length - 1);
      if (to === from) return null;
      const cabinets = [...content.cabinets];
      cabinets.splice(from, 1);
      cabinets.splice(to, 0, moving);
      return { content: { ...content, cabinets }, label: `Move ${named(moving)}` };
    }
    case 'setStatus':
      if (command.status === content.status) return null;
      return { content: { ...content, status: command.status }, label: `Mark job ${STATUS_INFO[command.status].label.toLowerCase()}` };
    case 'setDetails': {
      const details = cleanDetails(command.details);
      const label = detailsChangeLabel(content, details);
      return label ? { content: { ...content, ...details }, label } : null;
    }
  }
}

/**
 * The step's name for changing a job's details, e.g. "Rename job to Kitchen".
 * Null when nothing would change or the new name is blank. `next` is cleaned.
 */
export function detailsChangeLabel(before: JobDetails, next: JobDetails): string | null {
  if (next.name === '') return null;
  const changed = (['name', 'customer', 'notes', 'status'] as const).filter((k) => next[k] !== (before[k] ?? null));
  return changed.length === 0 ? null : detailsLabel(changed, next);
}

/** Trimmed, with blank customer and notes stored as none. */
export function cleanDetails(details: JobDetails): JobDetails {
  return {
    name: details.name.trim(),
    customer: details.customer?.trim() || null,
    notes: details.notes?.trim() || null,
    status: details.status,
  };
}

function detailsLabel(changed: readonly (keyof JobDetails)[], details: JobDetails): string {
  if (changed.length > 1) return 'Edit job details';
  switch (changed[0]) {
    case 'name':
      return `Rename job to ${details.name}`;
    case 'customer':
      return details.customer ? `Change customer to ${details.customer}` : 'Clear the customer';
    case 'notes':
      return 'Edit job notes';
    default:
      return `Mark job ${STATUS_INFO[details.status].label.toLowerCase()}`;
  }
}
