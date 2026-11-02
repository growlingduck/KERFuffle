import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_METHOD,
  DEFAULT_RULES,
  LEGACY_SHEET_RULES,
  LEGACY_WEB_RULES,
  METHODS,
  ROLE_ORDER,
  buildCutList,
  calculateParts,
  inches,
  jobParts,
  parseDimension,
  sleeperCount,
  splitPlatform,
  toInches,
  upgradeVersion1Rules,
  validate,
  type CabinetSpec,
  type ConstructionRules,
  type MethodSettings,
  type Ticks,
} from '../src/index';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

const size = (text: string): Ticks => {
  const parsed = parseDimension(text);
  if (!parsed.ok) throw new Error(`bad size ${text}`);
  return parsed.value;
};

type RawCabinet = Omit<CabinetSpec, 'width' | 'height' | 'depth'> & { width: string; height: string; depth: string };
const toSpec = (c: RawCabinet): CabinetSpec => ({ ...c, width: size(c.width), height: size(c.height), depth: size(c.depth) });

function readJson(...path: string[]): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, ...path), 'utf8'));
}

/** Every cabinet in the version 1 fixtures and sample jobs. */
const V1_CABINETS: CabinetSpec[] = [
  ...readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => toSpec((readJson(f) as { spec: RawCabinet }).spec)),
  ...['sample-job.json', 'stress-40-cabinets.json'].flatMap((f) => (readJson('cutlist', f) as { cabinets: RawCabinet[] }).cabinets.map(toSpec)),
];

/** A rules snapshot as version 1 stored it: no method block. */
function asVersion1(rules: ConstructionRules): Omit<ConstructionRules, 'method'> {
  const v1: Partial<ConstructionRules> = { ...rules };
  delete v1.method;
  return v1 as Omit<ConstructionRules, 'method'>;
}

const base = (overrides: Partial<CabinetSpec> = {}): CabinetSpec => ({
  id: 'B1',
  type: 'base',
  width: inches(30),
  height: inches(36),
  depth: inches(24),
  shelfCount: 1,
  finishedEnds: 'none',
  quantity: 1,
  ...overrides,
});

const withMethod = (method: Partial<MethodSettings>, rules: ConstructionRules = DEFAULT_RULES): ConstructionRules => ({
  ...rules,
  method: { ...rules.method, ...method },
});

describe('rules version 1 → 2', () => {
  it('upgrades to method A1 with an applied back of panel thickness, a full top, and the base left off', () => {
    expect(upgradeVersion1Rules(asVersion1(DEFAULT_RULES)).method).toEqual({
      ...DEFAULT_METHOD,
      id: 'A',
      baseType: 'ladder',
      backType: 'applied',
      backThickness: null,
      baseTop: 'full',
      listBase: false,
    });
  });

  it.each([
    ['DEFAULT_RULES', DEFAULT_RULES],
    ['LEGACY_WEB_RULES', LEGACY_WEB_RULES],
    ['LEGACY_SHEET_RULES', LEGACY_SHEET_RULES],
    ['23/32 panels', { ...DEFAULT_RULES, panelThickness: inches(23 / 32) }],
  ] as const)('gives every fixture and sample cabinet exactly the same parts (%s)', (_, rules) => {
    const upgraded = upgradeVersion1Rules(asVersion1(rules));
    for (const cabinet of V1_CABINETS) {
      expect(calculateParts(cabinet, upgraded), cabinet.id).toEqual(calculateParts(cabinet, rules));
    }
  });

  it('lists no base parts for an upgraded job, so its cut list is unchanged', () => {
    const upgraded = upgradeVersion1Rules(asVersion1(DEFAULT_RULES));
    expect(jobParts(V1_CABINETS, upgraded)).toEqual({ parts: [], issues: [] });
    const list = buildCutList(V1_CABINETS, upgraded);
    expect(list.lines.flatMap((l) => l.roles).filter((r) => r.startsWith('base-') || r === 'kick-skin')).toEqual([]);
  });

  it('keeps the base off the legacy presets, which reproduce calculators that had none', () => {
    expect(LEGACY_WEB_RULES.method.listBase).toBe(false);
    expect(LEGACY_SHEET_RULES.method.listBase).toBe(false);
  });

  it('gives new jobs the base', () => {
    expect(DEFAULT_RULES.method.listBase).toBe(true);
  });
});

describe('method registry', () => {
  for (const method of Object.values(METHODS)) {
    describe(`${method.id}: ${method.name}`, () => {
      it('gives every part role a material slot', () => {
        expect(Object.keys(method.slots).sort()).toEqual([...ROLE_ORDER].sort());
      });

      it('declares only real settings, with the shop defaults', () => {
        for (const key of method.settings) expect(key in DEFAULT_METHOD, key).toBe(true);
        expect(method.defaults).toEqual(Object.fromEntries(method.settings.map((k) => [k, DEFAULT_METHOD[k]])));
      });

      it('marks the fronts and laminate visible, and no box-inside part', () => {
        expect(method.visible.has('front')).toBe(true);
        expect(method.visible.has('laminate-front')).toBe(true);
        expect(method.visible.has('bottom')).toBe(false);
        expect(method.visible.has('base-sleeper')).toBe(false);
      });

      it('builds wall cabinets the same way as method A', () => {
        const wall = base({ id: 'W1', type: 'wall', height: inches(30), depth: inches(12), finishedEnds: 'both' });
        expect(calculateParts(wall, withMethod({ id: method.id })).parts).toEqual(calculateParts(wall, DEFAULT_RULES).parts);
      });
    });
  }
});

describe('A1: splitting a platform', () => {
  const max = inches(96);
  const lengths = (widths: number[], limit = max) => splitPlatform(widths.map(inches), limit).map(toInches);

  it('keeps a platform that fits in one piece', () => {
    expect(lengths([30, 36, 30])).toEqual([96]);
  });

  it('joins at the cabinet seam nearest the equal split', () => {
    expect(lengths([36, 36, 30, 24])).toEqual([72, 54]);
    expect(lengths([24, 24, 24, 24, 24, 24, 24, 24])).toEqual([96, 96]);
  });

  it('cuts at the equal split when there is no seam to use', () => {
    expect(lengths([120])).toEqual([60, 60]);
    // The only seam, at 100, would leave a 100″ section.
    expect(lengths([100, 20])).toEqual([60, 60]);
  });

  it('never makes a section longer than the maximum', () => {
    const widths = [33, 15, 42, 9, 36, 30, 18, 27, 24, 21, 39, 12];
    const sections = lengths(widths);
    expect(sections.reduce((a, b) => a + b, 0)).toBe(widths.reduce((a, b) => a + b, 0));
    expect(sections.every((s) => s <= 96)).toBe(true);
    expect(sections).toHaveLength(Math.ceil(306 / 96));
  });
});

describe('A1: sleepers', () => {
  const count = (inchesLong: number) => sleeperCount(inches(inchesLong), DEFAULT_RULES);

  it('puts one at each end and enough between to keep gaps at or under 24″ center to center', () => {
    expect(count(15)).toBe(2);
    expect(count(24.75)).toBe(2); // 24″ between centers exactly
    expect(count(24.75 + 1 / 64)).toBe(3);
    expect(count(84)).toBe(5);
    expect(count(96)).toBe(5);
  });
});

describe('A1: runs on the cut list', () => {
  const job: CabinetSpec[] = [
    base({ id: 'B1', run: 'Sink wall', finishedEnds: 'left' }),
    base({ id: 'B2', run: ' Sink wall ', width: inches(36) }),
    base({ id: 'B3', width: inches(18) }),
    base({ id: 'W1', type: 'wall', height: inches(30), depth: inches(12), run: 'Sink wall' }),
  ];
  const list = buildCutList(job, DEFAULT_RULES);

  it('refers to run parts by run, and a lone cabinet’s platform by its label', () => {
    const skin = list.lines.filter((l) => l.roles.includes('kick-skin'));
    expect(skin.map((l) => [toInches(l.length), l.refs])).toEqual([
      [66, [{ cabinetId: 'Run: Sink wall', quantity: 1 }]],
      [18, [{ cabinetId: 'B3', quantity: 1 }]],
    ]);
  });

  it('merges run parts with matching cabinet parts and marks them like any other cut', () => {
    // Sleepers for 24″ deep cabinets are 19 1/2 × 4 × 3/4: one line for every platform.
    const sleepers = list.lines.find((l) => l.roles.includes('base-sleeper'));
    expect(sleepers?.refs).toEqual([
      { cabinetId: 'Run: Sink wall', quantity: 4 },
      { cabinetId: 'B3', quantity: 2 },
    ]);
    expect(sleepers?.mark).toMatch(/^P\d+$/);
    const marks = list.lines.map((l) => l.mark);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('lists runs after the cabinets in by-cabinet mode, and a lone platform with its cabinet', () => {
    const byCabinet = buildCutList(job, DEFAULT_RULES, { mode: 'by-cabinet', includeFronts: true, sort: { key: 'length', dir: 'desc' } });
    expect(byCabinet.runSections.map((s) => [s.ref, s.lines.map((l) => l.name)])).toEqual([
      ['Run: Sink wall', ['Base rail, front', 'Base rail, back', 'Base sleeper', 'Kick skin']],
    ]);
    const b3 = byCabinet.sections.find((s) => s.cabinet.id === 'B3');
    expect(b3?.lines.slice(-4).map((l) => l.name)).toEqual(['Base rail, front', 'Base rail, back', 'Base sleeper', 'Kick skin']);
    const pieces = (n: number, s: { pieces: number }) => n + s.pieces;
    expect(byCabinet.sections.reduce(pieces, 0) + byCabinet.runSections.reduce(pieces, 0)).toBe(list.totals.panelPieces + list.totals.laminatePieces);
  });

  it('warns when a run mixes depths and sizes its base for the shallowest', () => {
    const mixed = buildCutList([base({ run: 'Island' }), base({ id: 'B2', run: 'Island', depth: inches(21) })], DEFAULT_RULES);
    expect(mixed.jobIssues).toEqual([
      { ref: 'Run: Island', issue: { field: 'depth', severity: 'warning', message: 'The cabinets in this run are different depths. Its base is sized for the shallowest (21″).' } },
    ]);
    const sleeper = mixed.lines.find((l) => l.roles.includes('base-sleeper'));
    expect(toInches(sleeper!.length)).toBe(21 - 3 - 1.5);
  });

  it('leaves off a base too shallow to build, and says why', () => {
    const shallow = buildCutList([base({ depth: inches(4) })], DEFAULT_RULES);
    expect(shallow.jobIssues[0]).toMatchObject({ ref: 'B1', issue: { severity: 'error', field: 'method.kickDepth' } });
    expect(shallow.jobIssues[0]?.issue.message).toMatch(/too shallow for a ladder base/);
    expect(shallow.lines.some((l) => l.roles.includes('base-rail-front'))).toBe(false);
    expect(shallow.blocked).toEqual([]);
  });

  it('makes no base with no toe kick, or with legs', () => {
    expect(jobParts(job, { ...DEFAULT_RULES, toeKickHeight: inches(0) }).parts).toEqual([]);
    expect(jobParts(job, withMethod({ baseType: 'legs' })).parts).toEqual([]);
    expect(jobParts(job, withMethod({ id: 'B' })).parts).toEqual([]);
  });

  it('leaves out blocked cabinets', () => {
    const parts = jobParts([base({ run: 'Run 1' }), base({ id: 'B2', run: 'Run 1', width: inches(1) })], DEFAULT_RULES).parts;
    expect(toInches(parts.find((p) => p.part.role === 'kick-skin')!.part.length)).toBe(30);
  });
});

describe('features on the cut list', () => {
  const b = withMethod({ id: 'B' });

  it('notes the kick notch on the line', () => {
    const list = buildCutList([base({ finishedEnds: 'left' })], b);
    const sides = list.lines.find((l) => l.roles.includes('side-left'));
    expect(sides).toMatchObject({ name: 'Left side / Right side', quantity: 2, note: 'notched 4 × 3' });
    expect(list.lines.find((l) => l.roles.includes('laminate-side-left'))?.note).toBe('notched 4 × 3');
    expect(list.lines.find((l) => l.roles.includes('back'))?.note).toBeUndefined();
  });

  it('does not merge parts that differ only in features', () => {
    // The base's notched sides and the wall cabinet's plain sides are both 34 1/2 × 23 1/4 × 3/4.
    const wall = base({ id: 'W1', type: 'wall', height: inches(34.5) });
    const list = buildCutList([base(), wall], b);
    const sides = list.lines.filter((l) => l.roles.includes('side-left'));
    expect(sides.map((l) => [toInches(l.length), toInches(l.width), l.note, l.refs.map((r) => r.cabinetId)])).toEqual([
      [34.5, 23.25, 'notched 4 × 3', ['B1']],
      [34.5, 23.25, undefined, ['W1']],
    ]);
    expect(sides[0]!.mark).not.toBe(sides[1]!.mark);
  });
});

describe('method settings: validation', () => {
  const errorsFor = (rules: ConstructionRules, spec = base()) =>
    validate(spec, rules)
      .filter((i) => i.severity === 'error')
      .map((i) => [i.field, i.message]);

  it('accepts the defaults', () => {
    expect(errorsFor(DEFAULT_RULES)).toEqual([]);
  });

  it('names the setting and says what is wrong', () => {
    expect(errorsFor(withMethod({ id: 'C' as MethodSettings['id'] }))).toEqual([
      ['method.id', 'Construction method must be A (separate base) or B (integral toe kick).'],
    ]);
    expect(errorsFor(withMethod({ sleeperSpacingMax: inches(0) }))).toEqual([['method.sleeperSpacingMax', 'Sleeper spacing must be greater than zero.']]);
    expect(errorsFor(withMethod({ kickDepth: -1 as Ticks }))).toEqual([['method.kickDepth', 'Kick depth cannot be negative.']]);
    expect(errorsFor(withMethod({ legsPerBox: 2.5 }))).toEqual([['method.legsPerBox', 'Legs per box must be a whole number, 1 or more.']]);
    expect(errorsFor(withMethod({ backThickness: inches(0) }))).toEqual([
      ['method.backThickness', 'Back thickness must be greater than zero, or the same as the panels.'],
    ]);
    expect(errorsFor({ ...DEFAULT_RULES, method: undefined as unknown as MethodSettings })).toEqual([
      ['method', 'The construction method is missing from these rules.'],
    ]);
  });

  it('checks that the method fits the cabinet', () => {
    expect(errorsFor(withMethod({ baseTop: 'stretchers', stretcherWidth: inches(12) }))).toEqual([
      ['method.stretcherWidth', 'Two stretchers are wider than the box is deep (23 1/4"). Use narrower stretchers.'],
    ]);
    expect(errorsFor(withMethod({ id: 'B', kickDepth: inches(24) }))).toEqual([
      ['method.kickDepth', 'Kick depth must be less than the depth of the sides (23 1/4").'],
    ]);
    expect(errorsFor(withMethod({ backType: 'rabbet', backGrooveDepth: inches(3 / 4) }))).toEqual([
      ['method.backGrooveDepth', 'Back groove depth must be less than the panel thickness (3/4").'],
    ]);
    expect(errorsFor(withMethod({ backType: 'dado', nailerWidth: inches(30) }))).toEqual([
      ['method.nailerWidth', 'Nailer width must be less than the inside height of the box (29").'],
    ]);
    expect(errorsFor(withMethod({ backType: 'dado', backThickness: inches(1 / 4) }), base({ depth: inches(1) }))).toEqual([
      ['depth', 'Depth must be more than the back and its dado inset (1").'],
    ]);
  });

  it('only checks stretchers and the kick notch on base cabinets', () => {
    const wall = base({ type: 'wall', height: inches(30), depth: inches(12) });
    expect(errorsFor(withMethod({ id: 'B', baseTop: 'stretchers', stretcherWidth: inches(10), kickDepth: inches(12) }), wall)).toEqual([]);
  });
});

describe('B: integral toe kick', () => {
  const b = withMethod({ id: 'B' });

  it('runs the sides to the floor and keeps the box the same as method A', () => {
    const a = new Map(calculateParts(base(), DEFAULT_RULES).parts.map((p) => [p.role, p]));
    const parts = calculateParts(base(), b).parts;
    for (const part of parts) {
      if (part.role === 'side-left' || part.role === 'side-right' || part.role === 'kick-board') continue;
      expect(part, part.role).toEqual(a.get(part.role));
    }
    expect(toInches(parts.find((p) => p.role === 'side-left')!.length)).toBe(36 - 1.5);
  });

  it('makes no notch or kick board without a toe kick', () => {
    const parts = calculateParts(base(), { ...b, toeKickHeight: inches(0) }).parts;
    expect(parts.some((p) => p.features)).toBe(false);
    expect(parts.some((p) => p.role === 'kick-board')).toBe(false);
  });
});
