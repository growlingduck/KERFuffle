import { DEFAULT_RULES, inches } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import { feetAndInches, layoutElevation, MAX_DRAWN_BOXES, WALL_CABINET_BOTTOM } from '../src/lib/elevation';
import type { ElevationCabinet } from '../src/lib/elevation';
import { elevationCabinets, jobTotals } from '../src/screens/jobs/jobMath';
import { summarize } from '../src/state/jobs';
import { filterCounts, toggleSort, visibleJobs, DEFAULT_REGISTER_VIEW } from '../src/state/register';
import { testCabinet, testJob } from './storage';

const cab = (label: string, type: 'base' | 'wall', width: number, height: number, overrides: Partial<ElevationCabinet> = {}): ElevationCabinet => ({
  label,
  type,
  width: inches(width),
  height: inches(height),
  quantity: 1,
  invalid: false,
  ...overrides,
});

describe('layoutElevation', () => {
  it('puts base cabinets on the floor and hangs wall cabinets 54″ up, both runs from the left end', () => {
    const layout = layoutElevation([cab('B1', 'base', 30, 34.5), cab('W1', 'wall', 15, 30), cab('B2', 'base', 18, 34.5), cab('W2', 'wall', 30, 30)]);
    expect(WALL_CABINET_BOTTOM).toBe(inches(54));
    expect(layout.boxes.map((b) => [b.label, b.x, b.bottom, b.width, b.height])).toEqual([
      ['B1', 0, 0, inches(30), inches(34.5)],
      ['W1', 0, inches(54), inches(15), inches(30)],
      ['B2', inches(30), 0, inches(18), inches(34.5)],
      ['W2', inches(15), inches(54), inches(30), inches(30)],
    ]);
    expect(layout.width).toBe(inches(48));
    expect(layout.height).toBe(inches(84));
    expect(layout.baseRun).toBe(inches(48));
    expect([layout.baseCount, layout.wallCount]).toEqual([2, 2]);
  });

  it('draws a cabinet once per quantity, and counts it in the base run', () => {
    const layout = layoutElevation([cab('B1', 'base', 30, 34.5, { quantity: 3 })]);
    expect(layout.boxes.map((b) => b.x)).toEqual([0, inches(30), inches(60)]);
    expect(layout.baseRun).toBe(inches(90));
  });

  it('keeps an invalid cabinet’s own size when it has one, and stands in for a missing one', () => {
    const layout = layoutElevation([cab('B1', 'base', 30, 3, { invalid: true }), cab('W1', 'wall', 0, 0, { invalid: true, quantity: 0 })]);
    expect(layout.invalidCount).toBe(2);
    expect(layout.boxes).toHaveLength(2);
    expect(layout.boxes[0]).toMatchObject({ invalid: true, width: inches(30), height: inches(3) });
    expect(layout.boxes[1]).toMatchObject({ invalid: true, width: inches(24), height: inches(30), bottom: inches(54) });
    // The base run is still the true width.
    expect(layout.baseRun).toBe(inches(30));
  });

  it('has no base run when there are no bases, or a base has no usable width', () => {
    expect(layoutElevation([cab('W1', 'wall', 30, 30)]).baseRun).toBeNull();
    expect(layoutElevation([cab('B1', 'base', 0, 34.5, { invalid: true })]).baseRun).toBeNull();
    expect(layoutElevation([]).baseRun).toBeNull();
  });

  it('stops drawing past MAX_DRAWN_BOXES and drops the dimension it can no longer show', () => {
    const layout = layoutElevation([cab('B1', 'base', 30, 34.5, { quantity: 100_000 })]);
    expect(layout.boxes).toHaveLength(MAX_DRAWN_BOXES);
    expect(layout.truncated).toBe(true);
    expect(layout.baseRun).toBeNull();
  });
});

describe('feetAndInches', () => {
  it('writes architectural feet and inches', () => {
    expect(feetAndInches(inches(108))).toBe('9′-0″');
    expect(feetAndInches(inches(109.5))).toBe('9′-1 1/2″');
    expect(feetAndInches(inches(11))).toBe('0′-11″');
    expect(feetAndInches(inches(90))).toBe('7′-6″');
  });
});

describe('jobTotals', () => {
  it('counts panel and laminate pieces with the engine, respecting quantities and leaving out the Front reference', () => {
    const job = testJob({
      cabinets: [
        testCabinet('a', 'B1'), // 6 panels (back, bottom, 2 sides, top, 1 shelf) + front laminate
        testCabinet('b', 'B2', { quantity: 2, finishedEnds: 'left' }), // ×2: 6 panels, 2 laminate
        testCabinet('c', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 }),
      ],
    });
    expect(jobTotals(job)).toEqual({ boxes: 4, panelPieces: 6 + 12 + 7, laminatePieces: 1 + 4 + 1, invalid: [] });
  });

  it('uses the job’s own rules', () => {
    const cabinet = testCabinet('a', 'B1', { height: inches(10) });
    // Default rules leave a 4 1/2″ box from a 10″ base; this job's 8″ toe kick and 2″ countertop leave none.
    const tall = { ...DEFAULT_RULES, toeKickHeight: inches(8), countertopThickness: inches(2) };
    expect(jobTotals(testJob({ cabinets: [cabinet], rules: tall })).invalid).toEqual(['B1']);
    expect(jobTotals(testJob({ cabinets: [cabinet] })).invalid).toEqual([]);
  });

  it('leaves out cabinets with errors and names them', () => {
    const job = testJob({ cabinets: [testCabinet('a', 'B1'), testCabinet('b', 'B2', { width: inches(0) })] });
    expect(jobTotals(job)).toEqual({ boxes: 2, panelPieces: 6, laminatePieces: 1, invalid: ['B2'] });
  });

  it('marks invalid cabinets for the drawings only once the full record is known', () => {
    const job = testJob({ cabinets: [testCabinet('a', 'B1'), testCabinet('b', 'B2', { width: inches(0) })] });
    expect(elevationCabinets(summarize(job), undefined).map((c) => c.invalid)).toEqual([false, false]);
    expect(elevationCabinets(summarize(job), job).map((c) => c.invalid)).toEqual([false, true]);
  });
});

describe('register filtering and sorting', () => {
  const jobs = [
    summarize(testJob({ id: 'a', number: 1, name: 'Alpha', status: 'completed', updatedAt: '2026-10-01T00:00:00.000Z' })),
    summarize(testJob({ id: 'b', number: 2, name: 'bravo', status: 'draft', updatedAt: '2026-10-03T00:00:00.000Z' })),
    summarize(testJob({ id: 'c', number: 3, name: 'Charlie 10', status: 'archived', updatedAt: '2026-10-02T00:00:00.000Z' })),
    summarize(testJob({ id: 'd', number: 4, name: 'Charlie 9', status: 'ready', updatedAt: '2026-10-02T00:00:00.000Z' })),
  ];
  const ids = (view: Partial<typeof DEFAULT_REGISTER_VIEW>, keep?: Set<string>) =>
    visibleJobs(jobs, { ...DEFAULT_REGISTER_VIEW, ...view }, keep).map((j) => j.id);

  it('counts active, all and archived', () => {
    expect(filterCounts(jobs)).toEqual({ active: 3, all: 4, archived: 1 });
  });

  it('filters, and keeps a leaving row listed', () => {
    expect(ids({})).toEqual(['b', 'd', 'a']);
    expect(ids({ filter: 'archived' })).toEqual(['c']);
    expect(ids({ filter: 'archived' }, new Set(['a']))).toEqual(['c', 'a']);
  });

  it('searches name, customer and job number, ignoring case', () => {
    expect(ids({ filter: 'all', query: 'CHAR' })).toEqual(['d', 'c']);
    expect(ids({ filter: 'all', query: 'j-0001' })).toEqual(['a']);
    expect(ids({ filter: 'all', query: '[customer' })).toHaveLength(4);
    expect(ids({ filter: 'all', query: '  ' })).toHaveLength(4);
  });

  it('sorts names naturally and statuses in workflow order, newest first within a status', () => {
    expect(ids({ filter: 'all', sort: 'name', dir: 1 })).toEqual(['a', 'b', 'd', 'c']);
    expect(ids({ filter: 'all', sort: 'name', dir: -1 })).toEqual(['c', 'd', 'b', 'a']);
    expect(ids({ filter: 'all', sort: 'status', dir: 1 })).toEqual(['b', 'd', 'a', 'c']);
    expect(ids({ filter: 'all', sort: 'edited', dir: 1 })).toEqual(['a', 'c', 'd', 'b']);
  });

  it('a new column starts in its natural direction; the same column flips', () => {
    expect(toggleSort(DEFAULT_REGISTER_VIEW, 'name')).toEqual({ sort: 'name', dir: 1 });
    expect(toggleSort(DEFAULT_REGISTER_VIEW, 'edited')).toEqual({ sort: 'edited', dir: 1 });
    expect(toggleSort({ ...DEFAULT_REGISTER_VIEW, sort: 'status', dir: 1 }, 'edited')).toEqual({ sort: 'edited', dir: -1 });
  });
});
