/**
 * Sheet optimizer. Property tests run every mode over seeded random jobs and
 * check each result the way the shop would: nothing overlaps, everything is
 * inside the trimmed sheet, a kerf between neighbors, grain respected, every
 * piece cut once or reported, and the same answer every time. The hand-checked
 * cases are worked out below; sheets are 96 × 48 with 1/4″ trim and a 1/8″
 * kerf unless they say otherwise, so the trimmed sheet is 95 1/2 × 47 1/2.
 */
import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION,
  DEFAULT_RULES,
  DEFAULT_SAW_PROFILES,
  buildCutList,
  calculateParts,
  inches,
  layoutInput,
  layoutJob,
  layoutKey,
  sensitivity,
  type CabinetSpec,
  type CutList,
  type JobLayout,
  type LayoutInput,
  type LayoutMode,
  type LayoutOptions,
  type Material,
  type MaterialLayout,
  type SawProfile,
} from '../src/index';
import { createRng } from '../src/nesting/rng';
import { fragileStrips, lightSheet } from '../src/nesting/sensitivity';
import { placeFeature } from '../src/nesting/tree';
import { BIRCH_14, BIRCH_34, DEFAULT_JOB_MATERIALS, HPL, MELAMINE, loadJob, sheet } from './support/jobs';
import { cutListOf, line } from './support/lines';

const TABLE_SAW = DEFAULT_SAW_PROFILES[0]!;
const PANEL_SAW = DEFAULT_SAW_PROFILES[1]!;
const options = (mode: LayoutMode, extra: Partial<LayoutOptions> = {}): LayoutOptions => ({ mode, seed: 7, timeLimitMs: 60_000, ...extra });
const MODES: LayoutMode[] = ['cost', 'grain', 'time'];

// ---------------------------------------------------------------------------
// Checks every layout must pass
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  length: number;
  width: number;
}
/** The gap between two rectangles: negative when they overlap on both axes. */
function gap(a: Rect, b: Rect): number {
  const gx = Math.max(b.x - (a.x + a.length), a.x - (b.x + b.length));
  const gy = Math.max(b.y - (a.y + a.width), a.y - (b.y + b.width));
  return Math.max(gx, gy);
}

function checkMaterial(m: MaterialLayout, profile: SawProfile): void {
  const { kerf, edgeTrim } = profile;
  const inside = (r: Rect) =>
    r.x >= edgeTrim && r.y >= edgeTrim && r.x + r.length <= m.sheetLength - edgeTrim && r.y + r.width <= m.sheetWidth - edgeTrim;
  for (const pattern of m.patterns) {
    for (const p of pattern.placements) {
      expect(inside(p), `${p.mark} inside the trimmed sheet`).toBe(true);
      // Grain: a grained piece is never turned, so its length runs along the sheet's.
      if (p.grainLocked) expect(p.rotated).toBe(false);
      expect([p.length, p.width]).toEqual(p.rotated ? [p.partWidth, p.partLength] : [p.partLength, p.partWidth]);
      for (const f of p.features) {
        expect(f.x >= p.x && f.y >= p.y && f.x + f.length <= p.x + p.length && f.y + f.width <= p.y + p.width).toBe(true);
      }
    }
    // No overlaps, and at least a kerf between any two pieces (and between a piece and an offcut).
    const rects: Rect[] = [...pattern.placements, ...pattern.offcuts];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(gap(rects[i]!, rects[j]!)).toBeGreaterThanOrEqual(kerf);
    }
    for (const o of pattern.offcuts) expect(inside(o)).toBe(true);
    // Guillotine: no saw cut runs through a piece.
    for (const cut of pattern.cuts) {
      const blade: Rect =
        cut.along === 'x'
          ? { x: cut.from, y: cut.at, length: cut.to - cut.from, width: kerf }
          : { x: cut.at, y: cut.from, length: kerf, width: cut.to - cut.from };
      for (const p of pattern.placements) expect(gap(blade, p), `cut ${cut.n} misses ${p.mark}`).toBeGreaterThanOrEqual(0);
    }
    expect(pattern.cuts.map((c) => c.n)).toEqual(pattern.cuts.map((_, i) => i + 1));
    // Each sheet of the pattern has the right pieces in the right places.
    const byId = new Map(m.pieces.map((p) => [p.id, p]));
    for (const s of pattern.sheets) {
      expect(s.pieceIds).toHaveLength(pattern.placements.length);
      s.pieceIds.forEach((id, i) => expect(byId.get(id)?.mark).toBe(pattern.placements[i]!.mark));
    }
  }
  expect(m.stats.sheets).toBe(m.patterns.reduce((n, p) => n + p.count, 0));
  expect(m.patterns.flatMap((p) => p.sheets.map((s) => s.number)).sort((a, b) => a - b)).toEqual(
    Array.from({ length: m.stats.sheets }, (_, i) => i + 1),
  );
}

/** Every piece of the cut list is placed exactly once or reported. */
function checkAccounted(cutList: CutList, layout: JobLayout): void {
  const seen = new Map<string, number>();
  const add = (id: string) => seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const m of layout.materials) {
    for (const p of m.patterns) for (const s of p.sheets) s.pieceIds.forEach(add);
    m.unplaced.forEach((u) => add(u.piece.id));
  }
  layout.unplaced.forEach((u) => add(u.piece.id));
  const expected = cutList.lines.flatMap((l) => Array.from({ length: l.quantity }, (_, i) => `${l.mark}-${i + 1}`));
  expect([...seen.keys()].sort()).toEqual([...expected].sort());
  expect([...seen.values()].every((n) => n === 1)).toBe(true);
}

function checkLayout(cutList: CutList, layout: JobLayout): void {
  for (const m of layout.materials) checkMaterial(m, layout.profile);
  checkAccounted(cutList, layout);
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

const STOCK: Material[] = [
  sheet('ply', 'Ply 96 × 48', 3 / 4, 96, 48),
  sheet('mel', 'Melamine 97 × 49', 3 / 4, 97, 49, { grain: 'none' }),
  { ...HPL, id: 'hpl-big', name: 'HPL 144 × 60', length: inches(144), width: inches(60) },
];

/** A random job: a dozen-odd lines in 1/16″ sizes, some too big, some notched, on random stock. */
function randomJob(seed: number): { cutList: CutList; profile: SawProfile; mode: LayoutMode } {
  const rng = createRng(seed);
  const sixteenths = (lo: number, hi: number) => (lo * 16 + rng.int((hi - lo) * 16 + 1)) / 16;
  const lines = Array.from({ length: 3 + rng.int(12) }, (_, i) => {
    const length = sixteenths(2, 104);
    const width = sixteenths(1.5, 52);
    const notched = rng.next() < 0.2 && length > 8 && width > 6;
    return line({
      mark: `P${i + 1}`,
      length,
      width,
      quantity: 1 + rng.int(9),
      material: STOCK[rng.int(STOCK.length)]!,
      visible: rng.next() < 0.3,
      refs: ['B1', 'B2', 'W1'].slice(0, 1 + rng.int(3)),
      ...(notched ? { features: [{ kind: 'notch' as const, corner: 'start-front' as const, length: inches(4), width: inches(3) }] } : {}),
    });
  });
  const pick = <T>(xs: readonly T[]) => xs[rng.int(xs.length)]!;
  const profile: SawProfile = {
    ...TABLE_SAW,
    kerf: inches(pick([0, 1 / 16, 1 / 8, 3 / 16])),
    edgeTrim: inches(pick([0, 1 / 8, 1 / 4])),
    firstCut: pick(['length', 'width', 'either'] as const),
    extraSheets: pick([0, 1, 2]),
  };
  return { cutList: cutListOf(lines), profile, mode: pick(MODES) };
}

describe('layoutJob: properties on random jobs', () => {
  const CASES = 60;
  it(`passes every check on ${CASES} random jobs`, () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const { cutList, profile, mode } = randomJob(seed);
      const layout = layoutJob(cutList, {}, profile, options(mode, { iterations: 4 }));
      checkLayout(cutList, layout);
      expect(layout.search.complete).toBe(true);
    }
  });

  it('gives the same layout for the same input and seed', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { cutList, profile, mode } = randomJob(seed);
      const run = () => layoutJob(cutList, {}, profile, options(mode, { iterations: 6, seed }));
      expect(run()).toEqual(run());
    }
  });

  it('never uses more sheets in time mode than cost mode plus the allowance', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { cutList, profile } = randomJob(seed);
      const cost = layoutJob(cutList, {}, profile, options('cost', { iterations: 4 }));
      const time = layoutJob(cutList, {}, profile, options('time', { iterations: 4 }));
      for (const m of time.materials) {
        const c = cost.materials.find((x) => x.material.id === m.material.id)!;
        expect(m.stats.sheets).toBeLessThanOrEqual(c.stats.sheets + profile.extraSheets);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Hand-checked cases
// ---------------------------------------------------------------------------

const wall = (depth: number, quantity = 6): CabinetSpec => ({
  id: 'W1',
  type: 'wall',
  width: inches(31.5),
  height: inches(30),
  depth: inches(depth),
  shelfCount: 0,
  finishedEnds: 'none',
  quantity,
});
/** Box parts on 3/4″ birch, the back on its own sheet so it stays out of the way. */
const WALL_MATERIALS = { box: BIRCH_34, back: BIRCH_14, laminate: HPL };
const NO_FRONTS = { mode: 'merged', includeFronts: false, sort: { key: 'length', dir: 'desc' } } as const;
const wallInput = (depth: number, extra: Partial<LayoutInput> = {}): LayoutInput => ({
  cabinets: [wall(depth)],
  rules: DEFAULT_RULES,
  materials: WALL_MATERIALS,
  cutListOptions: NO_FRONTS,
  profile: TABLE_SAW,
  options: options('cost'),
  ...extra,
});
const birch = (layout: JobLayout) => layout.materials.find((m) => m.material.id === BIRCH_34.id)!;
/** Strips across the sheet: the distinct y positions of a pattern's pieces. */
const across = (m: MaterialLayout) => new Set(m.patterns[0]!.placements.map((p) => p.y)).size;

describe('the wall-side example (plan §2.4)', () => {
  // 12 3/4″ deep: sides, top and bottom are 30 × 12. Four across is 48″ plus three kerfs: only 3 fit in 47 1/2.
  // 12 1/2″ deep: 30 × 11 3/4. 4 × 11 3/4 + 3 × 1/8 = 47 3/8: 4 fit. Along the sheet, 3 × 30 + 2 × 1/8 = 90 1/4 either way.
  // Six cabinets, 24 pieces: 9 a sheet at 12″ (3 sheets), 12 a sheet at 11 3/4″ (2 sheets).
  it('fits 3 across at 12 3/4″ deep and 4 across at 12 1/2″', () => {
    const sides = (depth: number) => calculateParts(wall(depth, 1), DEFAULT_RULES).parts.find((p) => p.role === 'side-left')!;
    expect(sides(12.75).width).toBe(inches(12));
    expect(sides(12.5).width).toBe(inches(11.75));

    const deep = layoutInput(wallInput(12.75));
    const shallow = layoutInput(wallInput(12.5));
    for (const layout of [deep, shallow]) checkLayout(buildCutList([wall(layout === deep ? 12.75 : 12.5)], DEFAULT_RULES, NO_FRONTS, WALL_MATERIALS), layout);
    expect(across(birch(deep))).toBe(3);
    expect(birch(deep).stats.sheets).toBe(3);
    expect(across(birch(shallow))).toBe(4);
    expect(birch(shallow).stats.sheets).toBe(2);
  });

  // The smallest change that gets 4 across is 7/32″, to 11 25/32: 4 × 11 25/32 + 3/8 = 47 1/2 exactly.
  it('suggests the 7/32″ that saves a sheet, in shop words', () => {
    const input = wallInput(12.75, { options: options('cost', { iterations: 10 }) });
    const result = layoutInput(input);
    const notes = sensitivity(input, result);
    const save = notes.nearMisses.find((n) => n.materialId === BIRCH_34.id && n.change.kind === 'piece');
    expect(save?.message).toBe(
      'Making P3 Bottom / Left side / Right side / Top 7/32″ narrower (11 25/32″ instead of 12″) saves 1 sheet of Birch plywood 3/4″.',
    );
    // No allowance within 1/8″ gets four 12″ pieces across: even no kerf and no trim leaves 48″ against 48″ plus kerfs.
    expect(notes.nearMisses.filter((n) => n.materialId === BIRCH_34.id && n.change.kind === 'allowance')).toEqual([]);
  });
});

describe('allowance near misses and risks', () => {
  // 12 9/16″ deep: pieces 30 × 11 13/16. 4 across needs 47 1/4 + 3/8 = 47 5/8: 1/8″ more than 47 1/2.
  // An edge trim of 3/16″ gives 47 5/8 (saves a sheet); so does a kerf of 5/64″ (47 1/4 + 15/64 ≤ 47 1/2).
  it('names the smallest trim and kerf that save a sheet', () => {
    const input = wallInput(12 + 9 / 16, { options: options('cost', { iterations: 10 }) });
    const result = layoutInput(input);
    expect(birch(result).stats.sheets).toBe(3);
    const notes = sensitivity(input, result);
    const messages = notes.nearMisses.filter((n) => n.materialId === BIRCH_34.id).map((n) => n.message);
    expect(messages).toContain('Reducing the edge trim from 1/4″ to 3/16″ saves 1 sheet of Birch plywood 3/4″.');
    expect(messages).toContain('Reducing the kerf from 1/8″ to 5/64″ saves 1 sheet of Birch plywood 3/4″.');
    expect(messages).toContain(
      'Making P3 Bottom / Left side / Right side / Top 1/32″ narrower (11 25/32″ instead of 11 13/16″) saves 1 sheet of Birch plywood 3/4″.',
    );
    // Laminate: the 32 × 33 1/2 front laminate at 7/8″ oversize is 31 3/4 long, and 3 × 31 3/4 + 2 kerfs = 95 1/2.
    expect(notes.nearMisses.map((n) => n.message)).toContain(
      'Reducing the laminate oversize from 1″ to 7/8″ per edge saves 1 sheet of HPL laminate 48 × 96.',
    );
  });

  // 12 17/32″ deep: 30 × 11 25/32. 4 × 11 25/32 + 3/8 = 47 1/2 exactly: 4 fit with nothing to spare.
  it('flags a layout with no slack, and the kerf and trim that would cost a sheet', () => {
    const input = wallInput(12 + 17 / 32, { options: options('cost', { iterations: 10 }) });
    const result = layoutInput(input);
    const m = birch(result);
    expect(m.stats.sheets).toBe(2);
    expect(across(m)).toBe(4);
    const notes = sensitivity(input, result);
    const tight = notes.fragile.find((f) => f.materialId === BIRCH_34.id && f.strip === null)!;
    expect(tight.slack).toBe(0);
    expect(tight.kerfLimit).toBe(inches(1 / 8));
    expect(tight.trimLimit).toBe(inches(1 / 4));
    expect(tight.message).toBe(
      'Birch plywood 3/4″: The strips on sheets 1–2 have no room left across the sheet. With a kerf over 1/8″ or an edge trim over 1/4″, they won’t fit.',
    );
    const risks = notes.risks.filter((r) => r.materialId === BIRCH_34.id).map((r) => r.message);
    expect(risks).toContain('A 9/64″ kerf or more needs 1 more sheet of Birch plywood 3/4″.');
    expect(risks).toContain('An edge trim of 17/64″ or more needs 1 more sheet of Birch plywood 3/4″.');
  });
});

describe('hand-checked layouts', () => {
  // 2 × 23 11/16 + 1/8 = 47 1/2 and 3 × 31 3/4 + 2 × 1/8 = 95 1/2: six pieces fill the trimmed sheet exactly.
  it('fills a sheet exactly with six pieces, five cuts and no offcut', () => {
    const cutList = cutListOf([line({ mark: 'P1', name: 'Panel', length: 31.75, width: 23 + 11 / 16, quantity: 6, material: BIRCH_34 })]);
    for (const mode of MODES) {
      const layout = layoutJob(cutList, {}, TABLE_SAW, options(mode));
      checkLayout(cutList, layout);
      const m = layout.materials[0]!;
      expect(m.stats).toMatchObject({ sheets: 1, pieces: 6, patterns: 1, cuts: 5, fenceSettings: 1, crosscutStops: 1, keepableOffcuts: 0 });
      expect(m.patterns[0]!.offcuts).toEqual([]);
      // 6 × 31 3/4 × 23 11/16 over 96 × 48.
      expect(m.stats.yieldPercent).toBe(97.9);
      expect(m.patterns[0]!.cuts.map((c) => `${c.stage} ${c.setting / 64}`)).toEqual([
        'rip 23.6875',
        'crosscut 31.75',
        'crosscut 31.75',
        'crosscut 31.75',
        'crosscut 31.75',
      ]);
      const fragile = fragileStrips(m, TABLE_SAW);
      expect(fragile.map((f) => f.strip)).toEqual([null, 1, 2]);
      expect(fragile.every((f) => f.slack === 0 && f.kerfLimit === inches(1 / 8))).toBe(true);
    }
  });

  it('reports a piece bigger than the sheet and lays out the rest', () => {
    const cutList = cutListOf([
      line({ mark: 'P1', name: 'Side', length: 100, width: 23.25, quantity: 2, material: BIRCH_34 }),
      line({ mark: 'P2', name: 'Shelf', length: 28, width: 11, quantity: 3, material: BIRCH_34 }),
    ]);
    const layout = layoutJob(cutList, {}, TABLE_SAW, options('cost'));
    checkLayout(cutList, layout);
    const m = layout.materials[0]!;
    expect(m.unplaced.map((u) => [u.piece.id, u.reason])).toEqual([
      ['P1-1', 'too-big'],
      ['P1-2', 'too-big'],
    ]);
    expect(m.unplaced[0]!.message).toBe(
      'P1 Side (100 × 23 1/4) is bigger than a trimmed sheet of Birch plywood 3/4″ (95 1/2 × 47 1/2). Its grain has to run along the sheet, so it can’t be turned.',
    );
    expect(m.stats.pieces).toBe(3);
  });

  it('turns a piece on a sheet without grain, never on one with grain', () => {
    // 47 3/4 × 90: only fits the 96 1/2 × 48 1/2 trimmed melamine sheet turned a quarter turn.
    const piece = (material: Material) => cutListOf([line({ mark: 'P1', name: 'Panel', length: 47.75, width: 90, quantity: 1, material })]);
    const mel = layoutJob(piece(MELAMINE), {}, TABLE_SAW, options('cost'));
    checkLayout(piece(MELAMINE), mel);
    expect(mel.materials[0]!.patterns[0]!.placements[0]).toMatchObject({ rotated: true, length: inches(90), width: inches(47.75) });
    const ply = layoutJob(piece(BIRCH_34), {}, TABLE_SAW, options('cost'));
    expect(ply.materials[0]!.unplaced.map((u) => u.reason)).toEqual(['too-big']);
    // Grain mode doesn't turn anything, even without grain.
    const grain = layoutJob(piece(MELAMINE), {}, TABLE_SAW, options('grain'));
    expect(grain.materials[0]!.unplaced.map((u) => u.reason)).toEqual(['too-big']);
  });

  it('reports lines with no material or no sheet size, and solid stock', () => {
    const noSize: Material = { ...BIRCH_34, id: 'nosize', name: 'Mystery ply', length: null, width: null };
    const cutList = cutListOf([
      line({ mark: 'P1', name: 'Side', length: 30, width: 20, quantity: 1, material: null }),
      line({ mark: 'P2', name: 'Side', length: 30, width: 20, quantity: 1, material: noSize }),
      line({ mark: 'S1', name: 'Rail', length: 30, width: 2, quantity: 1, material: BIRCH_34, category: 'lumber' }),
    ]);
    const layout = layoutJob(cutList, {}, TABLE_SAW, options('cost'));
    checkAccounted(cutList, layout);
    expect(layout.unplaced.map((u) => [u.piece.id, u.reason])).toEqual([
      ['P1-1', 'no-material'],
      ['P2-1', 'no-sheet-size'],
      ['S1-1', 'solid-stock'],
    ]);
  });

  it('places visible pieces first in grain mode', () => {
    const cutList = cutListOf([
      line({ mark: 'P1', name: 'Side', length: 30, width: 23, quantity: 10, material: BIRCH_34 }),
      line({ mark: 'P2', name: 'Door', length: 30, width: 15, quantity: 4, material: BIRCH_34, visible: true }),
    ]);
    const layout = layoutJob(cutList, {}, TABLE_SAW, options('grain'));
    checkLayout(cutList, layout);
    const first = layout.materials[0]!.patterns.find((p) => p.sheets.some((s) => s.number === 1))!;
    expect(first.placements.filter((p) => p.mark === 'P2')).toHaveLength(4);
  });

  it('flags a light last sheet and pieces under the safe minimum', () => {
    // 3 across × 3 along fit 9 of 30 × 15 on a sheet; the 10th is alone on sheet 2: 450 / 4608 = 9.8%.
    const cutList = cutListOf([
      line({ mark: 'P1', name: 'Shelf', length: 30, width: 15, quantity: 10, material: BIRCH_34 }),
      line({ mark: 'P2', name: 'Cleat', length: 20, width: 1.5, quantity: 2, material: BIRCH_14 }),
    ]);
    const layout = layoutJob(cutList, {}, TABLE_SAW, options('cost'));
    const m = layout.materials.find((x) => x.material.id === BIRCH_34.id)!;
    expect(m.stats.sheets).toBe(2);
    expect(lightSheet(m).map((s) => s.message)).toEqual(['The last sheet of Birch plywood 3/4″ is 10% used (1 piece).']);
    expect(layout.materials.find((x) => x.material.id === BIRCH_14.id)!.small).toEqual(['P2']);
  });
});

describe('features and coordinates', () => {
  // A 30 × 20 part with a 4 × 3 notch at its start-front corner (u ∈ [0, 4], v ∈ [17, 20]).
  const notch = { kind: 'notch', corner: 'start-front', length: inches(4), width: inches(3) } as const;
  it('places a notch unturned and turned a quarter turn', () => {
    expect(placeFeature(notch, 100, 200, inches(30), inches(20), false)).toMatchObject({ x: 100, y: 200 + inches(17), length: inches(4), width: inches(3) });
    // Turned: (u, v) → (width − v, u), so the notch sits at x ∈ [0, 3], y ∈ [0, 4].
    expect(placeFeature(notch, 100, 200, inches(30), inches(20), true)).toMatchObject({ x: 100, y: 200, length: inches(3), width: inches(4) });
    const end = { ...notch, corner: 'end-back' } as const;
    expect(placeFeature(end, 0, 0, inches(30), inches(20), false)).toMatchObject({ x: inches(26), y: 0 });
    expect(placeFeature(end, 0, 0, inches(30), inches(20), true)).toMatchObject({ x: inches(17), y: inches(26) });
  });

  it('carries method B’s kick notch through to the placed sides', () => {
    const rules = { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, id: 'B' as const } };
    const cabinets: CabinetSpec[] = [{ id: 'B1', type: 'base', width: inches(30), height: inches(34.5), depth: inches(24), shelfCount: 1, finishedEnds: 'none', quantity: 2 }];
    const cutList = buildCutList(cabinets, rules, NO_FRONTS, { box: MELAMINE, back: MELAMINE, shelves: MELAMINE, base: MELAMINE, laminate: HPL });
    const layout = layoutJob(cutList, {}, PANEL_SAW, options('cost'));
    checkLayout(cutList, layout);
    const sides = layout.materials.flatMap((m) => m.patterns.flatMap((p) => p.placements)).filter((p) => p.features.length > 0);
    expect(sides.length).toBeGreaterThan(0);
    for (const s of sides) expect(s.features[0]!.part).toEqual(cutList.lines.find((l) => l.mark === s.mark)!.features![0]);
  });
});

describe('the sample job and the stress fixture', () => {
  const SAMPLE = buildCutList(loadJob('sample-job.json'), DEFAULT_RULES, undefined, DEFAULT_JOB_MATERIALS);
  const STRESS = buildCutList(loadJob('stress-40-cabinets.json'), DEFAULT_RULES, undefined, DEFAULT_JOB_MATERIALS);
  const total = (layout: JobLayout, key: 'sheets' | 'fenceSettings' | 'crosscutStops' | 'patterns' | 'cuts') =>
    layout.materials.reduce((n, m) => n + m.stats[key], 0);
  const summary = (name: string, layouts: Record<LayoutMode, JobLayout>) => {
    for (const mode of MODES) {
      for (const m of layouts[mode].materials) {
        const s = m.stats;
        console.log(
          `${name} ${mode.padEnd(5)} ${m.material.name.padEnd(24)} sheets ${s.sheets}, yield ${s.yieldPercent}%, fence ${s.fenceSettings}, stops ${s.crosscutStops}, patterns ${s.patterns}, cuts ${s.cuts}${m.unplaced.length ? `, ${m.unplaced.length} too big` : ''}`,
        );
      }
    }
  };

  it('lays out the sample job in every mode; time uses fewer fence settings than cost', () => {
    const layouts = Object.fromEntries(MODES.map((mode) => [mode, layoutJob(SAMPLE, DEFAULT_JOB_MATERIALS, TABLE_SAW, options(mode))])) as Record<LayoutMode, JobLayout>;
    for (const mode of MODES) checkLayout(SAMPLE, layouts[mode]);
    summary('sample', layouts);
    expect(total(layouts.time, 'fenceSettings')).toBeLessThan(total(layouts.cost, 'fenceSettings'));
    for (const m of layouts.time.materials) {
      const cost = layouts.cost.materials.find((c) => c.material.id === m.material.id)!;
      expect(m.stats.sheets).toBeLessThanOrEqual(cost.stats.sheets + TABLE_SAW.extraSheets);
    }
    const ply = (l: JobLayout) => l.materials.find((m) => m.material.id === BIRCH_34.id)!.stats;
    expect(ply(layouts.time).fenceSettings).toBeLessThan(ply(layouts.cost).fenceSettings);
  });

  it('meets the benchmark on the 40-cabinet stress fixture: first layout under 1 s, final under 5 s', () => {
    const layouts = {} as Record<LayoutMode, JobLayout>;
    for (const mode of MODES) {
      const start = performance.now();
      let first = Infinity;
      layouts[mode] = layoutJob(STRESS, DEFAULT_JOB_MATERIALS, TABLE_SAW, { mode, seed: 1, timeLimitMs: 5000 }, (p) => {
        if (p.phase === 'first') first = performance.now() - start;
      });
      const final = performance.now() - start;
      console.log(`stress ${mode}: first layout ${first.toFixed(0)} ms, final ${final.toFixed(0)} ms, ${layouts[mode].search.iterations} search steps`);
      expect(first).toBeLessThan(1000);
      expect(final).toBeLessThan(5000);
      expect(layouts[mode].search.complete).toBe(true);
      checkLayout(STRESS, layouts[mode]);
    }
    summary('stress', layouts);
    expect(total(layouts.time, 'fenceSettings')).toBeLessThan(total(layouts.cost, 'fenceSettings'));

    const input: LayoutInput = {
      cabinets: loadJob('stress-40-cabinets.json'),
      rules: DEFAULT_RULES,
      materials: DEFAULT_JOB_MATERIALS,
      profile: TABLE_SAW,
      options: { mode: 'cost', seed: 1, timeLimitMs: 5000 },
    };
    const start = performance.now();
    const notes = sensitivity(input, layouts.cost);
    console.log(
      `stress sensitivity: ${(performance.now() - start).toFixed(0)} ms; ${notes.nearMisses.length} near misses, ${notes.fragile.length} fragile, ${notes.risks.length} risks, ${notes.lightSheets.length} light sheets`,
    );
    for (const n of [...notes.nearMisses, ...notes.risks, ...notes.lightSheets]) console.log(`  ${n.message}`);
  }, 60_000);
});

describe('progress, keys and versions', () => {
  const cutList = cutListOf([
    line({ mark: 'P1', name: 'Side', length: 30.5, width: 23.25, quantity: 14, material: BIRCH_34 }),
    line({ mark: 'P2', name: 'Shelf', length: 28.25, width: 22.375, quantity: 9, material: BIRCH_34 }),
    line({ mark: 'P3', name: 'Nailer', length: 28.5, width: 4, quantity: 7, material: BIRCH_34 }),
  ]);

  it('reports the first layout, then only improvements, and ends on the result', () => {
    const seen: { phase: string; sheets: number }[] = [];
    const result = layoutJob(cutList, {}, TABLE_SAW, options('cost', { iterations: 40 }), (p) =>
      seen.push({ phase: p.phase, sheets: p.layout.materials[0]!.stats.sheets }),
    );
    expect(seen[0]!.phase).toBe('first');
    expect(seen.slice(1).every((s) => s.phase === 'improved')).toBe(true);
    expect(seen.at(-1)!.sheets).toBe(result.materials[0]!.stats.sheets);
    expect(result.algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it('stops at the time limit and says so', () => {
    const result = layoutJob(cutList, {}, TABLE_SAW, { mode: 'cost', seed: 1, timeLimitMs: 0, iterations: 1000 });
    expect(result.search.complete).toBe(false);
    checkLayout(cutList, result);
  });

  it('keys a layout by what it reads, the profile and the algorithm version', () => {
    const input = wallInput(12.75);
    const key = layoutKey(input);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(layoutKey({ ...input })).toBe(key);
    expect(layoutKey({ ...input, profile: { ...TABLE_SAW, kerf: inches(3 / 32) } })).not.toBe(key);
    expect(layoutKey({ ...input, options: options('time') })).not.toBe(key);
    expect(layoutKey({ ...input, cabinets: [wall(12.5)] })).not.toBe(key);
    // A price isn't on the sheet.
    expect(layoutKey({ ...input, materials: { ...WALL_MATERIALS, box: { ...BIRCH_34, price: 6800 } } })).toBe(key);
  });
});
