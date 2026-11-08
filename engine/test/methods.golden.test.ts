/**
 * Golden fixtures for the construction methods (fixtures/methods/). Each one is
 * a small job: its cabinets, the rules (a preset plus method settings), and the
 * parts expected by hand from docs/calculation-rules.md. Dimensions are written
 * the way a person would ("19 1/2") so the shop can check them by eye.
 *
 * `expected.cabinetParts` lists every part of the named cabinets, in order.
 * `expected.jobParts` lists every part the job's runs and platforms make.
 * `expected.hardware`, when present, lists the method's hardware per cabinet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_METHOD,
  RULE_PRESETS,
  calculateParts,
  jobParts,
  methodOf,
  parseDimension,
  type CabinetSpec,
  type ConstructionRules,
  type MethodSettings,
  type Part,
  type PartFeature,
  type RulePresetName,
  type Ticks,
} from '../src/index';

const FIXTURE_DIR = join(import.meta.dirname, '..', 'fixtures', 'methods');
const STATUSES = ['unconfirmed', 'confirmed'] as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function obj(value: Json | undefined, where: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where}: expected an object`);
  return value;
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
function dim(value: Json | undefined, where: string): Ticks {
  const result = parseDimension(str(value, where));
  if (!result.ok) throw new Error(`${where}: ${result.message}`);
  return result.value;
}

const COUNT_SETTINGS: readonly (keyof MethodSettings)[] = ['legsPerBox', 'legsPerWideBox'];

function loadRules(raw: JsonObject, where: string): ConstructionRules {
  const preset = str(raw['preset'], `${where}.preset`) as RulePresetName;
  if (!(preset in RULE_PRESETS)) throw new Error(`${where}.preset: unknown preset ${preset}`);
  const method: Record<string, unknown> = { ...RULE_PRESETS[preset].method };
  const settings = raw['method'] === undefined ? {} : obj(raw['method'], `${where}.method`);
  for (const [key, value] of Object.entries(settings)) {
    const at = `${where}.method.${key}`;
    if (!(key in DEFAULT_METHOD)) throw new Error(`${at}: unknown method setting`);
    const sample = DEFAULT_METHOD[key as keyof MethodSettings];
    if (key === 'backThickness') method[key] = value === null ? null : dim(value, at);
    else if (COUNT_SETTINGS.includes(key as keyof MethodSettings)) method[key] = num(value, at);
    else if (typeof sample === 'number') method[key] = dim(value, at);
    else method[key] = value;
  }
  return { ...RULE_PRESETS[preset], method: method as unknown as MethodSettings };
}

function loadCabinet(raw: Json, where: string): CabinetSpec {
  const c = obj(raw, where);
  return {
    id: str(c['id'], `${where}.id`),
    type: str(c['type'], `${where}.type`) as CabinetSpec['type'],
    width: dim(c['width'], `${where}.width`),
    height: dim(c['height'], `${where}.height`),
    depth: dim(c['depth'], `${where}.depth`),
    shelfCount: num(c['shelfCount'], `${where}.shelfCount`),
    finishedEnds: str(c['finishedEnds'], `${where}.finishedEnds`) as CabinetSpec['finishedEnds'],
    quantity: num(c['quantity'], `${where}.quantity`),
    ...(c['run'] === undefined ? {} : { run: str(c['run'], `${where}.run`) }),
    // Tall cabinets only.
    ...(c['fixedShelfCount'] === undefined ? {} : { fixedShelfCount: num(c['fixedShelfCount'], `${where}.fixedShelfCount`) }),
    ...(c['midNailer'] === undefined ? {} : { midNailer: c['midNailer'] === true }),
    ...(c['splitBack'] === undefined ? {} : { splitBack: c['splitBack'] === true }),
  };
}

function loadPart(raw: Json, ref: string | null, where: string): Part {
  const p = obj(raw, where);
  const part: Part = {
    cabinetId: ref ?? str(p['ref'], `${where}.ref`),
    role: str(p['role'], `${where}.role`) as Part['role'],
    category: str(p['category'], `${where}.category`) as Part['category'],
    name: str(p['name'], `${where}.name`),
    length: dim(p['length'], `${where}.length`),
    width: dim(p['width'], `${where}.width`),
    thickness: p['thickness'] === null ? null : dim(p['thickness'], `${where}.thickness`),
    quantity: num(p['quantity'], `${where}.quantity`),
    optional: p['optional'] === true,
  };
  if (p['features'] !== undefined) {
    part.features = arr(p['features'], `${where}.features`).map((f, i): PartFeature => {
      const at = `${where}.features[${i}]`;
      const feature = obj(f, at);
      return {
        kind: 'notch',
        corner: str(feature['corner'], `${at}.corner`) as PartFeature['corner'],
        length: dim(feature['length'], `${at}.length`),
        width: dim(feature['width'], `${at}.width`),
      };
    });
  }
  if (p['run'] !== undefined) part.run = str(p['run'], `${where}.run`);
  return part;
}

interface Fixture {
  file: string;
  name: string;
  status: (typeof STATUSES)[number];
  rules: ConstructionRules;
  cabinets: CabinetSpec[];
  cabinetParts: Map<string, Part[]>;
  jobParts: Part[];
  hardware: { ref: string; item: string; quantity: number }[] | null;
}

function loadFixture(file: string): Fixture {
  const raw = obj(JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as Json, file);
  const status = str(raw['status'], `${file}.status`);
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error(`${file}.status: expected ${STATUSES.join(' or ')}`);
  const expected = obj(raw['expected'], `${file}.expected`);
  const cabinetParts = new Map<string, Part[]>();
  const perCabinet = expected['cabinetParts'] === undefined ? {} : obj(expected['cabinetParts'], `${file}.expected.cabinetParts`);
  for (const [id, parts] of Object.entries(perCabinet)) {
    cabinetParts.set(id, arr(parts, `${file}.cabinetParts.${id}`).map((p, i) => loadPart(p, id, `${file}.cabinetParts.${id}[${i}]`)));
  }
  return {
    file,
    name: str(raw['name'], `${file}.name`),
    status: status as Fixture['status'],
    rules: loadRules(obj(raw['rules'], `${file}.rules`), `${file}.rules`),
    cabinets: arr(raw['cabinets'], `${file}.cabinets`).map((c, i) => loadCabinet(c, `${file}.cabinets[${i}]`)),
    cabinetParts,
    jobParts: arr(expected['jobParts'], `${file}.expected.jobParts`).map((p, i) => loadPart(p, null, `${file}.jobParts[${i}]`)),
    hardware:
      expected['hardware'] === undefined
        ? null
        : arr(expected['hardware'], `${file}.hardware`).map((h, i) => {
            const at = `${file}.hardware[${i}]`;
            const item = obj(h, at);
            return { ref: str(item['ref'], `${at}.ref`), item: str(item['item'], `${at}.item`), quantity: num(item['quantity'], `${at}.quantity`) };
          }),
  };
}

const fixtures = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map(loadFixture);

describe('construction method fixtures', () => {
  it('has the fixtures the methods need', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  for (const fixture of fixtures) {
    describe(`${fixture.file}: ${fixture.name} [${fixture.status}]`, () => {
      it('has no validation errors', () => {
        for (const cabinet of fixture.cabinets) {
          const errors = calculateParts(cabinet, fixture.rules).issues.filter((i) => i.severity === 'error');
          expect(errors, cabinet.id).toEqual([]);
        }
        expect(jobParts(fixture.cabinets, fixture.rules).issues).toEqual([]);
      });

      for (const [id, expected] of fixture.cabinetParts) {
        it(`gives ${id} exactly the expected parts, in order`, () => {
          const cabinet = fixture.cabinets.find((c) => c.id === id);
          if (!cabinet) throw new Error(`${fixture.file}: no cabinet ${id}`);
          expect(calculateParts(cabinet, fixture.rules).parts).toEqual(expected);
        });
      }

      it('makes exactly the expected run and platform parts, in order', () => {
        expect(jobParts(fixture.cabinets, fixture.rules).parts.map((p) => p.part)).toEqual(fixture.jobParts);
      });

      const { hardware } = fixture;
      if (hardware) {
        it('counts the expected hardware', () => {
          const method = methodOf(fixture.rules);
          const counted = fixture.cabinets.flatMap((c) => method.hardware?.(c, fixture.rules) ?? []);
          expect(counted.map((h) => ({ ref: h.cabinetId, item: h.item, quantity: h.quantity }))).toEqual(hardware);
        });
      }
    });
  }
});

afterAll(() => {
  const waiting = fixtures.filter((f) => f.status === 'unconfirmed');
  console.log(
    [
      `Construction method fixtures: ${fixtures.length} total, ${waiting.length} waiting for shop confirmation.`,
      ...waiting.map((f) => `  unconfirmed: methods/${f.file}`),
    ].join('\n'),
  );
});
