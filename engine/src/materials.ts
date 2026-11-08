import { methodOf, type HardwareItem, type MaterialSlot } from './methods';
import { backThicknessOf } from './rules';
import { fixedShelvesOf } from './cabinetTypes';
import type { CabinetSpec, ConstructionRules, Part, ValidationIssue } from './types';
import { formatDimension, type Ticks } from './units';

/**
 * Materials: what each part is cut from, and what the job buys. The shop keeps
 * a catalog (in the app); a job assigns one material to each slot and keeps a
 * copy of it, so the engine only ever sees these plain records.
 * docs/plan-methods-optimizer-costing.md §3.
 */

export type MaterialKind = 'sheet' | 'laminate' | 'banding' | 'hardware';

/** Sheet grain: none (melamine, MDF), or along the sheet's length. */
export type MaterialGrain = 'none' | 'length';

export interface Material {
  /** The catalog id. */
  id: string;
  kind: MaterialKind;
  name: string;
  /** Sheet goods only. Null for every other kind. */
  thickness: Ticks | null;
  /** Sheet goods and laminate: the real sheet size (49 × 97 is allowed), length along the grain. */
  length: Ticks | null;
  width: Ticks | null;
  grain: MaterialGrain;
  /** Edge banding only: tape width. */
  bandingWidth: Ticks | null;
  /** Edge banding sold by the roll: feet per roll. Null: priced by the foot. */
  rollFeet: number | null;
  /** Hardware: what one is called when counted, e.g. "each", "pair". */
  unit: string | null;
  /**
   * Whole cents per sheet, per foot (or per roll), or per item. Null: the
   * material needs a price, and an estimate using it has no total.
   */
  price: number | null;
  /** Full sheets, feet (or rolls), or items in stock. Null: not counted. */
  onHand: number | null;
}

/** Bought items the job uses that are not cut from a sheet. */
export type SupplySlot = 'edge-banding' | 'leveling-leg' | 'kick-clip';

/** Everything a job assigns a material to: the part slots, then supplies. */
export type JobSlot = MaterialSlot | SupplySlot;

/** A job's materials, by slot. A slot with no material is left out. */
export type JobMaterials = Readonly<Partial<Record<JobSlot, Material>>>;

export const JOB_SLOTS: readonly JobSlot[] = [
  'box',
  'back',
  'shelves',
  'wide-shelves',
  'base',
  'kick-face',
  'laminate',
  'edge-banding',
  'leveling-leg',
  'kick-clip',
];

export interface SlotInfo {
  /** "Box", "Wide shelves". */
  name: string;
  /** What goes in the slot, in shop words. */
  parts: string;
  /** The kind of material the slot takes. */
  kind: MaterialKind;
}

export const SLOT_INFO: Readonly<Record<JobSlot, SlotInfo>> = {
  box: { name: 'Box', parts: 'Sides, top or stretchers, bottom, fixed shelves, nailers and fronts', kind: 'sheet' },
  back: { name: 'Back', parts: 'Backs', kind: 'sheet' },
  shelves: { name: 'Shelves', parts: 'Shelves', kind: 'sheet' },
  'wide-shelves': { name: 'Wide shelves', parts: 'Shelves in wide cabinets', kind: 'sheet' },
  base: { name: 'Base / kick', parts: 'Base rails, sleepers and kick boards', kind: 'sheet' },
  'kick-face': { name: 'Kick face', parts: 'The kick skin', kind: 'sheet' },
  laminate: { name: 'Laminate', parts: 'End and front laminate', kind: 'laminate' },
  'edge-banding': { name: 'Edge banding', parts: 'Exposed front edges', kind: 'banding' },
  'leveling-leg': { name: 'Leveling legs', parts: 'Legs under each box', kind: 'hardware' },
  'kick-clip': { name: 'Kick clips', parts: 'Clips that hold the kick board', kind: 'hardware' },
};

/** The slot a hardware item is bought for. */
export function hardwareSlot(item: HardwareItem['item']): SupplySlot {
  return item;
}

/**
 * The slot a part is cut from: what the job's method declares for its role.
 * Shelves the wide-shelf rule makes thicker go to `wide-shelves`, so a 1″
 * shelf can come from 1″ stock while the rest come from 3/4″.
 */
export function partSlot(part: Pick<Part, 'role' | 'thickness'>, rules: ConstructionRules): MaterialSlot {
  const slot = methodOf(rules).slots[part.role];
  if (slot === 'shelves' && rules.wideShelfThickness !== rules.shelfThickness && part.thickness === rules.wideShelfThickness) {
    return 'wide-shelves';
  }
  return slot;
}

/** The rule that sets a slot's part thickness, and its value. Null for laminate. */
export function slotRule(slot: MaterialSlot, rules: ConstructionRules): { label: string; thickness: Ticks } | null {
  switch (slot) {
    case 'box':
    case 'base':
      return { label: 'panel thickness', thickness: rules.panelThickness };
    case 'back':
      return { label: 'back thickness', thickness: backThicknessOf(rules) };
    case 'shelves':
      return { label: 'shelf thickness', thickness: rules.shelfThickness };
    case 'wide-shelves':
      return { label: 'wide-shelf thickness', thickness: rules.wideShelfThickness };
    case 'kick-face':
      return { label: 'kick skin thickness', thickness: rules.method.kickSkinThickness };
    case 'laminate':
      return null;
  }
}

/** A slot's material doesn't agree with the job's rules. Never blocks anything. */
export interface MaterialIssue {
  slot: MaterialSlot;
  materialId: string;
  severity: 'warning';
  message: string;
}

const exact = (value: Ticks) => `${formatDimension(value, { denominator: 64, inchMark: false }).text}″`;

/**
 * Warnings for slots whose material is a different thickness from the parts
 * cut from it, e.g. 23/32″ ply with a 3/4″ panel rule. `thicknesses` are the
 * part thicknesses actually listed per slot, so a slot the job doesn't use
 * never warns.
 */
export function materialIssues(
  materials: JobMaterials,
  thicknesses: ReadonlyMap<MaterialSlot, ReadonlySet<Ticks>>,
  rules: ConstructionRules,
): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  for (const [slot, used] of thicknesses) {
    const material = materials[slot];
    if (!material || material.thickness === null) continue;
    for (const thickness of used) {
      if (thickness === material.thickness) continue;
      const rule = slotRule(slot, rules);
      const why = rule && rule.thickness === thickness ? ` (the ${rule.label} rule)` : '';
      issues.push({
        slot,
        materialId: material.id,
        severity: 'warning',
        message: `${SLOT_INFO[slot].name}: ${material.name} is ${exact(material.thickness)} thick, but these parts are ${exact(thickness)}${why}. Choose a ${exact(thickness)} material, or change the rule.`,
      });
    }
  }
  return issues.sort((a, b) => JOB_SLOTS.indexOf(a.slot) - JOB_SLOTS.indexOf(b.slot));
}

/**
 * Warnings for a tall cabinet's parts that are longer than a sheet of the
 * material they are cut from. Nesting reports these too; this shows them in
 * the editor. The back gets its own warning, which suggests a split back.
 * Other cabinet types, and slots without a material, never warn.
 */
export function sheetLengthIssues(
  spec: Pick<CabinetSpec, 'type' | 'fixedShelfCount' | 'splitBack'>,
  parts: readonly Part[],
  rules: ConstructionRules,
  materials: JobMaterials,
): ValidationIssue[] {
  if (spec.type !== 'tall') return [];
  const show = (value: Ticks) => `${formatDimension(value, { inchMark: false }).text}″`;
  const long: { part: Part; material: Material }[] = [];
  for (const part of parts) {
    const material = materials[partSlot(part, rules)];
    if (material?.length == null || part.length <= material.length) continue;
    long.push({ part, material });
  }
  const issues: ValidationIssue[] = [];
  const backs = long.filter(({ part }) => part.role === 'back');
  if (backs.length > 0) {
    // The longest piece, when the back is split.
    const { part, material } = backs.reduce((a, b) => (b.part.length > a.part.length ? b : a));
    const fix =
      spec.splitBack === true
        ? 'Split at the lowest fixed shelf, a piece is still too long. Use a longer sheet.'
        : fixedShelvesOf(spec) > 0
          ? 'Turn on Split back to cut it in two at the lowest fixed shelf.'
          : 'Add a fixed shelf and turn on Split back to cut it in two.';
    issues.push({
      field: 'splitBack',
      severity: 'warning',
      message: `The back is ${show(part.length)} long, longer than a sheet of ${material.name} (${show(material.length!)}). ${fix}`,
    });
  }
  const others = long.filter(({ part }) => part.role !== 'back');
  if (others.length > 0) {
    const names = [...new Set(others.map(({ part }) => part.name))];
    const listed = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
    const sheets = [...new Set(others.map(({ material }) => `${material.name} (${show(material.length!)})`))].join(', ');
    issues.push({
      field: 'height',
      severity: 'warning',
      message: `${listed} ${names.length === 1 ? 'is' : 'are'} longer than a sheet of ${sheets}. Use a longer sheet, or make the cabinet shorter.`,
    });
  }
  return issues;
}
