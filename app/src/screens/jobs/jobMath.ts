import { calculateParts, hasErrors, validate } from '@kerfuffle/engine';
import { cabinetSpec } from '../../data/jobSession';
import type { JobRecord } from '../../data/types';
import type { ElevationCabinet } from '../../lib/elevation';
import type { JobSummary } from '../../state/jobs';

export interface JobTotals {
  /** Physical boxes: cabinets × quantity. */
  boxes: number;
  /** Carcass panel pieces, quantities included. The Front is a reference size, not a box part, so it isn't counted. */
  panelPieces: number;
  laminatePieces: number;
  /** Labels of cabinets with errors; they produce no parts, so their pieces are missing from the totals. */
  invalid: string[];
}

/** Totals for the job preview, from the engine with the job's own rules. */
export function jobTotals(job: JobRecord): JobTotals {
  const totals: JobTotals = { boxes: 0, panelPieces: 0, laminatePieces: 0, invalid: [] };
  for (const cabinet of job.cabinets) {
    totals.boxes += Math.max(0, cabinet.quantity);
    const { parts, issues } = calculateParts(cabinetSpec(cabinet), job.rules);
    if (hasErrors(issues)) {
      totals.invalid.push(cabinet.label || 'A cabinet');
      continue;
    }
    for (const part of parts) {
      if (part.optional) continue;
      if (part.category === 'panel') totals.panelPieces += part.quantity;
      else totals.laminatePieces += part.quantity;
    }
  }
  return totals;
}

/**
 * Cabinets to draw. With the full record, cabinets that fail validation under
 * the job's rules are marked invalid; until it loads, the list outline is drawn.
 */
export function elevationCabinets(summary: JobSummary, record: JobRecord | undefined): ElevationCabinet[] {
  if (record) {
    return record.cabinets.map((c) => ({
      label: c.label,
      type: c.type,
      width: c.width,
      height: c.height,
      quantity: c.quantity,
      invalid: hasErrors(validate(cabinetSpec(c), record.rules)),
    }));
  }
  return summary.cabinets.map((c) => ({ ...c, invalid: false }));
}

/** Physical boxes from the list outline (no record needed). */
export function boxCount(summary: JobSummary): number {
  return summary.cabinets.reduce((n, c) => n + Math.max(0, c.quantity), 0);
}
