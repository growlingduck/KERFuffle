import type { CabinetSpec, CabinetType, ConstructionRules } from './types';
import { addTicks, subtractTicks, ticks, type Ticks } from './units';

/**
 * The two facts about a cabinet type that the formulas read. Base and tall
 * cabinets stand on the floor (toe kick, a base under them); only base
 * cabinets have a countertop. docs/calculation-rules.md, "Tall cabinets".
 */
export interface CabinetTypeFacts {
  standsOnFloor: boolean;
  hasCountertop: boolean;
}

export const CABINET_TYPE_FACTS: Readonly<Record<CabinetType, CabinetTypeFacts>> = Object.freeze({
  base: { standsOnFloor: true, hasCountertop: true },
  tall: { standsOnFloor: true, hasCountertop: false },
  wall: { standsOnFloor: false, hasCountertop: false },
});

/** Every cabinet type, in the order the app offers them. */
export const CABINET_TYPES: readonly CabinetType[] = ['base', 'tall', 'wall'];

export function standsOnFloor(type: CabinetType): boolean {
  return CABINET_TYPE_FACTS[type].standsOnFloor;
}

export function hasCountertop(type: CabinetType): boolean {
  return CABINET_TYPE_FACTS[type].hasCountertop;
}

/** Overall height less the toe kick (on the floor) and the countertop (base only). */
export function boxHeightFor(type: CabinetType, height: Ticks, rules: Pick<ConstructionRules, 'toeKickHeight' | 'countertopThickness'>): Ticks {
  const facts = CABINET_TYPE_FACTS[type];
  return subtractTicks(
    height,
    facts.standsOnFloor ? rules.toeKickHeight : ticks(0),
    facts.hasCountertop ? rules.countertopThickness : ticks(0),
  );
}

/**
 * How many fixed shelves a new tall cabinet of this height starts with: one
 * when its box is taller than the `tallFixedShelfAbove` rule, otherwise none.
 * Only for new cabinets; a count the user has set is never changed.
 */
export function defaultFixedShelfCount(height: Ticks, rules: ConstructionRules): number {
  return boxHeightFor('tall', height, rules) > rules.tallFixedShelfAbove ? 1 : 0;
}

/** The fixed shelves this cabinet is built with: its count when tall, none otherwise. */
export function fixedShelvesOf(spec: Pick<CabinetSpec, 'type' | 'fixedShelfCount'>): number {
  return spec.type === 'tall' ? (spec.fixedShelfCount ?? 0) : 0;
}

/** One section of a tall box, between two of: the bottom, a fixed shelf, the top. */
export interface ShelfSection {
  /** From the bottom of the box to the bottom of the section (the top face of the panel below). */
  bottom: Ticks;
  /** Clear height of the section. */
  height: Ticks;
  /** Adjustable shelves in this section. */
  shelves: number;
}

/**
 * The sections the fixed shelves make, bottom first. Fixed shelves are spaced
 * evenly: the inside of the box (box height − 2p), less one p per fixed
 * shelf, is shared equally, rounded down to 1/64″, and the top section takes
 * what is left. Adjustable shelves are shared evenly, extras to the lowest
 * sections. A cabinet without fixed shelves is one section.
 */
export function shelfSections(boxHeight: Ticks, p: Ticks, fixedShelves: number, shelfCount: number): ShelfSection[] {
  const sections = fixedShelves + 1;
  const clear = boxHeight - 2 * p - fixedShelves * p;
  const each = Math.floor(clear / sections);
  const perSection = Math.floor(shelfCount / sections);
  const extra = shelfCount - perSection * sections;
  const out: ShelfSection[] = [];
  let bottom: number = p;
  for (let i = 0; i < sections; i += 1) {
    const height = i === sections - 1 ? clear - each * (sections - 1) : each;
    out.push({ bottom: ticks(bottom), height: ticks(height), shelves: perSection + (i < extra ? 1 : 0) });
    bottom += height + p;
  }
  return out;
}

/**
 * Where a split back joins, measured up from the bottom of the box: the
 * middle of the lowest fixed shelf (p + one section + p/2, rounded down).
 */
export function splitBackJoint(boxHeight: Ticks, p: Ticks, fixedShelves: number): Ticks {
  const [lowest] = shelfSections(boxHeight, p, fixedShelves, 0);
  return addTicks(lowest!.bottom, lowest!.height, ticks(Math.floor(p / 2)));
}
