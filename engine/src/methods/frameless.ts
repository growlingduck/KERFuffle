import { standsOnFloor } from '../cabinetTypes';
import { cabinetPart } from '../parts';
import type { CabinetSpec, ConstructionRules, Part, PartRole } from '../types';
import { boxParts } from './box';
import { BOX_SETTINGS, FRAMELESS_SLOTS, defaultsFor, framelessBanding } from './common';
import { ladderBaseParts } from './ladderBase';
import type { ConstructionMethod, HardwareItem } from './types';

/**
 * Method A: frameless on a separate base (the shop's method before version 2).
 * The base box is a plain rectangle, overall height − toe kick − countertop,
 * standing on a detached base: a ladder base per run (A1) or leveling legs
 * with a clip-on kick board per cabinet (A2). End laminate covers the box only.
 */

const SETTINGS = [
  ...BOX_SETTINGS,
  'baseType',
  'sleeperSpacingMax',
  'platformLengthMax',
  'kickSkinThickness',
  'legsPerBox',
  'legsPerWideBox',
  'legWidthThreshold',
  'listBase',
] as const;

const VISIBLE: ReadonlySet<PartRole> = new Set([
  'front',
  'kick-skin',
  'kick-board',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
]);

const listsBase = (rules: ConstructionRules) => rules.method.listBase && rules.toeKickHeight > 0;

function floorCabinet(spec: CabinetSpec, rules: ConstructionRules): Part[] {
  const parts = boxParts(spec, rules);
  if (rules.method.baseType === 'legs' && listsBase(rules)) {
    // The clip-on kick board covers the cabinet's full width.
    parts.push(
      cabinetPart(spec, 'kick-board', { category: 'panel', length: spec.width, width: rules.toeKickHeight, thickness: rules.panelThickness }, 1),
    );
  }
  return parts;
}

/** A2: legs per base or tall box (more on wide boxes), and a kick clip for each front leg. */
function legHardware(spec: CabinetSpec, rules: ConstructionRules): HardwareItem[] {
  const m = rules.method;
  if (!standsOnFloor(spec.type) || m.baseType !== 'legs' || !m.listBase) return [];
  const legs = spec.width > m.legWidthThreshold ? m.legsPerWideBox : m.legsPerBox;
  return [
    { item: 'leveling-leg', name: 'Leveling leg', cabinetId: spec.id, quantity: legs * spec.quantity },
    { item: 'kick-clip', name: 'Kick clip', cabinetId: spec.id, quantity: Math.ceil(legs / 2) * spec.quantity },
  ];
}

export const FRAMELESS_ON_BASE: ConstructionMethod = Object.freeze({
  id: 'A',
  name: 'Frameless on a separate base',
  summary: 'Plain boxes standing on a ladder base or leveling legs.',
  settings: SETTINGS,
  defaults: defaultsFor(SETTINGS),
  // A tall cabinet stands on the base exactly as a base cabinet does.
  parts: Object.freeze({
    base: floorCabinet,
    tall: floorCabinet,
    wall: (spec: CabinetSpec, rules: ConstructionRules) => boxParts(spec, rules),
  }),
  jobParts: (cabinets, rules) =>
    rules.method.baseType === 'ladder' && listsBase(rules) ? ladderBaseParts(cabinets, rules) : { parts: [], issues: [] },
  visible: VISIBLE,
  slots: FRAMELESS_SLOTS,
  hardware: legHardware,
  banding: framelessBanding,
} satisfies ConstructionMethod);
