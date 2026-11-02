/**
 * Materials and the purchase estimate. The sample job is the five-cabinet
 * cut-list job (fixtures/cutlist/sample-job.json) under version 1 rules, whose
 * lines cutlist.test.ts checks by hand. The estimate below is worked out by
 * hand from those lines.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ESTIMATE_OPTIONS,
  DEFAULT_RULES,
  buildCutList,
  estimate,
  inches,
  parseDimension,
  partSlot,
  upgradeVersion1Rules,
  type CabinetSpec,
  type CutListOptions,
  type JobMaterials,
  type Material,
  type Ticks,
} from '../src/index';

function size(text: string): Ticks {
  const parsed = parseDimension(text);
  if (!parsed.ok) throw new Error(`Bad size in fixture: ${text}`);
  return parsed.value;
}

const SAMPLE: CabinetSpec[] = (
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'cutlist', 'sample-job.json'), 'utf8')) as {
    cabinets: (Omit<CabinetSpec, 'width' | 'height' | 'depth'> & { width: string; height: string; depth: string })[];
  }
).cabinets.map((c) => ({ ...c, width: size(c.width), height: size(c.height), depth: size(c.depth) }));

const V1_RULES = upgradeVersion1Rules(DEFAULT_RULES);
const MERGED: CutListOptions = { mode: 'merged', includeFronts: true, sort: { key: 'length', dir: 'desc' } };

const blank = { thickness: null, length: null, width: null, grain: 'none', bandingWidth: null, rollFeet: null, unit: null, price: null, onHand: null } as const;
const sheet = (id: string, name: string, t: number, l: number, w: number, extra: Partial<Material> = {}): Material => ({
  ...blank,
  id,
  kind: 'sheet',
  name,
  thickness: inches(t),
  length: inches(l),
  width: inches(w),
  grain: 'length',
  ...extra,
});

const BIRCH = sheet('birch-34', 'Birch plywood 3/4″', 3 / 4, 96, 48, { price: 6800, onHand: 2 });
const PLY_1 = sheet('ply-1', 'Plywood 1″ (shelves)', 1, 96, 48, { price: 9500 });
const BIRCH_14 = sheet('birch-14', 'Birch plywood 1/4″', 1 / 4, 96, 48);
const HPL: Material = { ...blank, id: 'hpl-48', kind: 'laminate', name: 'HPL laminate', length: inches(96), width: inches(48), grain: 'length', price: 12000 };
const BANDING: Material = { ...blank, id: 'pvc', kind: 'banding', name: 'PVC edge banding 15/16″', bandingWidth: inches(15 / 16), price: 25 };
const LEG: Material = { ...blank, id: 'leg', kind: 'hardware', name: 'Leveling leg', unit: 'each', price: 150 };
const CLIP: Material = { ...blank, id: 'clip', kind: 'hardware', name: 'Kick clip', unit: 'each', price: 40 };

const MATERIALS: JobMaterials = {
  box: BIRCH,
  back: BIRCH,
  shelves: BIRCH,
  'wide-shelves': PLY_1,
  base: BIRCH,
  'kick-face': BIRCH_14,
  laminate: HPL,
  'edge-banding': BANDING,
  'leveling-leg': LEG,
  'kick-clip': CLIP,
};

describe('estimate: the sample job, by hand', () => {
  const list = buildCutList(SAMPLE, V1_RULES, MERGED, MATERIALS);
  const result = estimate(list, MATERIALS, DEFAULT_ESTIMATE_OPTIONS);
  const line = (id: string) => result.lines.find((l) => l.key === id)!;

  // Usable sheet: (96 − 2 × 1/4) × (48 − 2 × 1/4) = 95 1/2 × 47 1/2 = 4536.25 sq in.
  it('counts 3/4″ birch from area: P1–P17, fronts included', () => {
    // P1  40 1/2 × 23 1/4 × 2 = 1883.25    P10 28 1/2 × 23 1/4 × 2 = 1325.25
    // P2  30 1/2 × 42     × 2 = 2562       P11 28 1/2 × 11 1/4 × 2 =  641.25
    // P3  30 1/2 × 30     × 2 = 1830       P12 28 1/4 × 23 1/8 × 1 =  653.28125
    // P4  30 1/2 × 23 1/4 × 8 = 5673       P13 28 1/4 × 11 1/8 × 2 =  628.5625
    // P5  30 1/2 × 18     × 4 = 2196       P14 16 1/2 × 23 1/4 × 4 = 1534.5
    // P6  30     × 30     × 2 = 1800       P15 16 1/4 × 23 1/8 × 2 =  751.5625
    // P7  30     × 15     × 2 =  900       P16 13 1/2 × 11 1/2 × 2 =  310.5
    // P8  30     × 11 1/2 × 2 =  690       P17 13 1/4 × 11 3/8 × 2 =  301.4375
    // P9  30     × 11 1/4 × 2 =  675
    // Total 24355.59375 sq in × 1.15 ÷ 4536.25 = 6.17 → 7 sheets.
    // 2 on hand → buy 5 × $68.00 = $340.00.
    const birch = line('birch-34');
    expect(birch.slots).toEqual(['box', 'back', 'shelves']);
    expect(birch.partArea).toBe(24355.59375);
    expect(birch.usableArea).toBe(4536.25);
    expect([birch.needed, birch.onHand, birch.toBuy, birch.cost]).toEqual([7, 2, 5, 34000]);
  });

  it('counts the 1″ wide shelf from its own sheet', () => {
    // P18 40 1/4 × 23 1/8 = 930.78125 × 1.15 ÷ 4536.25 = 0.24 → 1 sheet × $95.00.
    expect(partSlot({ role: 'shelf', thickness: inches(1) }, V1_RULES)).toBe('wide-shelves');
    const ply = line('ply-1');
    expect(ply.slots).toEqual(['wide-shelves']);
    expect([ply.partArea, ply.needed, ply.toBuy, ply.cost]).toEqual([930.78125, 1, 1, 9500]);
  });

  it('counts laminate from area', () => {
    // L1 32 1/2 × 44 = 1430    L5 32 × 32 = 1024
    // L2 32 1/2 × 32 = 1040    L6 32 × 17 =  544
    // L3 32 1/2 × 26 × 3 = 2535  L7 32 × 14 1/4 = 456
    // L4 32 1/2 × 20 × 2 = 1300  L8 32 × 14 × 2  = 896
    // Total 9225 × 1.15 ÷ 4536.25 = 2.34 → 3 sheets × $120.00 = $360.00.
    const hpl = line('hpl-48');
    expect([hpl.partArea, hpl.needed, hpl.cost]).toEqual([9225, 3, 36000]);
  });

  it('bands the front edges of sides, tops, bottoms and shelves', () => {
    // Sides: P4 30 1/2 × 8 + P8 30 × 2 + P9 30 × 2 = 364
    // Bottom / top: P1 81 + P10 57 + P11 57 + P14 66 + P16 27 = 288
    // Shelves: P12 28 1/4 + P13 56 1/2 + P15 32 1/2 + P17 26 1/2 + P18 40 1/4 = 184
    // 836″ = 69.67 ft → 70 ft × $0.25 = $17.50. Backs and fronts aren't banded.
    const band = line('pvc');
    expect([band.lengthInches, band.unit, band.needed, band.cost]).toEqual([836, 'foot', 70, 1750]);
  });

  it('adds up to $812.50, in slot order, with no hardware on a ladder base', () => {
    expect(result.lines.map((l) => l.key)).toEqual(['birch-34', 'ply-1', 'hpl-48', 'pvc']);
    expect(result.total).toEqual({ cost: 81250, unpriced: 0, unassigned: [] });
  });
});

describe('estimate: incomplete totals', () => {
  const list = buildCutList(SAMPLE, V1_RULES, MERGED, MATERIALS);

  it('gives no total while any material needs a price', () => {
    const unpriced = { ...MATERIALS, laminate: { ...HPL, price: null }, 'edge-banding': { ...BANDING, price: null } };
    const result = estimate(list, unpriced);
    expect(result.total).toEqual({ cost: null, unpriced: 2, unassigned: [] });
    expect(result.lines.find((l) => l.key === 'hpl-48')).toMatchObject({ needed: 3, cost: null });
  });

  it('reports slots without a material', () => {
    const rest: JobMaterials = Object.fromEntries(Object.entries(MATERIALS).filter(([slot]) => slot !== 'laminate'));
    const result = estimate(buildCutList(SAMPLE, V1_RULES, MERGED, rest), rest);
    expect(result.total.cost).toBeNull();
    expect(result.total.unassigned).toEqual(['laminate']);
    expect(result.lines.find((l) => l.key === 'slot:laminate')).toMatchObject({ material: null, needed: null, partArea: 9225 });
  });

  it('subtracts on hand but never buys fewer than none', () => {
    const result = estimate(list, { ...MATERIALS, box: { ...BIRCH, onHand: 40 } });
    expect(result.lines[0]).toMatchObject({ needed: 7, onHand: 40, toBuy: 0, cost: 0 });
  });

  it('flags a piece too big for the sheet', () => {
    const small = sheet('small', 'Offcut stock', 3 / 4, 30, 30, { price: 100 });
    const result = estimate(buildCutList(SAMPLE.slice(0, 1), V1_RULES, MERGED, { ...MATERIALS, box: small, back: small }), { ...MATERIALS, box: small, back: small });
    expect(result.lines[0]!.oversize.length).toBeGreaterThan(0);
  });

  it('follows the fronts switch', () => {
    const without = buildCutList(SAMPLE, V1_RULES, { ...MERGED, includeFronts: false }, MATERIALS);
    expect(estimate(without, MATERIALS).lines[0]!.partArea!).toBeLessThan(24355.59375);
  });

  it('counts banding by the roll when it is sold that way', () => {
    const roll = { ...BANDING, rollFeet: 50, price: 1100 };
    const result = estimate(list, { ...MATERIALS, 'edge-banding': roll });
    expect(result.lines.find((l) => l.key === 'pvc')).toMatchObject({ unit: 'roll', needed: 2, cost: 2200 });
  });
});

describe('estimate: method hardware and banding', () => {
  const legs = { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, baseType: 'legs' as const } };

  it('counts A2 legs and kick clips per box, never hinges or slides', () => {
    // B1 30″: 4 legs, 2 clips. B2 42″ (over 36″): 6 legs, 3 clips. B3 18″ × 2: 8 legs, 4 clips.
    const list = buildCutList(SAMPLE, legs, MERGED, MATERIALS);
    const result = estimate(list, MATERIALS);
    expect(result.lines.find((l) => l.key === 'leg')).toMatchObject({ unit: 'each', needed: 18, cost: 2700 });
    expect(result.lines.find((l) => l.key === 'clip')).toMatchObject({ needed: 9, cost: 360 });
    expect(result.lines.map((l) => l.kind)).not.toContain('other');
  });

  it('bands a method B side above its kick notch only', () => {
    const b = { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, id: 'B' as const } };
    const base = SAMPLE[0]!; // 30 × 36 × 24
    const list = buildCutList([base], b, MERGED, MATERIALS);
    const sides = list.lines.find((l) => l.roles.includes('side-left'))!;
    // Sides run to the floor: 36 − 1 1/2 = 34 1/2; banded above the 4″ notch: 30 1/2 each.
    expect(sides.length).toBe(inches(34.5));
    expect(sides.banding).toBe(inches(30.5 * 2));
  });
});

describe('cut list by material', () => {
  it('keeps every line and mark, and only changes the group titles', () => {
    const plain = buildCutList(SAMPLE, V1_RULES, MERGED);
    const withMaterials = buildCutList(SAMPLE, V1_RULES, MERGED, MATERIALS);
    const shape = (l: (typeof plain.lines)[number]) => [l.mark, l.name, l.length, l.width, l.thickness, l.quantity, l.refs];
    expect(withMaterials.lines.map(shape)).toEqual(plain.lines.map(shape));
    expect(withMaterials.groups.map((g) => g.lines.map((l) => l.mark))).toEqual(plain.groups.map((g) => g.lines.map((l) => l.mark)));
    expect(withMaterials.groups.map((g) => [g.id, g.material?.name ?? null])).toEqual([
      ['panel:birch-34:48', 'Birch plywood 3/4″'],
      ['panel:ply-1:64', 'Plywood 1″ (shelves)'],
      ['laminate:hpl-48', 'HPL laminate'],
    ]);
    expect(plain.groups.map((g) => g.id)).toEqual(['panel:48', 'panel:64', 'laminate']);
    expect(withMaterials.materialIssues).toEqual([]);
  });

  it('splits a cut when its parts come from different materials', () => {
    const maple = sheet('maple', 'Maple plywood, prefinished 3/4″', 3 / 4, 96, 48);
    const list = buildCutList(SAMPLE, V1_RULES, MERGED, { ...MATERIALS, back: maple });
    const p2 = list.lines.filter((l) => l.length === inches(30.5) && l.width === inches(42));
    expect(p2.map((l) => [l.names.join(' / '), l.material?.id])).toEqual([
      ['Back', 'maple'],
      ['Front (door/laminate size)', 'birch-34'],
    ]);
  });

  it('warns when a slot’s material is a different thickness from the rules', () => {
    const rules = { ...V1_RULES, panelThickness: inches(23 / 32) };
    const list = buildCutList(SAMPLE.slice(0, 1), rules, MERGED, MATERIALS);
    expect(list.materialIssues.map((i) => [i.slot, i.severity])).toEqual([
      ['box', 'warning'],
      ['back', 'warning'],
    ]);
    expect(list.materialIssues[0]!.message).toBe(
      'Box: Birch plywood 3/4″ is 3/4″ thick, but these parts are 23/32″ (the panel thickness rule). Choose a 23/32″ material, or change the rule.',
    );
  });
});
