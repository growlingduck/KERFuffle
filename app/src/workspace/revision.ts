import type { Part, PartField, PartRole } from '@kerfuffle/engine';
import { displayInches, INCH } from '../lib/dimensions';

/** How one part changed in a commit, undo or redo (interaction-design §5.6). */
export interface PartChange {
  fields: readonly PartField[];
  /** The part before the change; null when it's new. */
  was: Part | null;
}

export type RevisionChanges = Partial<Record<PartRole, PartChange>>;

/** Compare two parts lists of the same cabinet by role. Only parts in `after` can be marked. */
export function diffParts(before: readonly Part[], after: readonly Part[]): RevisionChanges {
  const old = new Map(before.map((p) => [p.role, p]));
  const out: RevisionChanges = {};
  for (const part of after) {
    const was = old.get(part.role);
    if (!was) {
      out[part.role] = { fields: ['L', 'W', 'T', 'qty'], was: null };
      continue;
    }
    const fields: PartField[] = [];
    if (was.length !== part.length) fields.push('L');
    if (was.width !== part.width) fields.push('W');
    if (was.thickness !== part.thickness) fields.push('T');
    if (was.quantity !== part.quantity) fields.push('qty');
    if (fields.length > 0) out[part.role] = { fields, was };
  }
  return out;
}

/** Shop display without the inch mark, as in the parts table: `28 1/4`, `≈3/4`. */
export function tableInches(value: Part['length']): string {
  return displayInches(value).replace(INCH, '');
}

/** "Was 28 1/4 × 23 1/8 × 3/4, qty 1" for the △n tooltip. */
export function wasText(change: PartChange): string {
  const was = change.was;
  if (!was) return 'New part';
  const thickness = was.thickness === null ? '' : ` × ${tableInches(was.thickness)}`;
  return `Was ${tableInches(was.length)} × ${tableInches(was.width)}${thickness}, qty ${was.quantity}`;
}
