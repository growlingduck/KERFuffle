import type {
  CabinetSpec,
  CalculationResult,
  ConstructionRules,
  Part,
  PartCategory,
  PartRole,
} from './types';
import { shelfThicknessFor } from './rules';
import { addTicks, subtractTicks, type Ticks } from './units';
import { hasErrors, validate } from './validate';

/** Stable output order: panels in cut-list order, then laminate. */
export const PART_ORDER: readonly PartRole[] = [
  'back',
  'bottom',
  'side-left',
  'side-right',
  'top',
  'front',
  'shelf',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
];

export const PART_NAMES: Readonly<Record<PartRole, string>> = {
  back: 'Back',
  bottom: 'Bottom',
  'side-left': 'Left side',
  'side-right': 'Right side',
  top: 'Top',
  front: 'Front (door/laminate size)',
  shelf: 'Shelf',
  'laminate-side-left': 'Laminate, left side',
  'laminate-side-right': 'Laminate, right side',
  'laminate-front': 'Laminate, front',
};

/**
 * Turn a cabinet and construction rules into a parts list.
 *
 * Pure and deterministic. If validation finds any error, returns no parts and
 * the issues. Dimensions use `length` for the grain-wise direction: vertical
 * for back, sides, front and laminate; side to side for top, bottom and shelves.
 */
export function calculateParts(spec: CabinetSpec, rules: ConstructionRules): CalculationResult {
  const issues = validate(spec, rules);
  if (hasErrors(issues)) return { parts: [], issues };

  const p = rules.panelThickness;
  const baseAllowances = addTicks(rules.toeKickHeight, rules.countertopThickness);
  const isBase = spec.type === 'base';

  // Box height: base cabinets lose toe kick and countertop; wall cabinets use
  // the full height (confirmed by the shop). The legacy flags exist only so the
  // LEGACY_* presets can reproduce the old wall-cabinet bugs.
  const boxHeight = isBase ? subtractTicks(spec.height, baseAllowances) : spec.height;
  const backHeight =
    !isBase && rules.legacyWallBackDeductsBaseAllowances
      ? subtractTicks(spec.height, baseAllowances)
      : boxHeight;
  const laminateBaseHeight =
    !isBase && rules.legacyWallLaminateDeductsBaseAllowances
      ? subtractTicks(spec.height, baseAllowances)
      : boxHeight;

  const innerWidth = subtractTicks(spec.width, p, p); // between the sides
  const sideDepth = subtractTicks(spec.depth, p); // in front of the back

  const clearance = rules.shelfClearancePerSide;
  const shelfLength = subtractTicks(innerWidth, clearance, clearance);
  const shelfWidth = subtractTicks(sideDepth, rules.shelfSetback);
  const shelfThickness = shelfThicknessFor(spec.width, rules);

  const oversize = rules.laminateOversizePerEdge; // added at both edges
  const laminateLength = addTicks(laminateBaseHeight, oversize, oversize);
  const laminateSideWidth = addTicks(spec.depth, oversize, oversize);
  const laminateFrontWidth = addTicks(spec.width, oversize, oversize);

  const leftFinished = spec.finishedEnds === 'left' || spec.finishedEnds === 'both';
  const rightFinished = spec.finishedEnds === 'right' || spec.finishedEnds === 'both';

  const parts: Part[] = [];
  const add = (
    role: PartRole,
    category: PartCategory,
    length: Ticks,
    width: Ticks,
    thickness: Ticks | null,
    perCabinet: number,
    optional = false,
  ) => {
    if (perCabinet <= 0) return;
    parts.push({
      cabinetId: spec.id,
      role,
      category,
      name: PART_NAMES[role],
      length,
      width,
      thickness,
      quantity: perCabinet * spec.quantity,
      optional,
    });
  };

  add('back', 'panel', backHeight, spec.width, p, 1);
  add('bottom', 'panel', innerWidth, sideDepth, p, 1);
  add('side-left', 'panel', boxHeight, sideDepth, p, 1);
  add('side-right', 'panel', boxHeight, sideDepth, p, 1);
  add('top', 'panel', innerWidth, sideDepth, p, 1);
  // Front is a reference size for cutting doors or front laminate, not a
  // carcass part. The cut-list layer decides whether to show it.
  add('front', 'panel', boxHeight, spec.width, p, 1, true);
  add('shelf', 'panel', shelfLength, shelfWidth, shelfThickness, spec.shelfCount);

  // Laminate is thin enough that the shop does not track its thickness.
  if (leftFinished) add('laminate-side-left', 'laminate', laminateLength, laminateSideWidth, null, 1);
  if (rightFinished) add('laminate-side-right', 'laminate', laminateLength, laminateSideWidth, null, 1);
  add('laminate-front', 'laminate', laminateLength, laminateFrontWidth, null, 1);

  // Validation should make this unreachable; it guards against a formula
  // change that slips past it.
  const bad = parts.find(
    (part) => part.length <= 0 || part.width <= 0 || (part.thickness !== null && part.thickness <= 0),
  );
  if (bad) {
    return {
      parts: [],
      issues: [
        ...issues,
        {
          field: 'width',
          severity: 'error',
          message: `These sizes produce a ${bad.name.toLowerCase()} with no size. Check the dimensions and rules.`,
        },
      ],
    };
  }

  return { parts, issues };
}
