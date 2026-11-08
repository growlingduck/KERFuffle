/**
 * Tall cabinets (docs/calculation-rules.md, "Tall cabinets"). Every expected
 * size here was worked by hand from the formulas on that page, not read back
 * from the code. The cabinet is the page's worked example unless noted:
 * 18 W × 84 H × 24 D, box height 84 − 4 = 80, 4 adjustable shelves, left end
 * finished, 3/4″ panels.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  buildCutList,
  calculateParts,
  defaultFixedShelfCount,
  dependenciesFor,
  inches,
  jobParts,
  parseDimension,
  shelfSections,
  sheetLengthIssues,
  validate,
  type CabinetSpec,
  type ConstructionRules,
  type Material,
  type MethodSettings,
  type Part,
  type PartRole,
  type Ticks,
} from '../src';

const d = (text: string): Ticks => {
  const result = parseDimension(text);
  if (!result.ok) throw new Error(text);
  return result.value;
};

const tall = (overrides: Partial<CabinetSpec> = {}): CabinetSpec => ({
  id: 'T1',
  type: 'tall',
  width: inches(18),
  height: inches(84),
  depth: inches(24),
  shelfCount: 4,
  finishedEnds: 'left',
  quantity: 1,
  fixedShelfCount: 1,
  midNailer: true,
  ...overrides,
});

const withMethod = (method: Partial<MethodSettings>): ConstructionRules => ({ ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, ...method } });

const METHODS = {
  A1: withMethod({}),
  A2: withMethod({ baseType: 'legs' }),
  B: withMethod({ id: 'B' }),
} as const;

const BACKS = {
  applied: {},
  dado: { backType: 'dado', backThickness: inches(1 / 4) },
} as const satisfies Record<string, Partial<MethodSettings>>;

function partsOf(spec: CabinetSpec, rules: ConstructionRules): Part[] {
  const result = calculateParts(spec, rules);
  expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return result.parts;
}
const size = (part: Part | undefined) => part && [part.length, part.width, part.thickness, part.quantity];
const one = (parts: Part[], role: PartRole) => parts.find((p) => p.role === role);

/** By hand, per back: the back, how deep the members are, the fixed shelf and shelf widths. */
const BY_BACK = {
  applied: {
    back: [d('80'), d('18'), d('3/4')],
    member: d('23 1/4'),
    fixedWidth: d('23 1/4'),
    shelfWidth: d('23 1/8'),
    // Split at 3/4 + section + 3/8: one fixed shelf, sections 38 7/8; two, 25 21/32.
    split: { 1: [d('40'), d('40')], 2: [d('26 25/32'), d('53 7/32')] },
    nailers: () => 0,
  },
  dado: {
    // 80 − 1 1/2 + 1/2 = 79; 16 1/2 + 1/2 = 17.
    back: [d('79'), d('17'), d('1/4')],
    member: d('24'),
    // 24 − 3/4 − 1/4 = 23 to the face of the back.
    fixedWidth: d('23'),
    shelfWidth: d('22 7/8'),
    // Each piece keeps one groove allowance: lower J − 1/2, upper 79 − lower.
    split: { 1: [d('39 1/2'), d('39 1/2')], 2: [d('26 9/32'), d('52 23/32')] },
    nailers: (fixed: number) => (fixed > 0 ? 2 : 1),
  },
} as const;

/** By hand, per method: the sides, the end laminate, and the kick board. */
const BY_METHOD = {
  A1: { side: d('80'), endLaminate: d('82'), notched: false, kickBoard: null },
  A2: { side: d('80'), endLaminate: d('82'), notched: false, kickBoard: d('18') },
  // Sides run the full overall height; the laminate 84 + 2.
  B: { side: d('84'), endLaminate: d('86'), notched: true, kickBoard: d('16 1/2') },
} as const;

describe('tall cabinets, every method × fixed shelves × back', () => {
  for (const [methodName, methodRules] of Object.entries(METHODS) as [keyof typeof METHODS, ConstructionRules][]) {
    for (const [backName, back] of Object.entries(BACKS) as [keyof typeof BACKS, Partial<MethodSettings>][]) {
      const rules = { ...methodRules, method: { ...methodRules.method, ...back } };
      const hand = BY_BACK[backName];
      const how = BY_METHOD[methodName];
      for (const fixed of [0, 1, 2]) {
        it(`${methodName}, ${backName} back, ${fixed} fixed shelves`, () => {
          const parts = partsOf(tall({ fixedShelfCount: fixed }), rules);
          expect(size(one(parts, 'back'))).toEqual([...hand.back, 1]);
          expect(size(one(parts, 'bottom'))).toEqual([d('16 1/2'), hand.member, d('3/4'), 1]);
          expect(size(one(parts, 'top'))).toEqual([d('16 1/2'), hand.member, d('3/4'), 1]);
          expect(size(one(parts, 'side-left'))).toEqual([how.side, hand.member, d('3/4'), 1]);
          expect(size(one(parts, 'front'))).toEqual([d('80'), d('18'), d('3/4'), 1]);
          expect(size(one(parts, 'shelf'))).toEqual([d('16 1/4'), hand.shelfWidth, d('3/4'), 4]);
          expect(size(one(parts, 'fixed-shelf'))).toEqual(fixed === 0 ? undefined : [d('16 1/2'), hand.fixedWidth, d('3/4'), fixed]);
          const nailers = hand.nailers(fixed);
          expect(size(one(parts, 'nailer'))).toEqual(nailers === 0 ? undefined : [d('16 1/2'), d('4'), d('3/4'), nailers]);
          expect(size(one(parts, 'laminate-side-left'))).toEqual([how.endLaminate, d('26'), null, 1]);
          expect(size(one(parts, 'laminate-front'))).toEqual([d('82'), d('20'), null, 1]);
          expect(one(parts, 'side-left')?.features !== undefined).toBe(how.notched);
          expect(one(parts, 'laminate-side-left')?.features !== undefined).toBe(how.notched);
          expect(size(one(parts, 'kick-board'))).toEqual(how.kickBoard === null ? undefined : [how.kickBoard, d('4'), d('3/4'), 1]);
          // Tall cabinets never get stretchers.
          expect(one(parts, 'stretcher-front')).toBeUndefined();
        });

        if (fixed > 0) {
          it(`${methodName}, ${backName} back, ${fixed} fixed shelves, split back`, () => {
            const parts = partsOf(tall({ fixedShelfCount: fixed, splitBack: true }), rules);
            const backs = parts.filter((p) => p.role === 'back');
            expect(backs.map((p) => [p.name, p.length, p.width, p.thickness, p.quantity])).toEqual([
              ['Back, lower', hand.split[fixed as 1 | 2][0], hand.back[1], hand.back[2], 1],
              ['Back, upper', hand.split[fixed as 1 | 2][1], hand.back[1], hand.back[2], 1],
            ]);
            // The two pieces add up to the one-piece back.
            expect(backs[0]!.length + backs[1]!.length).toBe(hand.back[0]);
          });
        }
      }
    }
  }

  it('turns the mid nailer off per cabinet', () => {
    const parts = partsOf(tall({ midNailer: false }), withMethod(BACKS.dado));
    expect(one(parts, 'nailer')?.quantity).toBe(1);
  });

  it('stands on its own platform in A1 when it has no run', () => {
    const { parts } = jobParts([tall()], METHODS.A1);
    expect(parts.map(({ part }) => [part.role, part.length, part.quantity])).toEqual([
      ['base-rail-front', d('18'), 1],
      ['base-rail-back', d('18'), 1],
      ['base-sleeper', d('19 1/2'), 2],
      ['kick-skin', d('18'), 1],
    ]);
  });

  it('shares one ladder base with the base cabinets in its run (A1)', () => {
    const base = (id: string, width: number): CabinetSpec => ({
      id, type: 'base', width: inches(width), height: inches(36), depth: inches(24), shelfCount: 1, finishedEnds: 'none', quantity: 1, run: 'Pantry wall',
    });
    const cabinets = [base('B1', 30), tall({ id: 'T1', width: inches(24), run: 'Pantry wall' }), base('B2', 36)];
    const { parts, issues } = jobParts(cabinets, METHODS.A1);
    expect(issues).toEqual([]);
    // 30 + 24 + 36 = 90, one section; (90 − 3/4) ÷ 24 = 3.7 → 4, + 1 = 5 sleepers.
    expect(parts.map(({ part }) => [part.cabinetId, part.role, part.length, part.quantity])).toEqual([
      ['Run: Pantry wall', 'base-rail-front', d('90'), 1],
      ['Run: Pantry wall', 'base-rail-back', d('90'), 1],
      ['Run: Pantry wall', 'base-sleeper', d('19 1/2'), 5],
      ['Run: Pantry wall', 'kick-skin', d('90'), 1],
    ]);
  });

  it('counts legs and clips per tall box (A2)', () => {
    const cut = buildCutList([tall()], METHODS.A2);
    expect(cut.hardware.map((h) => [h.item, h.quantity])).toEqual([
      ['leveling-leg', 4],
      ['kick-clip', 2],
    ]);
  });
});

describe('tall cabinet sections', () => {
  it('spaces fixed shelves evenly and shares the adjustable shelves, extras low', () => {
    // 80 box: inside 78 1/2, less one 3/4 shelf = 77 3/4, two sections of 38 7/8.
    expect(shelfSections(d('80'), d('3/4'), 1, 5)).toEqual([
      { bottom: d('3/4'), height: d('38 7/8'), shelves: 3 },
      { bottom: d('3/4') + d('38 7/8') + d('3/4'), height: d('38 7/8'), shelves: 2 },
    ]);
    // Two fixed shelves: 77 ÷ 3 = 25 21/32 rounded down; the top takes the rest, 25 11/16.
    const two = shelfSections(d('80'), d('3/4'), 2, 4);
    expect(two.map((s) => [s.height, s.shelves])).toEqual([
      [d('25 21/32'), 2],
      [d('25 21/32'), 1],
      [d('25 11/16'), 1],
    ]);
  });

  it('starts a new tall cabinet with a fixed shelf when its box is over 72″', () => {
    // 84 − 4 = 80 > 72; 76 − 4 = 72, not over.
    expect(defaultFixedShelfCount(inches(84), DEFAULT_RULES)).toBe(1);
    expect(defaultFixedShelfCount(inches(76), DEFAULT_RULES)).toBe(0);
    expect(defaultFixedShelfCount(inches(77), DEFAULT_RULES)).toBe(1);
    expect(defaultFixedShelfCount(inches(84), { ...DEFAULT_RULES, tallFixedShelfAbove: inches(84) })).toBe(0);
  });
});

describe('tall cabinet validation', () => {
  const errorsOn = (spec: CabinetSpec, rules: ConstructionRules = DEFAULT_RULES) =>
    validate(spec, rules).filter((i) => i.severity === 'error').map((i) => i.field);

  it('needs more height than the toe kick, not the countertop', () => {
    expect(errorsOn(tall({ height: inches(4), fixedShelfCount: 0 }))).toContain('height');
    // 5″ is under kick + countertop (5 1/2″) but over the kick alone; the box is then too short for anything else.
    expect(validate(tall({ height: inches(5), fixedShelfCount: 0, shelfCount: 0 }), DEFAULT_RULES).some((i) => i.message.includes('toe kick plus countertop'))).toBe(false);
  });

  it('refuses a split back without a fixed shelf', () => {
    expect(errorsOn(tall({ fixedShelfCount: 0, splitBack: true }))).toEqual(['splitBack']);
  });

  it('refuses fixed shelves that leave a section two panels tall or less', () => {
    // 12 high: box 8, inside 6 1/2. Two shelves leave 5 ÷ 3 = 1 21/32 > 1 1/2: fine. Three leave 4 1/4 ÷ 4 = 1 1/16: too small.
    expect(errorsOn(tall({ height: inches(12), fixedShelfCount: 2 }))).toEqual([]);
    expect(errorsOn(tall({ height: inches(12), fixedShelfCount: 3 }))).toEqual(['fixedShelfCount']);
    expect(errorsOn(tall({ fixedShelfCount: 1.5 }))).toContain('fixedShelfCount');
  });

  it('ignores the tall-only fields on base and wall cabinets', () => {
    const base = tall({ type: 'base', height: inches(36), fixedShelfCount: 9, splitBack: true });
    expect(errorsOn(base)).toEqual([]);
    expect(calculateParts(base, DEFAULT_RULES).parts.some((p) => p.role === 'fixed-shelf')).toBe(false);
    expect(calculateParts(base, DEFAULT_RULES).parts.filter((p) => p.role === 'back')).toHaveLength(1);
  });

  it('warns when a part is longer than its sheet, and suggests a split back for the back', () => {
    const sheet = (id: string, name: string, length: number): Material => ({
      id, kind: 'sheet', name, thickness: inches(3 / 4), length: inches(length), width: inches(48), grain: 'length',
      bandingWidth: null, rollFeet: null, unit: null, price: null, onHand: null,
    });
    const materials = { box: sheet('box', 'Birch 3/4', 97), back: sheet('back', 'Birch 3/4', 97) };
    // 104 high: box 100, back 100 and sides 100, over a 97 sheet.
    const spec = tall({ height: inches(104), fixedShelfCount: 0 });
    const parts = calculateParts(spec, DEFAULT_RULES).parts;
    const issues = sheetLengthIssues(spec, parts, DEFAULT_RULES, materials);
    expect(issues.map((i) => [i.field, i.severity])).toEqual([
      ['splitBack', 'warning'],
      ['height', 'warning'],
    ]);
    expect(issues[0]!.message).toContain('Add a fixed shelf and turn on Split back');
    expect(issues[1]!.message).toContain('Left side, Right side and Front (door/laminate size) are longer');
    // Split, the back's pieces fit; the sides still don't.
    const split = tall({ height: inches(104), fixedShelfCount: 1, splitBack: true });
    const splitIssues = sheetLengthIssues(split, calculateParts(split, DEFAULT_RULES).parts, DEFAULT_RULES, materials);
    expect(splitIssues.map((i) => i.field)).toEqual(['height']);
    // Base cabinets never warn here.
    expect(sheetLengthIssues({ type: 'base' }, parts, DEFAULT_RULES, materials)).toEqual([]);
  });
});

describe('tall cabinets on the cut list', () => {
  it('merges the fixed shelf with a top and bottom of the same size, listed after them', () => {
    const cut = buildCutList([tall()], DEFAULT_RULES);
    const line = cut.lines.find((l) => l.roles.includes('fixed-shelf'))!;
    expect(line.name).toBe('Bottom / Top / Fixed shelf');
    expect(line.quantity).toBe(3);
    // Banded on the front edge, like the bottom: 16 1/2 each.
    expect(line.banding).toBe(d('16 1/2') * 3);
  });

  it('traces toe kick on the box height and countertop on nothing', () => {
    expect(dependenciesFor('toe', 'tall')['side-left']).toEqual(['L']);
    expect(dependenciesFor('ctop', 'tall')).toEqual({});
  });
});
