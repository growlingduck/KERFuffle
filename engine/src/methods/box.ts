import { CABINET_TYPE_FACTS, boxHeightFor, fixedShelvesOf, splitBackJoint } from '../cabinetTypes';
import { cabinetPart, type PartSize } from '../parts';
import { backThicknessOf, shelfThicknessFor } from '../rules';
import type { CabinetSpec, ConstructionRules, Part, PartFeature, PartRole } from '../types';
import { addTicks, subtractTicks, ticks, type Ticks } from '../units';

/**
 * The shared box calculator. Every method builds the same frameless box; they
 * differ in how far the sides run and what goes under the box. Methods call
 * this and add their own parts, so the box formulas exist once.
 * docs/calculation-rules.md explains each formula in shop terms.
 */

export interface BoxGeometry {
  /** Base and tall cabinets: toe kick under the box, and a base (A1, A2) or notched sides (B). */
  standsOnFloor: boolean;
  /** Base cabinets only: the box stops under the countertop, and may have stretchers. */
  hasCountertop: boolean;
  /** Panel thickness. */
  p: Ticks;
  /** Back thickness. */
  tb: Ticks;
  /** Base: overall − toe kick − countertop. Tall: overall − toe kick. Wall: the full height. */
  boxHeight: Ticks;
  /** Box height, or the legacy wall-back height. */
  backHeight: Ticks;
  /** Box height, or the legacy wall-laminate height. */
  laminateBaseHeight: Ticks;
  /** Between the sides: W − 2p. */
  innerWidth: Ticks;
  /** Sides, top and bottom: D − back thickness with an applied back, D with an inset one. */
  memberDepth: Ticks;
  /** From the cabinet front to the face of the back. Shelves stop here. */
  interiorDepth: Ticks;
  inset: boolean;
  backLength: Ticks;
  backWidth: Ticks;
}

export function boxGeometry(spec: CabinetSpec, rules: ConstructionRules): BoxGeometry {
  const m = rules.method;
  const p = rules.panelThickness;
  const tb = backThicknessOf(rules);
  const { standsOnFloor, hasCountertop } = CABINET_TYPE_FACTS[spec.type];
  const isWall = spec.type === 'wall';
  const baseAllowances = addTicks(rules.toeKickHeight, rules.countertopThickness);

  // Box height: cabinets on the floor lose the toe kick, base cabinets the
  // countertop too; wall cabinets use the full height (confirmed by the shop).
  // The legacy flags exist only so the LEGACY_* presets can reproduce the old
  // wall-cabinet bugs.
  const boxHeight = boxHeightFor(spec.type, spec.height, rules);
  const backHeight =
    isWall && rules.legacyWallBackDeductsBaseAllowances
      ? subtractTicks(spec.height, baseAllowances)
      : boxHeight;
  const laminateBaseHeight =
    isWall && rules.legacyWallLaminateDeductsBaseAllowances
      ? subtractTicks(spec.height, baseAllowances)
      : boxHeight;

  const innerWidth = subtractTicks(spec.width, p, p);
  const inset = m.backType !== 'applied';
  if (!inset) {
    // Applied: full width, behind the sides; the box members stop at it.
    const memberDepth = subtractTicks(spec.depth, tb);
    return {
      standsOnFloor, hasCountertop, p, tb, boxHeight, backHeight, laminateBaseHeight, innerWidth,
      memberDepth,
      interiorDepth: memberDepth,
      inset,
      backLength: backHeight,
      backWidth: spec.width,
    };
  }

  // Inset: the members run full depth and the back sits in a groove cut in
  // all four of them (a rabbet at the back edge, or a dado set in from it).
  const g = m.backGrooveDepth;
  const fromRear = m.backType === 'dado' ? addTicks(m.backDadoInset, tb) : tb;
  return {
    standsOnFloor, hasCountertop, p, tb, boxHeight, backHeight, laminateBaseHeight, innerWidth,
    memberDepth: spec.depth,
    interiorDepth: subtractTicks(spec.depth, fromRear),
    inset,
    backLength: addTicks(subtractTicks(backHeight, p, p), g, g),
    backWidth: addTicks(innerWidth, g, g),
  };
}

export interface BoxOptions {
  /** How long the sides are. Default: the box height. */
  sideLength?: Ticks;
  /** Cutouts on both sides and on the finished-end laminate (method B's kick notch). */
  sideFeatures?: PartFeature[];
}

/**
 * The box: back, bottom, sides, top (or stretchers), nailer, the Front
 * reference size, shelves and laminate. In cut-list order.
 */
export function boxParts(spec: CabinetSpec, rules: ConstructionRules, options: BoxOptions = {}): Part[] {
  const g = boxGeometry(spec, rules);
  const m = rules.method;
  const { p } = g;
  const sideLength = options.sideLength ?? g.boxHeight;
  const features = options.sideFeatures;

  const clearance = rules.shelfClearancePerSide;
  const shelfLength = subtractTicks(g.innerWidth, clearance, clearance);
  const shelfWidth = subtractTicks(g.interiorDepth, rules.shelfSetback);

  // Laminate is 1" (the setting) past every edge. An end panel's laminate is
  // as long as the side, so with an integral kick it runs to the floor.
  const oversize = rules.laminateOversizePerEdge;
  const sideIsBox = options.sideLength === undefined;
  const endLaminateLength = addTicks(sideIsBox ? g.laminateBaseHeight : sideLength, oversize, oversize);
  const frontLaminateLength = addTicks(g.laminateBaseHeight, oversize, oversize);
  const laminateSideWidth = addTicks(spec.depth, oversize, oversize);
  const laminateFrontWidth = addTicks(spec.width, oversize, oversize);

  const leftFinished = spec.finishedEnds === 'left' || spec.finishedEnds === 'both';
  const rightFinished = spec.finishedEnds === 'right' || spec.finishedEnds === 'both';

  const parts: Part[] = [];
  const add = (role: PartRole, size: PartSize, perCabinet: number) => {
    if (perCabinet > 0) parts.push(cabinetPart(spec, role, size, perCabinet));
  };
  const panel = (length: Ticks, width: Ticks, thickness: Ticks): PartSize => ({ category: 'panel', length, width, thickness });
  // Laminate is thin enough that the shop does not track its thickness.
  const laminate = (length: Ticks, width: Ticks, withFeatures = false): PartSize => ({
    category: 'laminate',
    length,
    width,
    thickness: null,
    ...(withFeatures && features ? { features } : {}),
  });

  // Fixed shelves are tall-cabinet only; the fields are ignored on other types.
  const fixedShelves = fixedShelvesOf(spec);
  if (fixedShelves > 0 && spec.splitBack === true) {
    // Two pieces meeting at the middle of the lowest fixed shelf. An inset
    // back keeps one groove allowance on each piece, at its outer end.
    const joint = splitBackJoint(g.boxHeight, p, fixedShelves);
    const grooveStart = g.inset ? subtractTicks(p, m.backGrooveDepth) : ticks(0);
    const lower = subtractTicks(joint, grooveStart);
    const upper = subtractTicks(g.backLength, lower);
    parts.push({ ...cabinetPart(spec, 'back', panel(lower, g.backWidth, g.tb), 1), name: 'Back, lower' });
    parts.push({ ...cabinetPart(spec, 'back', panel(upper, g.backWidth, g.tb), 1), name: 'Back, upper' });
  } else {
    add('back', panel(g.backLength, g.backWidth, g.tb), 1);
  }
  add('bottom', panel(g.innerWidth, g.memberDepth, p), 1);
  add('side-left', { ...panel(sideLength, g.memberDepth, p), ...(features ? { features } : {}) }, 1);
  add('side-right', { ...panel(sideLength, g.memberDepth, p), ...(features ? { features } : {}) }, 1);
  // Stretchers are for a box under a countertop; tall and wall boxes always get a full top.
  if (g.hasCountertop && m.baseTop === 'stretchers') {
    add('stretcher-front', panel(g.innerWidth, m.stretcherWidth, p), 1);
    add('stretcher-back', panel(g.innerWidth, m.stretcherWidth, p), 1);
  } else {
    add('top', panel(g.innerWidth, g.memberDepth, p), 1);
  }
  // A thin back can't take screws, so an inset back gets a nailer under the
  // top, and a tall one with fixed shelves a second under the lowest of them.
  const midNailer = fixedShelves > 0 && spec.midNailer === true;
  if (g.inset) add('nailer', panel(g.innerWidth, m.nailerWidth, p), midNailer ? 2 : 1);
  // Front is a reference size for cutting doors or front laminate, not a
  // carcass part. The cut-list layer decides whether to show it.
  add('front', { ...panel(g.boxHeight, spec.width, p), optional: true }, 1);
  add('shelf', panel(shelfLength, shelfWidth, shelfThicknessFor(spec.width, rules)), spec.shelfCount);
  // Structural, so box stock and thickness, between the sides, stopping at the back.
  add('fixed-shelf', panel(g.innerWidth, g.interiorDepth, p), fixedShelves);

  if (leftFinished) add('laminate-side-left', laminate(endLaminateLength, laminateSideWidth, true), 1);
  if (rightFinished) add('laminate-side-right', laminate(endLaminateLength, laminateSideWidth, true), 1);
  add('laminate-front', laminate(frontLaminateLength, laminateFrontWidth), 1);

  return parts;
}
