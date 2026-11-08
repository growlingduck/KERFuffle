import type { CutListTotals, Estimate } from '@kerfuffle/engine';
import { formatMoney } from '../data/materials';

/** The three pages of a job's output, as the Output screen's tabs. */
export type OutputView = 'cutlist' | 'layouts' | 'estimate';

export const OUTPUT_NAMES: Record<OutputView, string> = { cutlist: 'Cut list', layouts: 'Layouts', estimate: 'Estimate' };

export const OUTPUT_VIEWS = (['cutlist', 'layouts', 'estimate'] as const).map((value) => ({ value, label: OUTPUT_NAMES[value] }));

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export interface LayoutsSummary {
  /** Materials with parts to lay out. */
  materials: number;
  /** Every material's layout has finished. */
  ready: boolean;
  /** Sheets across those layouts (counted once ready). */
  sheets: number;
}

/**
 * The line under each tab, so the tabs read as three pages of the same job:
 * "43 boxes · 539 pieces", "44 sheets", "$2,340.00".
 */
export function outputSummaries(totals: CutListTotals, layouts: LayoutsSummary, estimate: Estimate): Record<OutputView, string> {
  const pieces = totals.panelPieces + (totals.lumberPieces ?? 0) + totals.laminatePieces;
  const sheets =
    layouts.materials === 0
      ? 'Nothing to lay out'
      : !layouts.ready
        ? 'Laying out…'
        : plural(layouts.sheets, 'sheet') + (layouts.materials > 1 ? ` · ${layouts.materials} materials` : '');
  return {
    cutlist: totals.boxes === 0 ? 'No cabinets yet' : `${plural(totals.boxes, 'box', 'boxes')} · ${plural(pieces, 'piece')}`,
    layouts: sheets,
    estimate: estimate.total.cost === null ? 'Total incomplete' : formatMoney(estimate.total.cost),
  };
}
