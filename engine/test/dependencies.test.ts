import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  TRACE_KEYS,
  calculateParts,
  dependenciesFor,
  inches,
  ticks,
  type CabinetSpec,
  type ConstructionRules,
  type DependencyMap,
  type Part,
  type PartField,
  type TraceKey,
} from '../src';

/** The smallest step the engine knows: one tick. */
const NUDGE = 1;

type Case = { spec: CabinetSpec; rules: ConstructionRules };
const bump = (value: number) => ticks(value + NUDGE);

/** Move one input by the smallest step (or flip it, for finished ends). */
const PERTURB: Record<TraceKey, (c: Case) => Case> = {
  w: ({ spec, rules }) => ({ spec: { ...spec, width: bump(spec.width) }, rules }),
  h: ({ spec, rules }) => ({ spec: { ...spec, height: bump(spec.height) }, rules }),
  // Box height has no input of its own: it moves with the overall height.
  box: ({ spec, rules }) => ({ spec: { ...spec, height: bump(spec.height) }, rules }),
  toe: ({ spec, rules }) => ({ spec, rules: { ...rules, toeKickHeight: bump(rules.toeKickHeight) } }),
  ctop: ({ spec, rules }) => ({ spec, rules: { ...rules, countertopThickness: bump(rules.countertopThickness) } }),
  d: ({ spec, rules }) => ({ spec: { ...spec, depth: bump(spec.depth) }, rules }),
  shelves: ({ spec, rules }) => ({ spec: { ...spec, shelfCount: spec.shelfCount + 1 }, rules }),
  fixed: ({ spec, rules }) => ({ spec: { ...spec, fixedShelfCount: (spec.fixedShelfCount ?? 0) + 1 }, rules }),
  ends: ({ spec, rules }) => ({ spec: { ...spec, finishedEnds: spec.finishedEnds === 'none' ? 'both' : 'none' }, rules }),
  qty: ({ spec, rules }) => ({ spec: { ...spec, quantity: spec.quantity + 1 }, rules }),
  p: ({ spec, rules }) => ({ spec, rules: { ...rules, panelThickness: bump(rules.panelThickness) } }),
  cl: ({ spec, rules }) => ({ spec, rules: { ...rules, shelfClearancePerSide: bump(rules.shelfClearancePerSide) } }),
  sb: ({ spec, rules }) => ({ spec, rules: { ...rules, shelfSetback: bump(rules.shelfSetback) } }),
  // The wide-shelf rule decides the shelf thickness; nudge both thicknesses it picks between.
  wide: ({ spec, rules }) => ({
    spec,
    rules: { ...rules, shelfThickness: bump(rules.shelfThickness), wideShelfThickness: bump(rules.wideShelfThickness) },
  }),
  lam: ({ spec, rules }) => ({ spec, rules: { ...rules, laminateOversizePerEdge: bump(rules.laminateOversizePerEdge) } }),
};

function partsOf({ spec, rules }: Case): Map<string, Part> {
  const result = calculateParts(spec, rules);
  expect(result.parts.length, JSON.stringify(result.issues)).toBeGreaterThan(0);
  return new Map(result.parts.map((part) => [part.role, part]));
}

/** Which part fields moved. A part that appears or disappears counts as a quantity change. */
function derive(before: Case, after: Case): Record<string, PartField[]> {
  const a = partsOf(before);
  const b = partsOf(after);
  const out: Record<string, PartField[]> = {};
  for (const role of new Set([...a.keys(), ...b.keys()])) {
    const pa = a.get(role);
    const pb = b.get(role);
    const fields: PartField[] = [];
    if (!pa || !pb) fields.push('qty');
    else {
      if (pa.length !== pb.length) fields.push('L');
      if (pa.width !== pb.width) fields.push('W');
      if (pa.thickness !== pb.thickness) fields.push('T');
      if (pa.quantity !== pb.quantity) fields.push('qty');
    }
    if (fields.length > 0) out[role] = fields;
  }
  return out;
}

function normalize(map: DependencyMap): Record<string, PartField[]> {
  const order: PartField[] = ['L', 'W', 'T', 'qty'];
  return Object.fromEntries(
    Object.entries(map).map(([role, fields]) => [role, [...(fields ?? [])].sort((x, y) => order.indexOf(x) - order.indexOf(y))]),
  );
}

const spec = (overrides: Partial<CabinetSpec>): CabinetSpec => ({
  id: 'B1',
  type: 'base',
  width: inches(30),
  height: inches(36),
  depth: inches(24),
  shelfCount: 1,
  finishedEnds: 'both',
  quantity: 1,
  ...overrides,
});

// Samples sit away from the 36″ wide-shelf boundary, where a 1/64″ nudge in
// width would also flip the shelf thickness. All have shelves and both ends
// finished, so every part is present.
const SAMPLES: [string, Case][] = [
  ['base 30 × 36 × 24 (worked example)', { spec: spec({}), rules: DEFAULT_RULES }],
  ['base 42 wide (1″ shelves)', { spec: spec({ width: inches(42), shelfCount: 2 }), rules: DEFAULT_RULES }],
  ['base 18 wide, quantity 3', { spec: spec({ width: inches(18), quantity: 3 }), rules: DEFAULT_RULES }],
  ['wall 30 × 30 × 12', { spec: spec({ type: 'wall', height: inches(30), depth: inches(12), shelfCount: 2 }), rules: DEFAULT_RULES }],
  ['tall 18 × 84 × 24, 1 fixed shelf', { spec: spec({ type: 'tall', width: inches(18), height: inches(84), shelfCount: 4, fixedShelfCount: 1 }), rules: DEFAULT_RULES }],
];

describe('dependency map', () => {
  describe.each(SAMPLES)('%s', (_name, sample) => {
    it.each(TRACE_KEYS)('%s matches what the formulas move', (key) => {
      const derived = derive(sample, PERTURB[key](sample));
      expect(normalize(dependenciesFor(key, sample.spec.type))).toEqual(normalize(derived));
    });
  });

  it('starts from zero shelves too: adding one still reads as a shelf quantity change', () => {
    const sample = { spec: spec({ shelfCount: 0 }), rules: DEFAULT_RULES };
    expect(derive(sample, PERTURB.shelves(sample))).toEqual({ shelf: ['qty'] });
  });

  it('toe kick and countertop move nothing on a wall cabinet', () => {
    expect(dependenciesFor('toe', 'wall')).toEqual({});
    expect(dependenciesFor('ctop', 'wall')).toEqual({});
  });

  it('on a tall cabinet the countertop moves nothing and the toe kick moves the box height', () => {
    expect(dependenciesFor('ctop', 'tall')).toEqual({});
    expect(dependenciesFor('toe', 'tall')).toEqual(dependenciesFor('box', 'tall'));
    expect(dependenciesFor('fixed', 'tall')).toEqual({ 'fixed-shelf': ['qty'] });
    expect(dependenciesFor('fixed', 'base')).toEqual({});
  });
});
