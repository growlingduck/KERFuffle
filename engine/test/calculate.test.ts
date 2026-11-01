import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  LEGACY_SHEET_RULES,
  LEGACY_WEB_RULES,
  PART_ORDER,
  calculateParts,
  inches,
  toInches,
  type CabinetSpec,
  type ConstructionRules,
  type FinishedEnds,
  type Part,
  type PartRole,
} from '../src/index';

const base: CabinetSpec = {
  id: 'B1',
  type: 'base',
  width: inches(30),
  height: inches(36),
  depth: inches(24),
  shelfCount: 1,
  finishedEnds: 'left',
  quantity: 1,
};
const wall: CabinetSpec = {
  id: 'W1',
  type: 'wall',
  width: inches(30),
  height: inches(30),
  depth: inches(12),
  shelfCount: 2,
  finishedEnds: 'both',
  quantity: 1,
};

function run(spec: Partial<CabinetSpec> = {}, rules: Partial<ConstructionRules> = {}, from = base) {
  const result = calculateParts({ ...from, ...spec }, { ...DEFAULT_RULES, ...rules });
  expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  return result.parts;
}

function part(parts: Part[], role: PartRole): Part {
  const found = parts.find((p) => p.role === role);
  if (!found) throw new Error(`no ${role} part`);
  return found;
}

/** [length, width] in inches, for compact assertions. */
function size(p: Part): [number, number] {
  return [toInches(p.length), toInches(p.width)];
}

describe('calculateParts: structure', () => {
  it('returns parts in the stable cut-list order, panels before laminate', () => {
    const parts = run({ finishedEnds: 'both' });
    expect(parts.map((p) => p.role)).toEqual(PART_ORDER);
    const firstLaminate = parts.findIndex((p) => p.category === 'laminate');
    expect(parts.slice(firstLaminate).every((p) => p.category === 'laminate')).toBe(true);
  });

  it('carries the cabinet ID to every part', () => {
    expect(new Set(run({ id: 'K-7' }).map((p) => p.cabinetId))).toEqual(new Set(['K-7']));
  });

  it('is deterministic and does not modify its inputs', () => {
    const spec = { ...base };
    const rules = { ...DEFAULT_RULES };
    const first = calculateParts(spec, rules);
    expect(calculateParts(spec, rules)).toEqual(first);
    expect(spec).toEqual(base);
    expect(rules).toEqual(DEFAULT_RULES);
  });

  it('returns no parts, only issues, when there is an error', () => {
    const result = calculateParts({ ...base, width: inches(1) }, DEFAULT_RULES);
    expect(result.parts).toEqual([]);
    expect(result.issues.some((issue) => issue.severity === 'error' && issue.field === 'width')).toBe(true);
  });

  it('never returns zero or negative sizes, even for the smallest valid cabinet', () => {
    // Width just over 2 x 3/4 + 2 x 1/8; depth just over 3/4 + 1/8 setback.
    const parts = run({ width: inches(1.75 + 1 / 64), height: inches(5.5 + 1 / 64), depth: inches(7 / 8 + 1 / 64) });
    for (const p of parts) {
      expect(p.length).toBeGreaterThan(0);
      expect(p.width).toBeGreaterThan(0);
      if (p.thickness !== null) expect(p.thickness).toBeGreaterThan(0);
    }
  });

  it('multiplies every quantity by the cabinet quantity', () => {
    const one = run({ shelfCount: 2 });
    const three = run({ shelfCount: 2, quantity: 3 });
    expect(three.map((p) => p.quantity)).toEqual(one.map((p) => p.quantity * 3));
  });

  it('omits shelves when the shelf count is zero', () => {
    expect(run({ shelfCount: 0 }).some((p) => p.role === 'shelf')).toBe(false);
  });

  it.each([
    ['none', []],
    ['left', ['laminate-side-left']],
    ['right', ['laminate-side-right']],
    ['both', ['laminate-side-left', 'laminate-side-right']],
  ] as [FinishedEnds, PartRole[]][])('finished ends "%s" add the matching side laminate', (ends, roles) => {
    const sides = run({ finishedEnds: ends })
      .filter((p) => p.role.startsWith('laminate-side'))
      .map((p) => p.role);
    expect(sides).toEqual(roles);
  });

  it('always includes front laminate', () => {
    expect(run({ finishedEnds: 'none' }).some((p) => p.role === 'laminate-front')).toBe(true);
  });
});

describe('calculateParts: Front reference size (confirmed by the shop)', () => {
  it('is always calculated, labeled as a door/laminate size, and marked optional', () => {
    const front = part(run(), 'front');
    expect(front.name).toBe('Front (door/laminate size)');
    expect(front.optional).toBe(true);
    expect(size(front)).toEqual([30.5, 30]);
  });

  it('is the only optional part', () => {
    const optional = run({ finishedEnds: 'both' }).filter((p) => p.optional);
    expect(optional.map((p) => p.role)).toEqual(['front']);
  });
});

describe('calculateParts: formulas and orientation', () => {
  it('uses box height (H - toe kick - countertop) for base cabinets', () => {
    const parts = run();
    for (const role of ['back', 'side-left', 'side-right', 'front'] as const) {
      expect(toInches(part(parts, role).length)).toBe(30.5);
    }
  });

  it('uses the full height everywhere for wall cabinets (confirmed by the shop)', () => {
    const parts = run({}, { toeKickHeight: inches(4), countertopThickness: inches(1.5) }, wall);
    for (const role of ['back', 'side-left', 'side-right', 'front'] as const) {
      expect(toInches(part(parts, role).length)).toBe(30);
    }
    for (const role of ['laminate-side-left', 'laminate-side-right', 'laminate-front'] as const) {
      expect(toInches(part(parts, role).length)).toBe(32); // 30 + 1" at each edge
    }
  });

  it('ignores toe kick and countertop for wall cabinets entirely', () => {
    const a = run({}, { toeKickHeight: inches(0), countertopThickness: inches(0) }, wall);
    const b = run({}, { toeKickHeight: inches(6), countertopThickness: inches(2) }, wall);
    expect(a).toEqual(b);
  });

  it('gives top and bottom the same orientation: length runs side to side (legacy swapped them)', () => {
    const parts = run();
    expect(size(part(parts, 'top'))).toEqual([28.5, 23.25]);
    expect(size(part(parts, 'bottom'))).toEqual([28.5, 23.25]);
    expect(size(part(parts, 'shelf'))).toEqual([28.25, 23.125]);
  });

  it('runs length vertically for back, sides, front and laminate', () => {
    const parts = run();
    expect(size(part(parts, 'back'))).toEqual([30.5, 30]);
    expect(size(part(parts, 'side-left'))).toEqual([30.5, 23.25]);
    expect(size(part(parts, 'laminate-side-left'))).toEqual([32.5, 26]);
    expect(size(part(parts, 'laminate-front'))).toEqual([32.5, 32]);
  });

  it('uses panel thickness for every box panel', () => {
    const parts = run({}, { panelThickness: inches(23 / 32) });
    for (const role of ['back', 'bottom', 'side-left', 'side-right', 'top', 'front'] as const) {
      expect(part(parts, role).thickness).toBe(inches(23 / 32));
    }
  });
});

describe('calculateParts: every rule field', () => {
  it('panelThickness: taken off inner width (twice) and depth (once)', () => {
    const parts = run({}, { panelThickness: inches(5 / 8) });
    expect(size(part(parts, 'bottom'))).toEqual([30 - 1.25, 24 - 0.625]);
  });

  it('toeKickHeight and countertopThickness: taken off base box height', () => {
    expect(toInches(part(run({}, { toeKickHeight: inches(3.5) }), 'back').length)).toBe(31);
    expect(toInches(part(run({}, { countertopThickness: inches(1) }), 'back').length)).toBe(31);
  });

  it('shelfThickness and wideShelfThickness: chosen by cabinet width', () => {
    const rules = { shelfThickness: inches(5 / 8), wideShelfThickness: inches(1.25) };
    expect(part(run({ width: inches(30) }, rules), 'shelf').thickness).toBe(inches(5 / 8));
    expect(part(run({ width: inches(42) }, rules), 'shelf').thickness).toBe(inches(1.25));
  });

  it('shelfThickWidthThreshold: moves the wide-shelf boundary', () => {
    const rules = { shelfThickWidthThreshold: inches(30) };
    expect(part(run({ width: inches(30) }, rules), 'shelf').thickness).toBe(inches(1));
    expect(part(run({ width: inches(29.5) }, rules), 'shelf').thickness).toBe(inches(3 / 4));
  });

  it('shelfThickComparison: "gte" makes exactly 36" wide; "gt" does not', () => {
    expect(part(run({ width: inches(36) }, { shelfThickComparison: 'gte' }), 'shelf').thickness).toBe(inches(1));
    expect(part(run({ width: inches(36) }, { shelfThickComparison: 'gt' }), 'shelf').thickness).toBe(inches(3 / 4));
    // Either way, just over 36 is wide and just under is not.
    for (const cmp of ['gt', 'gte'] as const) {
      expect(part(run({ width: inches(36 + 1 / 64) }, { shelfThickComparison: cmp }), 'shelf').thickness).toBe(inches(1));
      expect(part(run({ width: inches(36 - 1 / 64) }, { shelfThickComparison: cmp }), 'shelf').thickness).toBe(inches(3 / 4));
    }
  });

  it('shelfClearancePerSide: taken off shelf length once at each side', () => {
    // Inner width 28 1/2.
    expect(toInches(part(run(), 'shelf').length)).toBe(28.25); // default 1/8 each side
    expect(toInches(part(run({}, { shelfClearancePerSide: inches(1 / 4) }), 'shelf').length)).toBe(28);
    expect(toInches(part(run({}, { shelfClearancePerSide: inches(0) }), 'shelf').length)).toBe(28.5);
  });

  it('shelfSetback: taken off shelf depth only (default 1/8)', () => {
    expect(toInches(part(run(), 'shelf').width)).toBe(23.125);
    const parts = run({}, { shelfSetback: inches(1) });
    expect(toInches(part(parts, 'shelf').width)).toBe(22.25);
    expect(toInches(part(parts, 'side-left').width)).toBe(23.25);
  });

  it('laminateOversizePerEdge: added at both edges of each laminate dimension', () => {
    const parts = run({ finishedEnds: 'right' }, { laminateOversizePerEdge: inches(1 / 2) });
    expect(size(part(parts, 'laminate-side-right'))).toEqual([31.5, 25]);
    expect(size(part(parts, 'laminate-front'))).toEqual([31.5, 31]);
  });

  it('laminate never carries a thickness (confirmed by the shop)', () => {
    for (const p of run({ finishedEnds: 'both' }).filter((p) => p.category === 'laminate')) {
      expect(p.thickness).toBeNull();
    }
  });

  it('legacyWallBackDeductsBaseAllowances: wall back only, base unaffected', () => {
    const parts = run({}, { legacyWallBackDeductsBaseAllowances: true }, wall);
    expect(toInches(part(parts, 'back').length)).toBe(24.5);
    expect(toInches(part(parts, 'side-left').length)).toBe(30);
    expect(run({}, { legacyWallBackDeductsBaseAllowances: true })).toEqual(run());
  });

  it('legacyWallLaminateDeductsBaseAllowances: wall laminate only, base unaffected', () => {
    const parts = run({}, { legacyWallLaminateDeductsBaseAllowances: true }, wall);
    expect(toInches(part(parts, 'laminate-front').length)).toBe(26.5); // 30 - 5 1/2 + 2
    expect(toInches(part(parts, 'back').length)).toBe(30);
    expect(run({}, { legacyWallLaminateDeductsBaseAllowances: true })).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// Legacy reproduction
// ---------------------------------------------------------------------------

describe('legacy presets: hand-checked results', () => {
  // Wall 30 W x 30 H x 12 D, both ends, p 3/4, toe kick 4, countertop 1 1/2.
  // Worked by hand from the legacy formulas.

  it('LEGACY_WEB_RULES matches main.js buildWall: back 30, laminate 30 - 4 - 1 1/2 + 1 = 25 1/2', () => {
    const parts = calculateParts(wall, LEGACY_WEB_RULES).parts;
    expect(size(part(parts, 'back'))).toEqual([30, 30]);
    expect(size(part(parts, 'side-left'))).toEqual([30, 11.25]);
    expect(size(part(parts, 'front'))).toEqual([30, 30]);
    expect(size(part(parts, 'laminate-side-left'))).toEqual([25.5, 13]);
    expect(size(part(parts, 'laminate-front'))).toEqual([25.5, 31]);
  });

  it('LEGACY_SHEET_RULES matches CutList.xlsm wall rows: back 30 - 1 1/2 - 4 = 24 1/2, laminate 25 1/2', () => {
    const parts = calculateParts(wall, LEGACY_SHEET_RULES).parts;
    expect(size(part(parts, 'back'))).toEqual([24.5, 30]); // C23 = D5-I6-I5
    expect(size(part(parts, 'side-left'))).toEqual([30, 11.25]); // E23 = D5
    expect(size(part(parts, 'front'))).toEqual([30, 30]); // H23 = D5
    expect(size(part(parts, 'laminate-front'))).toEqual([25.5, 31]); // L23 = D5-I5-I6+1
  });
});

/**
 * Straight transliterations of the legacy formulas, in decimal inches, using
 * the legacy row layout (W, L, Th, count). Compared against the engine across
 * many inputs, they show the presets reproduce legacy exactly and that any
 * difference under DEFAULT_RULES is a deliberate rule change, not a port error.
 */
interface LegacyRow { W: number; L: number; Th: number | undefined; N: number }
interface LegacyInput { w: number; h: number; d: number; s: number; e: 'N' | 'L' | 'R' | 'B'; p: number; t: number; T: number }

/** main.js buildBase / buildWall, with ShelfTh. */
function legacyWeb(type: 'base' | 'wall', { w, h, d, s, e, p, t, T }: LegacyInput): Record<string, LegacyRow | undefined> {
  const S = w >= 36 ? 1 : 0.75;
  const boxH = type === 'base' ? h - t - T : h;
  const lamL = h - t - T + 1; // same expression in both buildBase and buildWall
  return {
    back: { W: w, L: boxH, Th: p, N: 1 },
    bottom: { W: w - p * 2, L: d - p, Th: p, N: 1 },
    left: { W: d - p, L: boxH, Th: p, N: 1 },
    right: { W: d - p, L: boxH, Th: p, N: 1 },
    top: { W: d - p, L: w - p * 2, Th: p, N: 1 },
    front: { W: w, L: boxH, Th: p, N: 1 },
    shelf: { W: d - p, L: w - p * 2 - 0.125, Th: S, N: s },
    lamLeft: e === 'L' || e === 'B' ? { W: d + 1, L: lamL, Th: undefined, N: 1 } : undefined,
    lamRight: e === 'R' || e === 'B' ? { W: d + 1, L: lamL, Th: undefined, N: 1 } : undefined,
    lamFront: { W: w + 1, L: lamL, Th: undefined, N: 1 },
  };
}

/** CutList.xlsm, sheet CutListCalculator: rows 14-17 (base) and 22-25 (wall). */
function legacySheet(type: 'base' | 'wall', i: LegacyInput): Record<string, LegacyRow | undefined> {
  const D4 = i.w, D5 = i.h, D6 = i.d, D7 = i.s, D8 = i.e;
  const I4 = i.p, I5 = i.t, I6 = i.T, I7 = D4 > 36 ? 1 : 0.75;
  const C14 = D4;
  const sideL = type === 'base' ? D5 - I6 - I5 : D5; // E15 / E23
  const lamL = D5 - I5 - I6 + 1; // J15 / J23 (identical)
  const lamOn = (side: 'L' | 'R') => D8 === side || D8 === 'B';
  return {
    back: { W: D4, L: D5 - I6 - I5, Th: I4, N: 1 }, // C15 and C23 (both deduct)
    bottom: { W: C14 - I4 - I4, L: D6 - I4, Th: I4, N: 1 },
    left: { W: D6 - I4, L: sideL, Th: I4, N: 1 },
    right: { W: D6 - I4, L: sideL, Th: I4, N: 1 },
    top: { W: D6 - I4, L: D4 - I4 - I4, Th: I4, N: 1 },
    front: { W: D4, L: sideL, Th: I4, N: 1 }, // H15 / H23
    shelf: { W: D6 - I4, L: D4 - I4 - I4 - 0.125, Th: I7, N: D7 },
    lamLeft: lamOn('L') ? { W: D6 + 1, L: lamL, Th: undefined, N: 1 } : undefined,
    lamRight: lamOn('R') ? { W: D6 + 1, L: lamL, Th: undefined, N: 1 } : undefined,
    lamFront: { W: D4 + 1, L: lamL, Th: undefined, N: 1 },
  };
}

/** Legacy row name -> engine role, and whether legacy W/L map to engine length/width or are swapped. */
const LEGACY_MAP: [string, PartRole, 'L-is-length' | 'W-is-length'][] = [
  ['back', 'back', 'L-is-length'],
  ['bottom', 'bottom', 'W-is-length'], // the legacy Top/Bottom swap, normalized
  ['left', 'side-left', 'L-is-length'],
  ['right', 'side-right', 'L-is-length'],
  ['top', 'top', 'L-is-length'],
  ['front', 'front', 'L-is-length'],
  ['shelf', 'shelf', 'L-is-length'],
  ['lamLeft', 'laminate-side-left', 'L-is-length'],
  ['lamRight', 'laminate-side-right', 'L-is-length'],
  ['lamFront', 'laminate-front', 'L-is-length'],
];

function normalizeLegacy(rows: Record<string, LegacyRow | undefined>) {
  const out: { role: PartRole; length: number; width: number; thickness: number | null; quantity: number }[] = [];
  for (const [name, role, orientation] of LEGACY_MAP) {
    const row = rows[name];
    if (!row || row.N === 0) continue; // legacy showed an empty row; the engine omits it
    const [length, width] = orientation === 'L-is-length' ? [row.L, row.W] : [row.W, row.L];
    out.push({ role, length, width, thickness: row.Th ?? null, quantity: row.N });
  }
  return out;
}

function engineAsInches(parts: Part[]) {
  return parts.map((p) => ({
    role: p.role,
    length: toInches(p.length),
    width: toInches(p.width),
    thickness: p.thickness === null ? null : toInches(p.thickness),
    quantity: p.quantity,
  }));
}

const GRID_WIDTHS = [12, 18, 23.75, 35.5, 35 + 63 / 64, 36, 36 + 1 / 64, 36.5, 48];
const GRID_HEIGHTS = { base: [30, 34.5, 36], wall: [12, 30, 42] };
const GRID_DEPTHS = [12, 23 + 7 / 8, 24];
const GRID_ENDS = ['N', 'L', 'R', 'B'] as const;
const ENDS_MAP = { N: 'none', L: 'left', R: 'right', B: 'both' } as const;
const GRID_PANELS = [0.75, 23 / 32];

function* grid() {
  for (const type of ['base', 'wall'] as const)
    for (const w of GRID_WIDTHS)
      for (const h of GRID_HEIGHTS[type])
        for (const d of GRID_DEPTHS)
          for (const e of GRID_ENDS)
            for (const p of GRID_PANELS)
              for (const s of [0, 1, 3]) yield { type, input: { w, h, d, s, e, p, t: 4, T: 1.5 } };
}

describe.each([
  ['LEGACY_WEB_RULES', LEGACY_WEB_RULES, legacyWeb],
  ['LEGACY_SHEET_RULES', LEGACY_SHEET_RULES, legacySheet],
] as const)('%s reproduces the legacy formulas across a grid of cabinets', (_name, preset, legacy) => {
  it('matches every part, size, thickness and count', () => {
    let cases = 0;
    for (const { type, input } of grid()) {
      const spec: CabinetSpec = {
        id: 'X',
        type,
        width: inches(input.w),
        height: inches(input.h),
        depth: inches(input.d),
        shelfCount: input.s,
        finishedEnds: ENDS_MAP[input.e],
        quantity: 1,
      };
      const rules: ConstructionRules = { ...preset, panelThickness: inches(input.p) };
      const result = calculateParts(spec, rules);
      expect(engineAsInches(result.parts), JSON.stringify({ type, input })).toEqual(
        normalizeLegacy(legacy(type, input)),
      );
      cases++;
    }
    expect(cases).toBeGreaterThan(1000);
  });
});

describe('DEFAULT_RULES differs from the legacy web version only where the shop decided', () => {
  it('matches web once the shop decisions are applied to the web results', () => {
    for (const { type, input } of grid()) {
      const spec: CabinetSpec = {
        id: 'X',
        type,
        width: inches(input.w),
        height: inches(input.h),
        depth: inches(input.d),
        shelfCount: input.s,
        finishedEnds: ENDS_MAP[input.e],
        quantity: 1,
      };
      const rules = { panelThickness: inches(input.p) };
      const ours = engineAsInches(calculateParts(spec, { ...DEFAULT_RULES, ...rules }).parts);
      const web = normalizeLegacy(legacyWeb(type, input));
      for (const row of web) {
        if (row.role === 'shelf') {
          row.length -= 0.125; // 1/8 clearance at EACH side, not 1/8 total
          row.width -= 0.125; // 1/8 setback from the front
        }
        if (row.role.startsWith('laminate')) {
          if (type === 'wall') row.length = input.h + 1; // wall laminate uses full height
          row.length += 1; // 1" all around: +2 on each dimension, not +1
          row.width += 1;
        }
      }
      expect(ours).toEqual(web);
    }
  });
});
