import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  LEGACY_SHEET_RULES,
  calculateParts,
  inches,
  validate,
  type CabinetSpec,
  type ConstructionRules,
  type ValidationIssue,
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

const wall: CabinetSpec = { ...base, id: 'W1', type: 'wall', height: inches(30), depth: inches(12) };

function errors(issues: ValidationIssue[]) {
  return issues.filter((issue) => issue.severity === 'error').map((issue) => issue.field);
}
function warnings(issues: ValidationIssue[]) {
  return issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.field);
}
function check(spec: Partial<CabinetSpec>, rules: Partial<ConstructionRules> = {}, from = base) {
  return validate({ ...from, ...spec }, { ...DEFAULT_RULES, ...rules });
}

describe('validate: cabinet fields', () => {
  it('accepts a normal base and wall cabinet with no issues', () => {
    expect(check({})).toEqual([]);
    expect(check({}, {}, wall)).toEqual([]);
  });

  it.each(['width', 'height', 'depth'] as const)('requires %s to be greater than zero', (field) => {
    expect(errors(check({ [field]: inches(0) }))).toContain(field);
    expect(errors(check({ [field]: inches(-1) }))).toContain(field);
  });

  it('requires dimensions to be whole 1/64ths', () => {
    expect(errors(check({ width: 30.001 as CabinetSpec['width'] }))).toContain('width');
  });

  it('requires a whole, non-negative shelf count', () => {
    expect(errors(check({ shelfCount: 0 }))).toEqual([]);
    expect(errors(check({ shelfCount: -1 }))).toContain('shelfCount');
    expect(errors(check({ shelfCount: 1.5 }))).toContain('shelfCount');
  });

  it('requires a whole quantity of at least 1', () => {
    expect(errors(check({ quantity: 0 }))).toContain('quantity');
    expect(errors(check({ quantity: 2.5 }))).toContain('quantity');
    expect(errors(check({ quantity: 3 }))).toEqual([]);
  });

  it('rejects unknown cabinet types and finished-end values', () => {
    expect(errors(check({ type: 'corner' as CabinetSpec['type'] }))).toContain('type');
    expect(errors(check({ finishedEnds: 'B' as CabinetSpec['finishedEnds'] }))).toContain('finishedEnds');
  });

  it('warns, but does not block, on a blank cabinet ID', () => {
    const issues = check({ id: '  ' });
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual(['id']);
  });
});

describe('validate: cross-field rules', () => {
  it('requires width > 2 x panel thickness + clearance at each side', () => {
    // 2 x 3/4 + 2 x 1/8 = 1 3/4
    expect(errors(check({ width: inches(1.75) }))).toContain('width');
    expect(errors(check({ width: inches(1.75 + 1 / 64) }))).toEqual([]);
  });

  it('requires depth > panel thickness', () => {
    expect(errors(check({ depth: inches(3 / 4) }))).toContain('depth');
  });

  it('requires shelf setback to leave some shelf when there are shelves', () => {
    const rules = { shelfSetback: inches(23.25) };
    expect(errors(check({}, rules))).toContain('shelfSetback');
    expect(errors(check({ shelfCount: 0 }, rules))).toEqual([]);
    // Default 1/8 setback: 3/4 + 1/8 = 7/8 is too shallow for a shelf.
    expect(errors(check({ depth: inches(7 / 8) }))).toContain('shelfSetback');
  });

  it('warns (Q7) when standard shelves do not match the panel thickness', () => {
    const issues = check({}, { panelThickness: inches(23 / 32) });
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual(['shelfThickness']);
    expect(issues[0]?.message).toBe(
      'Panels are 23/32" but shelves are listed as 3/4". Check which stock the shelves are cut from.',
    );
  });

  it('does not warn about shelf thickness for wide 1" shelves or cabinets without shelves', () => {
    expect(warnings(check({ width: inches(36) }, { panelThickness: inches(23 / 32) }))).toEqual([]);
    expect(warnings(check({ shelfCount: 0 }, { panelThickness: inches(23 / 32) }))).toEqual([]);
  });

  it('requires base height > toe kick + countertop', () => {
    // 4 + 1 1/2 = 5 1/2
    const issues = check({ height: inches(5.5) });
    expect(errors(issues)).toContain('height');
    expect(issues.find((issue) => issue.field === 'height')?.message).toContain('5 1/2"');
  });

  it('does not apply toe kick or countertop to wall cabinets', () => {
    expect(check({ height: inches(5) }, {}, wall)).toEqual([]);
    expect(check({}, { toeKickHeight: inches(40) }, wall)).toEqual([]);
  });

  it('does apply them to wall cabinets under the legacy spreadsheet preset', () => {
    expect(errors(validate({ ...wall, height: inches(5) }, LEGACY_SHEET_RULES))).toContain('height');
  });

  it('skips cross-field checks when a single field is already wrong', () => {
    expect(errors(check({ width: inches(0) }))).toEqual(['width']);
  });
});

describe('validate: warnings for implausible sizes', () => {
  it.each([
    ['width', inches(61)],
    ['height', inches(97)],
    ['depth', inches(31)],
  ] as const)('warns when %s is very large', (field, value) => {
    const issues = check({ [field]: value });
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual([field]);
  });

  it('still calculates parts when there are only warnings', () => {
    const result = calculateParts({ ...base, width: inches(72) }, DEFAULT_RULES);
    expect(result.parts.length).toBeGreaterThan(0);
    expect(warnings(result.issues)).toEqual(['width']);
  });
});

describe('validate: rule fields', () => {
  it.each(['panelThickness', 'shelfThickness', 'wideShelfThickness', 'shelfThickWidthThreshold'] as const)(
    'requires %s to be greater than zero',
    (field) => {
      expect(errors(check({}, { [field]: inches(0) }))).toContain(field);
    },
  );

  it.each([
    'toeKickHeight',
    'countertopThickness',
    'shelfClearancePerSide',
    'shelfSetback',
    'laminateOversizePerEdge',
  ] as const)('allows %s to be zero but not negative', (field) => {
    expect(errors(check({}, { [field]: inches(0) }))).toEqual([]);
    expect(errors(check({}, { [field]: inches(-1 / 8) }))).toContain(field);
  });

  it('rejects an unknown shelf comparison', () => {
    expect(
      errors(check({}, { shelfThickComparison: 'ge' as ConstructionRules['shelfThickComparison'] })),
    ).toContain('shelfThickComparison');
  });
});
