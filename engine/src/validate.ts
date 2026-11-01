import type { CabinetSpec, ConstructionRules, ValidationField, ValidationIssue } from './types';
import { shelfThicknessFor } from './rules';
import { addTicks, formatDimension, inches, type Ticks } from './units';

/** Sizes above these produce a warning, not an error. */
export const PLAUSIBLE_LIMITS = Object.freeze({
  width: inches(60),
  height: inches(96),
  depth: inches(30),
});

const CABINET_TYPES: readonly string[] = ['base', 'wall'];
const FINISHED_ENDS: readonly string[] = ['none', 'left', 'right', 'both'];
const SHELF_COMPARISONS: readonly string[] = ['gt', 'gte'];

/**
 * Check a cabinet and its rules. Errors block calculation; warnings do not.
 * Messages are written for the person entering the cabinet.
 */
export function validate(spec: CabinetSpec, rules: ConstructionRules): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: ValidationField, message: string) =>
    issues.push({ field, severity: 'error', message });
  const warning = (field: ValidationField, message: string) =>
    issues.push({ field, severity: 'warning', message });
  // Messages show exact values (to 1/64") so a mismatch like 23/32 vs 3/4 is visible.
  const show = (value: Ticks) => formatDimension(value, { denominator: 64 }).text;

  // --- Rules ---------------------------------------------------------------
  const positiveRuleLengths = [
    ['panelThickness', 'Panel thickness'],
    ['shelfThickness', 'Shelf thickness'],
    ['wideShelfThickness', 'Wide shelf thickness'],
    ['shelfThickWidthThreshold', 'Wide-shelf width threshold'],
  ] as const;
  for (const [field, label] of positiveRuleLengths) {
    if (!isTicks(rules[field])) error(field, `${label} must be a whole number of 1/64ths.`);
    else if (rules[field] <= 0) error(field, `${label} must be greater than zero.`);
  }

  const nonNegativeRuleLengths = [
    ['toeKickHeight', 'Toe-kick height'],
    ['countertopThickness', 'Countertop thickness'],
    ['shelfClearancePerSide', 'Shelf clearance'],
    ['shelfSetback', 'Shelf setback'],
    ['laminateOversizePerEdge', 'Laminate oversize'],
  ] as const;
  for (const [field, label] of nonNegativeRuleLengths) {
    if (!isTicks(rules[field])) error(field, `${label} must be a whole number of 1/64ths.`);
    else if (rules[field] < 0) error(field, `${label} cannot be negative.`);
  }

  if (!SHELF_COMPARISONS.includes(rules.shelfThickComparison)) {
    error('shelfThickComparison', 'Wide-shelf comparison must be "gt" or "gte".');
  }

  // --- Cabinet -------------------------------------------------------------
  if (spec.id.trim() === '') {
    warning('id', 'Cabinet ID is blank, so its parts will not be labeled with a cabinet.');
  }
  if (!CABINET_TYPES.includes(spec.type)) {
    error('type', 'Cabinet type must be base or wall.');
  }
  if (!FINISHED_ENDS.includes(spec.finishedEnds)) {
    error('finishedEnds', 'Finished ends must be none, left, right, or both.');
  }

  const dimensions = [
    ['width', 'Width'],
    ['height', 'Height'],
    ['depth', 'Depth'],
  ] as const;
  for (const [field, label] of dimensions) {
    if (!isTicks(spec[field])) error(field, `${label} must be a whole number of 1/64ths.`);
    else if (spec[field] <= 0) error(field, `${label} must be greater than zero.`);
  }

  if (!Number.isInteger(spec.shelfCount) || spec.shelfCount < 0) {
    error('shelfCount', 'Number of shelves must be a whole number, zero or more.');
  }
  if (!Number.isInteger(spec.quantity) || spec.quantity < 1) {
    error('quantity', 'Quantity must be a whole number, 1 or more.');
  }

  // Cross-field checks only make sense once the individual values are sound.
  if (issues.some((issue) => issue.severity === 'error')) return issues;

  const p = rules.panelThickness;

  const clearance = rules.shelfClearancePerSide;
  const minWidth = addTicks(p, p, clearance, clearance);
  if (spec.width <= minWidth) {
    error(
      'width',
      `Width must be more than ${show(minWidth)} (two panel thicknesses plus shelf clearance at each side).`,
    );
  }

  // The shop keeps 3/4" and 1" shelves even with other panel stock, but wants
  // the mismatch pointed out until that is settled.
  const shelfThickness = shelfThicknessFor(spec.width, rules);
  if (spec.shelfCount > 0 && shelfThickness !== rules.wideShelfThickness && shelfThickness !== p) {
    warning(
      'shelfThickness',
      `Panels are ${show(p)} but shelves are listed as ${show(shelfThickness)}. Check which stock the shelves are cut from.`,
    );
  }

  if (spec.depth <= p) {
    error('depth', `Depth must be more than the panel thickness (${show(p)}).`);
  } else if (spec.shelfCount > 0 && spec.depth <= addTicks(p, rules.shelfSetback)) {
    error(
      'shelfSetback',
      `Shelf setback leaves no shelf: depth must be more than ${show(addTicks(p, rules.shelfSetback))}.`,
    );
  }

  const allowances = addTicks(rules.toeKickHeight, rules.countertopThickness);
  const deductsAllowances =
    spec.type === 'base' ||
    rules.legacyWallBackDeductsBaseAllowances ||
    rules.legacyWallLaminateDeductsBaseAllowances;
  if (deductsAllowances && spec.height <= allowances) {
    error(
      'height',
      `Height must be more than toe kick plus countertop (${show(allowances)}).`,
    );
  }

  if (spec.width > PLAUSIBLE_LIMITS.width) {
    warning('width', `Width is over ${show(PLAUSIBLE_LIMITS.width)}. Check that this is intended.`);
  }
  if (spec.height > PLAUSIBLE_LIMITS.height) {
    warning('height', `Height is over ${show(PLAUSIBLE_LIMITS.height)}. Check that this is intended.`);
  }
  if (spec.depth > PLAUSIBLE_LIMITS.depth) {
    warning('depth', `Depth is over ${show(PLAUSIBLE_LIMITS.depth)}. Check that this is intended.`);
  }

  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function isTicks(value: number): boolean {
  return Number.isSafeInteger(value);
}
