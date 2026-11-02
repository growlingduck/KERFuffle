import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  TRACE_KEYS,
  VERSION_1_METHOD,
  applyConstructionChoice,
  calculateParts,
  constructionChoiceOf,
  constructionName,
  dependenciesFor,
  inches,
  jobParts,
  traceDependencies,
  usesRuns,
  type CabinetSpec,
  type ConstructionRules,
  type MethodSettings,
  type TraceCase,
} from '../src';

const spec = (overrides: Partial<CabinetSpec> = {}): CabinetSpec => ({
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

const withMethod = (patch: Partial<MethodSettings>): ConstructionRules => ({ ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, ...patch } });
const cabinetParts = ({ spec: s, rules }: TraceCase) => {
  const result = calculateParts(s, rules);
  return result.parts.length > 0 ? result.parts : null;
};

describe('construction names', () => {
  it('names each choice the same way everywhere', () => {
    expect(constructionName(DEFAULT_RULES.method)).toBe('Frameless · separate ladder base');
    expect(constructionName(withMethod({ baseType: 'legs' }).method)).toBe('Frameless · separate base on legs');
    expect(constructionName(withMethod({ id: 'B' }).method)).toBe('Frameless · integral toe kick');
  });

  it('says when a job made before methods leaves its base off', () => {
    expect(constructionName(VERSION_1_METHOD)).toBe('Frameless · separate base (not on this list)');
  });

  it('round-trips choices and keeps every other setting', () => {
    const m = { ...DEFAULT_RULES.method, kickDepth: inches(2) };
    for (const choice of ['A1', 'A2', 'B'] as const) {
      const next = applyConstructionChoice(m, choice);
      expect(constructionChoiceOf(next)).toBe(choice);
      expect(next.kickDepth).toBe(inches(2));
    }
  });

  it('uses runs only for a listed ladder base', () => {
    expect(usesRuns(DEFAULT_RULES.method)).toBe(true);
    expect(usesRuns(withMethod({ baseType: 'legs' }).method)).toBe(false);
    expect(usesRuns(withMethod({ id: 'B' }).method)).toBe(false);
    expect(usesRuns(VERSION_1_METHOD)).toBe(false);
  });
});

describe('derived tracing', () => {
  it('matches the fixed map for the standard box', () => {
    for (const s of [spec(), spec({ type: 'wall', height: inches(30), depth: inches(12), shelfCount: 2 })]) {
      for (const key of TRACE_KEYS) {
        expect(traceDependencies(key, { spec: s, rules: DEFAULT_RULES }, cabinetParts), `${s.type} ${key}`).toEqual(dependenciesFor(key, s.type));
      }
    }
  });

  it('method B: toe kick moves the notch and the kick board, not the side length', () => {
    const deps = traceDependencies('toe', { spec: spec(), rules: withMethod({ id: 'B' }) }, cabinetParts);
    expect(deps['side-left']).toEqual(['F']);
    expect(deps['kick-board']).toEqual(['W']);
    expect(deps['laminate-side-left']).toEqual(['F']);
    expect(deps.back).toEqual(['L']);
  });

  it('method B: countertop moves the full-height sides', () => {
    const deps = traceDependencies('ctop', { spec: spec(), rules: withMethod({ id: 'B' }) }, cabinetParts);
    expect(deps['side-left']).toEqual(['L']);
  });

  it('stretchers and an inset back trace like the parts they replace', () => {
    const rules = withMethod({ baseTop: 'stretchers', backType: 'dado', backThickness: inches(1 / 4) });
    const w = traceDependencies('w', { spec: spec(), rules }, cabinetParts);
    expect(w['stretcher-front']).toEqual(['L']);
    expect(w.nailer).toEqual(['L']);
    expect(w.back).toEqual(['W']);
    const d = traceDependencies('d', { spec: spec(), rules }, cabinetParts);
    expect(d['stretcher-front']).toBeUndefined();
  });

  it('a cabinet exactly at the wide-shelf width does not light the shelf thickness', () => {
    const deps = traceDependencies('w', { spec: spec({ width: inches(36) }), rules: DEFAULT_RULES }, cabinetParts);
    expect(deps.shelf).toEqual(['L']);
  });

  it('a zero setback still traces from the one valid direction', () => {
    const rules = { ...DEFAULT_RULES, shelfSetback: inches(0) };
    expect(traceDependencies('sb', { spec: spec(), rules }, cabinetParts)).toEqual({ shelf: ['W'] });
  });

  it('traces parts a run shares', () => {
    const others = [spec({ id: 'B2', run: 'Sink wall' })];
    const runParts = ({ spec: s, rules }: TraceCase) => jobParts([{ ...s, run: 'Sink wall' }, ...others], rules).parts.map((p) => p.part);
    const w = traceDependencies('w', { spec: spec(), rules: DEFAULT_RULES }, runParts);
    expect(w['base-rail-front']).toEqual(['L']);
    expect(w['kick-skin']).toEqual(['L']);
    const toe = traceDependencies('toe', { spec: spec(), rules: DEFAULT_RULES }, runParts);
    expect(toe['base-rail-front']).toEqual(['W']);
  });
});
