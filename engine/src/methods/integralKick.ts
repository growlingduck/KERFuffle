import { hasCountertop } from '../cabinetTypes';
import { cabinetPart } from '../parts';
import type { CabinetSpec, ConstructionRules, Part, PartFeature, PartRole } from '../types';
import { subtractTicks, ticks } from '../units';
import { boxParts } from './box';
import { BOX_SETTINGS, FRAMELESS_SLOTS, defaultsFor, framelessBanding } from './common';
import type { ConstructionMethod } from './types';

/**
 * Method B: frameless with an integral toe kick. Base cabinet sides run to the
 * floor (overall height − countertop) with a notch at the front bottom, kick
 * height × kick depth. The bottom sits above the kick, and a kick board fits
 * between the sides. A finished end's laminate is full height, notched the
 * same way. Tall cabinets are the same, with sides the full overall height.
 * Wall cabinets are the same as method A.
 */

const SETTINGS = BOX_SETTINGS;

const VISIBLE: ReadonlySet<PartRole> = new Set([
  'front',
  'kick-board',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
]);

/** The toe-kick notch, in part coordinates; null when there is no kick. */
export function kickNotch(rules: ConstructionRules): PartFeature | null {
  if (rules.toeKickHeight <= 0 || rules.method.kickDepth <= 0) return null;
  return { kind: 'notch', corner: 'start-front', length: rules.toeKickHeight, width: rules.method.kickDepth };
}

function floorCabinet(spec: CabinetSpec, rules: ConstructionRules): Part[] {
  const notch = kickNotch(rules);
  const parts = boxParts(spec, rules, {
    sideLength: subtractTicks(spec.height, hasCountertop(spec.type) ? rules.countertopThickness : ticks(0)),
    ...(notch ? { sideFeatures: [notch] } : {}),
  });
  if (rules.toeKickHeight > 0) {
    const p = rules.panelThickness;
    parts.push(
      cabinetPart(spec, 'kick-board', { category: 'panel', length: subtractTicks(spec.width, p, p), width: rules.toeKickHeight, thickness: p }, 1),
    );
  }
  return parts;
}

export const INTEGRAL_KICK: ConstructionMethod = Object.freeze({
  id: 'B',
  name: 'Frameless with integral toe kick',
  summary: 'Base cabinet sides run to the floor, notched for the toe kick.',
  settings: SETTINGS,
  defaults: defaultsFor(SETTINGS),
  // Tall sides run the full overall height: there is no countertop to stop under.
  parts: Object.freeze({
    base: floorCabinet,
    tall: floorCabinet,
    wall: (spec: CabinetSpec, rules: ConstructionRules) => boxParts(spec, rules),
  }),
  visible: VISIBLE,
  slots: FRAMELESS_SLOTS,
  banding: framelessBanding,
} satisfies ConstructionMethod);
