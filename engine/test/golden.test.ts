/**
 * Runs every fixture in fixtures/. Fixtures store dimensions as the strings a
 * person would write ("30 1/2") so the shop can check them by eye.
 *
 * Status:
 *  - "legacy-derived": reproduces an old calculator; must use a LEGACY_* preset.
 *  - "unconfirmed": follows the shop's rules but has not been checked against a real build.
 *  - "confirmed": checked by the shop. Only a shop user may set this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  RULE_PRESETS,
  calculateParts,
  formatDimension,
  parseDimension,
  type CabinetSpec,
  type ConstructionRules,
  type FormattedDimension,
  type Part,
  type RulePresetName,
  type Ticks,
} from '../src/index';

const FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures');
const STATUSES = ['legacy-derived', 'unconfirmed', 'confirmed'] as const;
type FixtureStatus = (typeof STATUSES)[number];

type DisplayKey = 'length' | 'width' | 'thickness';

interface ExpectedPart {
  part: Omit<Part, 'cabinetId'>;
  display: Partial<Record<DisplayKey, FormattedDimension>>;
}

interface Fixture {
  file: string;
  name: string;
  status: FixtureStatus;
  preset: RulePresetName;
  spec: CabinetSpec;
  rules: ConstructionRules;
  expected: ExpectedPart[];
}

// --- Loading (fixtures are untyped JSON, so every field is checked) ---------

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arr(value: Json | undefined, where: string): Json[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected a list`);
  return value;
}

function str(value: Json | undefined, where: string): string {
  if (typeof value !== 'string') throw new Error(`${where}: expected a string`);
  return value;
}

function num(value: Json | undefined, where: string): number {
  if (typeof value !== 'number') throw new Error(`${where}: expected a number`);
  return value;
}

function bool(value: Json | undefined, where: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${where}: expected true or false`);
  return value;
}

function obj(value: Json | undefined, where: string): JsonObject {
  if (!isObject(value)) throw new Error(`${where}: expected an object`);
  return value;
}

function dim(value: Json | undefined, where: string): Ticks {
  const result = parseDimension(str(value, where));
  if (!result.ok) throw new Error(`${where}: ${result.message}`);
  return result.value;
}

function oneOf<T extends string>(value: Json | undefined, options: readonly T[], where: string): T {
  const text = str(value, where);
  const found = options.find((option) => option === text);
  if (found === undefined) throw new Error(`${where}: expected one of ${options.join(', ')}`);
  return found;
}

function loadRules(raw: JsonObject, where: string): { preset: RulePresetName; rules: ConstructionRules } {
  const presetNames = Object.keys(RULE_PRESETS) as RulePresetName[];
  const preset = oneOf(raw['preset'], presetNames, `${where}.preset`);
  const rules: ConstructionRules = { ...RULE_PRESETS[preset] };
  const overrides = raw['overrides'] === undefined ? {} : obj(raw['overrides'], `${where}.overrides`);

  for (const [key, value] of Object.entries(overrides)) {
    const at = `${where}.overrides.${key}`;
    switch (key) {
      case 'panelThickness':
      case 'toeKickHeight':
      case 'countertopThickness':
      case 'shelfThickness':
      case 'wideShelfThickness':
      case 'shelfThickWidthThreshold':
      case 'shelfClearancePerSide':
      case 'shelfSetback':
      case 'laminateOversizePerEdge':
        rules[key] = dim(value, at);
        break;
      case 'shelfThickComparison':
        rules[key] = oneOf(value, ['gt', 'gte'] as const, at);
        break;
      case 'legacyWallBackDeductsBaseAllowances':
      case 'legacyWallLaminateDeductsBaseAllowances':
        if (typeof value !== 'boolean') throw new Error(`${at}: expected true or false`);
        rules[key] = value;
        break;
      default:
        throw new Error(`${at}: unknown rule`);
    }
  }
  return { preset, rules };
}

function loadFixture(file: string): Fixture {
  const raw = obj(JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as Json, file);
  const spec = obj(raw['spec'], `${file}.spec`);
  const status = oneOf(raw['status'], STATUSES, `${file}.status`);
  const { preset, rules } = loadRules(obj(raw['rules'], `${file}.rules`), `${file}.rules`);
  const isLegacyPreset = preset !== 'DEFAULT_RULES';
  if ((status === 'legacy-derived') !== isLegacyPreset) {
    throw new Error(
      `${file}: status "legacy-derived" goes with a LEGACY_* preset, and only there (found ${preset}).`,
    );
  }

  return {
    file,
    name: str(raw['name'], `${file}.name`),
    status,
    preset,
    rules,
    spec: {
      id: str(spec['id'], `${file}.spec.id`),
      type: oneOf(spec['type'], ['base', 'wall'] as const, `${file}.spec.type`),
      width: dim(spec['width'], `${file}.spec.width`),
      height: dim(spec['height'], `${file}.spec.height`),
      depth: dim(spec['depth'], `${file}.spec.depth`),
      shelfCount: num(spec['shelfCount'], `${file}.spec.shelfCount`),
      finishedEnds: oneOf(
        spec['finishedEnds'],
        ['none', 'left', 'right', 'both'] as const,
        `${file}.spec.finishedEnds`,
      ),
      quantity: num(spec['quantity'], `${file}.spec.quantity`),
    },
    expected: arr(raw['expected'], `${file}.expected`).map((entry, i) =>
      loadExpected(entry, `${file}.expected[${i}]`),
    ),
  };
}

function loadExpected(entry: Json, where: string): ExpectedPart {
  const raw = obj(entry, where);
  const display: ExpectedPart['display'] = {};
  if (raw['display'] !== undefined) {
    for (const [key, value] of Object.entries(obj(raw['display'], `${where}.display`))) {
      const at = `${where}.display.${key}`;
      const k = oneOf(key, ['length', 'width', 'thickness'] as const, at);
      const d = obj(value, at);
      const inexact = d['inexact'];
      if (typeof inexact !== 'boolean') throw new Error(`${at}.inexact: expected true or false`);
      display[k] = { text: str(d['text'], `${at}.text`), inexact };
    }
  }
  return {
    part: {
      role: oneOf(
        raw['role'],
        [
          'back', 'bottom', 'side-left', 'side-right', 'top', 'front', 'shelf',
          'laminate-side-left', 'laminate-side-right', 'laminate-front',
        ] as const,
        `${where}.role`,
      ),
      category: oneOf(raw['category'], ['panel', 'laminate'] as const, `${where}.category`),
      name: str(raw['name'], `${where}.name`),
      length: dim(raw['length'], `${where}.length`),
      width: dim(raw['width'], `${where}.width`),
      thickness: raw['thickness'] === null ? null : dim(raw['thickness'], `${where}.thickness`),
      quantity: num(raw['quantity'], `${where}.quantity`),
      // Only the Front reference size is optional, so fixtures state it only there.
      optional: raw['optional'] === undefined ? false : bool(raw['optional'], `${where}.optional`),
    },
    display,
  };
}

// --- Tests -----------------------------------------------------------------

const files = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const fixtures = files.map(loadFixture);

describe('golden fixtures', () => {
  it('has fixtures to run', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    describe(`${fixture.file}: ${fixture.name} [${fixture.status}]`, () => {
      const result = calculateParts(fixture.spec, fixture.rules);

      it('has no validation errors', () => {
        expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      });

      it('produces exactly the expected parts, in order', () => {
        expect(result.parts).toEqual(
          fixture.expected.map(({ part }) => ({ cabinetId: fixture.spec.id, ...part })),
        );
      });

      const withDisplay = fixture.expected.filter((entry) => Object.keys(entry.display).length > 0);
      if (withDisplay.length > 0) {
        it('displays the expected text and inexact flags', () => {
          for (const { part, display } of withDisplay) {
            for (const [key, want] of Object.entries(display) as [DisplayKey, FormattedDimension][]) {
              const value = part[key];
              if (value === null) throw new Error(`${part.role}.${key} is null; nothing to display`);
              expect(formatDimension(value), `${part.role}.${key}`).toEqual(want);
            }
          }
        });
      }
    });
  }
});

afterAll(() => {
  const count = (status: FixtureStatus) => fixtures.filter((f) => f.status === status).length;
  const waiting = fixtures.filter((f) => f.status === 'unconfirmed');
  const lines = [
    `Golden fixtures: ${fixtures.length} total. ` +
      `${count('confirmed')} confirmed by the shop, ` +
      `${count('unconfirmed')} waiting for shop confirmation, ` +
      `${count('legacy-derived')} legacy-derived (old-calculator reference).`,
    ...waiting.map((f) => `  unconfirmed: ${f.file}`),
  ];
  console.log(lines.join('\n'));
});
