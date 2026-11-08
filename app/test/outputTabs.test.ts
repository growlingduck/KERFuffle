import { describe, expect, it } from 'vitest';
import type { Estimate } from '@kerfuffle/engine';
import { outputSummaries } from '../src/cutlist/outputTabs';

const totals = { boxes: 43, panelPieces: 480, laminatePieces: 59, distinctCuts: 166 };
const estimate = (cost: number | null) => ({ options: {}, lines: [], total: { cost, unpriced: 0, unassigned: [] } }) as unknown as Estimate;

describe('the line under each Output tab', () => {
  it('says what each page holds', () => {
    expect(outputSummaries(totals, { materials: 1, ready: true, sheets: 44 }, estimate(234000))).toEqual({
      cutlist: '43 boxes · 539 pieces',
      layouts: '44 sheets',
      estimate: '$2,340.00',
    });
  });

  it('counts materials when there is more than one, and says when layouts are still coming', () => {
    expect(outputSummaries(totals, { materials: 2, ready: true, sheets: 1 }, estimate(null)).layouts).toBe('1 sheet · 2 materials');
    expect(outputSummaries(totals, { materials: 2, ready: false, sheets: 0 }, estimate(null)).layouts).toBe('Laying out…');
  });

  it('is plain when there is nothing yet', () => {
    const empty = outputSummaries({ boxes: 0, panelPieces: 0, laminatePieces: 0, distinctCuts: 0 }, { materials: 0, ready: false, sheets: 0 }, estimate(null));
    expect(empty).toEqual({ cutlist: 'No cabinets yet', layouts: 'Nothing to lay out', estimate: 'Total incomplete' });
  });
});
