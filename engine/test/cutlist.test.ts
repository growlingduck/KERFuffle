/**
 * Cut-list tests. The golden sample is the five-cabinet job from
 * docs/wireframes/CutList.dc.html. Its expected lines were worked out by hand
 * from docs/calculation-rules.md under DEFAULT_RULES (as upgraded from version 1, base left off):
 *
 *   base box height = 36 − 4 − 1 1/2 = 30 1/2; wall box height = full height
 *   bottom/top = (W − 1 1/2) × (D − 3/4); sides = box × (D − 3/4)
 *   shelf = (W − 1 3/4) × (D − 7/8), 1″ thick from 36″ wide
 *   laminate = (box + 2) × (D + 2) per finished end, (box + 2) × (W + 2) front
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  upgradeVersion1Rules,
  LEGACY_SHEET_RULES,
  buildCutList,
  calculateParts,
  formatDimension,
  parseDimension,
  type CabinetSpec,
  type CutList,
  type CutListLine,
  type CutListOptions,
  type Ticks,
} from '../src/index';

interface FixtureCabinet extends Omit<CabinetSpec, 'width' | 'height' | 'depth'> {
  width: string;
  height: string;
  depth: string;
}

function loadJob(file: string): CabinetSpec[] {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'cutlist', file), 'utf8')) as {
    cabinets: FixtureCabinet[];
  };
  return raw.cabinets.map((c) => ({ ...c, width: size(c.width), height: size(c.height), depth: size(c.depth) }));
}

function size(text: string): Ticks {
  const parsed = parseDimension(text);
  if (!parsed.ok) throw new Error(`Bad size in fixture: ${text}`);
  return parsed.value;
}

const show = (value: Ticks | null) => (value === null ? '-' : formatDimension(value, { inchMark: false }).text);

/** A line as the shop would read it: mark, name, L × W × T, qty, from. */
function row(line: CutListLine): string {
  const from = line.refs.map((r) => (r.quantity > 1 ? `${r.cabinetId}×${r.quantity}` : r.cabinetId)).join(' ');
  return `${line.mark} | ${line.name} | ${show(line.length)} × ${show(line.width)} × ${show(line.thickness)} | ${line.quantity} | ${from}`;
}

const MERGED: CutListOptions = { mode: 'merged', includeFronts: true, sort: { key: 'length', dir: 'desc' } };
const SAMPLE = loadJob('sample-job.json');
const FRONT = 'Front (door/laminate size)';
/** A job saved before construction methods (rules version 1): method A1, base left off. Its cut list must not change. */
const V1_RULES = upgradeVersion1Rules(DEFAULT_RULES);

describe('buildCutList: golden sample (B1–B3, W1–W2)', () => {
  const list = buildCutList(SAMPLE, V1_RULES, MERGED);

  it('lists panels by thickness, thinnest first, then laminate', () => {
    expect(list.groups.map((g) => [g.id, g.pieces])).toEqual([
      ['panel:48', 43],
      ['panel:64', 1],
      ['laminate', 12],
    ]);
  });

  it('merges identical cuts and marks them in canonical order', () => {
    expect(list.groups.map((g) => g.lines.map(row))).toEqual([
      [
        'P1 | Bottom / Top | 40 1/2 × 23 1/4 × 3/4 | 2 | B2×2',
        `P2 | Back / ${FRONT} | 30 1/2 × 42 × 3/4 | 2 | B2×2`,
        `P3 | Back / ${FRONT} | 30 1/2 × 30 × 3/4 | 2 | B1×2`,
        'P4 | Left side / Right side | 30 1/2 × 23 1/4 × 3/4 | 8 | B1×2 B2×2 B3×4',
        `P5 | Back / ${FRONT} | 30 1/2 × 18 × 3/4 | 4 | B3×4`,
        `P6 | Back / ${FRONT} | 30 × 30 × 3/4 | 2 | W1×2`,
        `P7 | Back / ${FRONT} | 30 × 15 × 3/4 | 2 | W2×2`,
        'P8 | Left side / Right side | 30 × 11 1/2 × 3/4 | 2 | W2×2',
        'P9 | Left side / Right side | 30 × 11 1/4 × 3/4 | 2 | W1×2',
        'P10 | Bottom / Top | 28 1/2 × 23 1/4 × 3/4 | 2 | B1×2',
        'P11 | Bottom / Top | 28 1/2 × 11 1/4 × 3/4 | 2 | W1×2',
        'P12 | Shelf | 28 1/4 × 23 1/8 × 3/4 | 1 | B1',
        'P13 | Shelf | 28 1/4 × 11 1/8 × 3/4 | 2 | W1×2',
        'P14 | Bottom / Top | 16 1/2 × 23 1/4 × 3/4 | 4 | B3×4',
        'P15 | Shelf | 16 1/4 × 23 1/8 × 3/4 | 2 | B3×2',
        'P16 | Bottom / Top | 13 1/2 × 11 1/2 × 3/4 | 2 | W2×2',
        'P17 | Shelf | 13 1/4 × 11 3/8 × 3/4 | 2 | W2×2',
      ],
      ['P18 | Shelf | 40 1/4 × 23 1/8 × 1 | 1 | B2'],
      [
        'L1 | Laminate, front | 32 1/2 × 44 × - | 1 | B2',
        'L2 | Laminate, front | 32 1/2 × 32 × - | 1 | B1',
        'L3 | Laminate, left side / Laminate, right side | 32 1/2 × 26 × - | 3 | B1 B3×2',
        'L4 | Laminate, front | 32 1/2 × 20 × - | 2 | B3×2',
        'L5 | Laminate, front | 32 × 32 × - | 1 | W1',
        'L6 | Laminate, front | 32 × 17 × - | 1 | W2',
        'L7 | Laminate, right side | 32 × 14 1/4 × - | 1 | W2',
        'L8 | Laminate, left side / Laminate, right side | 32 × 14 × - | 2 | W1×2',
      ],
    ]);
  });

  it('totals boxes, pieces and distinct cuts', () => {
    expect(list.totals).toEqual({ boxes: 6, panelPieces: 44, laminatePieces: 12, distinctCuts: 26 });
    expect(list.blocked).toEqual([]);
  });

  it('records grain direction', () => {
    const byMark = new Map(list.lines.map((l) => [l.mark, l]));
    expect(byMark.get('P3')?.grain).toBe('vertical');
    expect(byMark.get('P10')?.grain).toBe('horizontal');
    expect(byMark.get('P12')?.grain).toBe('horizontal');
    expect(byMark.get('L1')?.grain).toBe('vertical');
  });

  it('fills `lines` in mark order', () => {
    expect(list.lines.map((l) => l.mark)).toEqual([
      ...Array.from({ length: 18 }, (_, i) => `P${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `L${i + 1}`),
    ]);
  });
});

describe('buildCutList: fronts switch', () => {
  const on = buildCutList(SAMPLE, V1_RULES, MERGED);
  const off = buildCutList(SAMPLE, V1_RULES, { ...MERGED, includeFronts: false });
  const lineOf = (list: CutList, mark: string) => list.lines.find((l) => l.mark === mark);

  it('drops the Front reference size and keeps every mark in place', () => {
    expect(lineOf(off, 'P2')).toMatchObject({ name: 'Back', quantity: 1, refs: [{ cabinetId: 'B2', quantity: 1 }] });
    expect(lineOf(off, 'P5')).toMatchObject({ name: 'Back', quantity: 2 });
    for (const line of off.lines) expect(lineOf(on, line.mark)?.key).toBe(line.key);
  });

  it('takes the fronts out of the totals', () => {
    expect(off.totals).toEqual({ boxes: 6, panelPieces: 38, laminatePieces: 12, distinctCuts: 26 });
  });

  it('marks a line optional only when every part on it is a Front', () => {
    expect(on.lines.some((l) => l.optional)).toBe(false);
    // The legacy sheet took toe kick and countertop off the wall back, so the
    // wall Front no longer matches its Back and stands alone.
    const wall = SAMPLE.filter((c) => c.id === 'W1');
    const legacy = buildCutList(wall, LEGACY_SHEET_RULES, MERGED);
    const front = legacy.lines.find((l) => l.roles.includes('front'));
    expect(front).toMatchObject({ name: FRONT, optional: true, roles: ['front'] });
    const legacyOff = buildCutList(wall, LEGACY_SHEET_RULES, { ...MERGED, includeFronts: false });
    expect(legacyOff.lines.find((l) => l.key === front?.key)).toBeUndefined();
    // Its mark is still reserved, so the other marks don't move.
    expect(legacyOff.lines.map((l) => l.mark)).not.toContain(front?.mark);
  });
});

describe('buildCutList: sorting', () => {
  const marksByKey = (list: CutList) => new Map(list.lines.map((l) => [l.key, l.mark]));
  const base = buildCutList(SAMPLE, V1_RULES, MERGED);

  it.each([
    ['name', 'asc'],
    ['name', 'desc'],
    ['length', 'asc'],
    ['width', 'desc'],
    ['quantity', 'asc'],
    ['quantity', 'desc'],
  ] as const)('keeps marks when sorted by %s %s', (key, dir) => {
    const sorted = buildCutList(SAMPLE, V1_RULES, { ...MERGED, sort: { key, dir } });
    expect(marksByKey(sorted)).toEqual(marksByKey(base));
  });

  it('sorts inside each group, breaking ties by mark', () => {
    const byQty = buildCutList(SAMPLE, V1_RULES, { ...MERGED, sort: { key: 'quantity', dir: 'desc' } });
    expect(byQty.groups[0]?.lines.map((l) => l.mark)).toEqual([
      'P4', 'P5', 'P14', 'P1', 'P2', 'P3', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P13', 'P15', 'P16', 'P17', 'P12',
    ]);
    const byWidth = buildCutList(SAMPLE, V1_RULES, { ...MERGED, sort: { key: 'width', dir: 'asc' } });
    expect(byWidth.groups[2]?.lines.map((l) => l.mark)).toEqual(['L8', 'L7', 'L6', 'L4', 'L3', 'L2', 'L5', 'L1']);
    const byName = buildCutList(SAMPLE, V1_RULES, { ...MERGED, sort: { key: 'name', dir: 'asc' } });
    expect(byName.groups[0]?.lines.slice(0, 5).map((l) => l.mark)).toEqual(['P2', 'P3', 'P5', 'P6', 'P7']);
  });
});

describe('buildCutList: by cabinet', () => {
  const list = buildCutList(SAMPLE, V1_RULES, { ...MERGED, mode: 'by-cabinet' });

  it('has one section per cabinet, in job order, and no merged groups', () => {
    expect(list.groups).toEqual([]);
    expect(list.sections.map((s) => [s.cabinet.id, s.pieces])).toEqual([
      ['B1', 9],
      ['B2', 8],
      ['B3', 18],
      ['W1', 11],
      ['W2', 10],
    ]);
  });

  it('lists each part in part order with the same marks as the merged list', () => {
    expect(list.sections[0]?.lines.map((l) => `${l.mark} ${l.name} ${l.quantity}`)).toEqual([
      'P3 Back 1',
      'P10 Bottom 1',
      'P4 Left side 1',
      'P4 Right side 1',
      'P10 Top 1',
      `P3 ${FRONT} 1`,
      'P12 Shelf 1',
      'L3 Laminate, left side 1',
      'L2 Laminate, front 1',
    ]);
    expect(list.sections[2]?.lines.find((l) => l.roles[0] === 'shelf')).toMatchObject({ mark: 'P15', quantity: 2 });
  });

  it('keeps the merged totals', () => {
    expect(list.totals).toEqual({ boxes: 6, panelPieces: 44, laminatePieces: 12, distinctCuts: 26 });
  });
});

describe('buildCutList: blocked cabinets', () => {
  const broken = SAMPLE.map((c) => (c.id === 'B3' ? { ...c, width: size('1') } : c));
  const list = buildCutList(broken, V1_RULES, MERGED);

  it('leaves out cabinets with errors and reports them with their issues', () => {
    expect(list.blocked).toHaveLength(1);
    expect(list.blocked[0]).toMatchObject({ index: 2, cabinetId: 'B3' });
    expect(list.blocked[0]?.issues.some((i) => i.severity === 'error' && i.field === 'width')).toBe(true);
    expect(list.lines.some((l) => l.refs.some((r) => r.cabinetId === 'B3'))).toBe(false);
    expect(list.totals.boxes).toBe(4);
  });

  it('does not block on warnings', () => {
    const wide = SAMPLE.map((c) => (c.id === 'B2' ? { ...c, width: size('62') } : c));
    expect(buildCutList(wide, V1_RULES, MERGED).blocked).toEqual([]);
  });

  it('handles a job with nothing listable', () => {
    expect(buildCutList([], V1_RULES, MERGED)).toMatchObject({
      groups: [],
      lines: [],
      totals: { boxes: 0, panelPieces: 0, laminatePieces: 0, distinctCuts: 0 },
    });
  });
});

describe('buildCutList: purity', () => {
  it('does not change its inputs and returns the same list every time', () => {
    const cabinets = structuredClone(SAMPLE);
    const rules = structuredClone({ ...V1_RULES });
    Object.freeze(rules);
    cabinets.forEach((c) => Object.freeze(c));
    const options = Object.freeze({ ...MERGED, sort: Object.freeze({ ...MERGED.sort }) });
    const first = buildCutList(cabinets, rules, options);
    expect(buildCutList(cabinets, rules, options)).toEqual(first);
    expect(cabinets).toEqual(SAMPLE);
    expect(first.options).toEqual(MERGED);
    expect(first.options).not.toBe(options);
  });
});

describe('buildCutList: 40-cabinet stress job', () => {
  const job = loadJob('stress-40-cabinets.json');
  const list = buildCutList(job, V1_RULES, MERGED);

  it('lists every cabinet', () => {
    expect(job).toHaveLength(40);
    expect(list.blocked).toEqual([]);
    expect(list.totals.boxes).toBe(job.reduce((n, c) => n + c.quantity, 0));
  });

  it('accounts for every piece exactly once', () => {
    const parts = job.flatMap((c) => calculateParts(c, V1_RULES).parts);
    const total = (category: string) => parts.filter((p) => p.category === category).reduce((n, p) => n + p.quantity, 0);
    expect(list.totals.panelPieces).toBe(total('panel'));
    expect(list.totals.laminatePieces).toBe(total('laminate'));
    for (const line of list.lines) {
      expect(line.refs.reduce((n, r) => n + r.quantity, 0)).toBe(line.quantity);
    }
    const byCabinet = buildCutList(job, V1_RULES, { ...MERGED, mode: 'by-cabinet' });
    expect(byCabinet.sections.reduce((n, s) => n + s.pieces, 0)).toBe(total('panel') + total('laminate'));
  });

  it('numbers marks P1…Pn and L1…Ln without gaps or repeats', () => {
    const panels = list.lines.filter((l) => l.category === 'panel').map((l) => l.mark);
    const laminate = list.lines.filter((l) => l.category === 'laminate').map((l) => l.mark);
    expect(panels).toEqual(panels.map((_, i) => `P${i + 1}`));
    expect(laminate).toEqual(laminate.map((_, i) => `L${i + 1}`));
    expect(list.totals.distinctCuts).toBeGreaterThan(60);
  });
});
