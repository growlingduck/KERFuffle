import { boxGeometry } from './methods/box';
import type { CabinetSpec, ConstructionRules, MethodField, MethodSettings, ValidationField, ValidationIssue } from './types';
import { backThicknessOf, shelfThicknessFor } from './rules';
import { addTicks, formatDimension, inches, subtractTicks, type Ticks } from './units';

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
  const hasError = () => issues.some((issue) => issue.severity === 'error');
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

  if (typeof rules.method !== 'object' || rules.method === null) {
    error('method', 'The construction method is missing from these rules.');
    return issues;
  }
  validateMethodSettings(rules.method, error);

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
  if (spec.run !== undefined && spec.run !== null && typeof spec.run !== 'string') {
    error('run', 'Run must be a name, or left blank.');
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

  // The depth the back takes up, measured from the back edge of the box.
  const m = rules.method;
  const tb = backThicknessOf(rules);
  const backTakes = m.backType === 'dado' ? addTicks(m.backDadoInset, tb) : tb;
  const backWord = m.backType === 'dado' ? 'the back and its dado inset' : 'the back thickness';
  if (spec.depth <= backTakes) {
    error(
      'depth',
      backTakes === p && m.backType === 'applied'
        ? `Depth must be more than the panel thickness (${show(p)}).`
        : `Depth must be more than ${backWord} (${show(backTakes)}).`,
    );
  } else if (spec.shelfCount > 0 && spec.depth <= addTicks(backTakes, rules.shelfSetback)) {
    error(
      'shelfSetback',
      `Shelf setback leaves no shelf: depth must be more than ${show(addTicks(backTakes, rules.shelfSetback))}.`,
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

  if (!hasError()) validateMethodFit(spec, rules, error);

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

type Report = (field: ValidationField, message: string) => void;

const METHOD_CHOICES = {
  id: ['A', 'B'],
  backType: ['applied', 'dado', 'rabbet'],
  baseTop: ['full', 'stretchers'],
  baseType: ['ladder', 'legs'],
} as const satisfies Partial<Record<keyof MethodSettings, readonly string[]>>;

const METHOD_CHOICE_MESSAGES: Readonly<Record<keyof typeof METHOD_CHOICES, string>> = {
  id: 'Construction method must be A (separate base) or B (integral toe kick).',
  backType: 'Back must be applied, inset in a dado, or inset in a rabbet.',
  baseTop: 'Base top must be a full panel or two stretchers.',
  baseType: 'Base type must be a ladder base or legs.',
};

/** The method block on its own: every value present and in range. */
function validateMethodSettings(m: MethodSettings, error: Report) {
  const field = (key: keyof MethodSettings): MethodField => `method.${key}`;
  for (const key of Object.keys(METHOD_CHOICES) as (keyof typeof METHOD_CHOICES)[]) {
    if (!(METHOD_CHOICES[key] as readonly string[]).includes(m[key])) error(field(key), METHOD_CHOICE_MESSAGES[key]);
  }

  const positive = [
    ['stretcherWidth', 'Stretcher width'],
    ['nailerWidth', 'Nailer width'],
    ['sleeperSpacingMax', 'Sleeper spacing'],
    ['platformLengthMax', 'Longest base platform'],
    ['kickSkinThickness', 'Kick skin thickness'],
    ['legWidthThreshold', 'Width for extra legs'],
  ] as const;
  for (const [key, label] of positive) {
    if (!isTicks(m[key])) error(field(key), `${label} must be a whole number of 1/64ths.`);
    else if (m[key] <= 0) error(field(key), `${label} must be greater than zero.`);
  }
  const nonNegative = [
    ['backGrooveDepth', 'Back groove depth'],
    ['backDadoInset', 'Back dado inset'],
    ['kickDepth', 'Kick depth'],
  ] as const;
  for (const [key, label] of nonNegative) {
    if (!isTicks(m[key])) error(field(key), `${label} must be a whole number of 1/64ths.`);
    else if (m[key] < 0) error(field(key), `${label} cannot be negative.`);
  }

  if (m.backThickness !== null) {
    if (!isTicks(m.backThickness)) error('method.backThickness', 'Back thickness must be a whole number of 1/64ths.');
    else if (m.backThickness <= 0) error('method.backThickness', 'Back thickness must be greater than zero, or the same as the panels.');
  }
  for (const [key, label] of [['legsPerBox', 'Legs per box'], ['legsPerWideBox', 'Legs per wide box']] as const) {
    if (!Number.isInteger(m[key]) || m[key] < 1) error(field(key), `${label} must be a whole number, 1 or more.`);
  }
  if (typeof m.listBase !== 'boolean') error('method.listBase', 'Whether the base is listed must be yes or no.');
}

/** Checks that need both the cabinet and the method: does this build fit this cabinet? */
function validateMethodFit(spec: CabinetSpec, rules: ConstructionRules, error: Report) {
  const m = rules.method;
  const p = rules.panelThickness;
  const show = (value: Ticks) => formatDimension(value, { denominator: 64 }).text;
  const isBase = spec.type === 'base';
  const { boxHeight, memberDepth, inset } = boxGeometry(spec, rules);

  if (inset) {
    if (m.backGrooveDepth >= p) {
      error('method.backGrooveDepth', `Back groove depth must be less than the panel thickness (${show(p)}).`);
    } else if (boxHeight <= addTicks(p, p)) {
      error('height', `Box height must be more than two panel thicknesses (${show(addTicks(p, p))}) to fit an inset back.`);
    } else if (m.nailerWidth >= subtractTicks(boxHeight, p, p)) {
      error('method.nailerWidth', `Nailer width must be less than the inside height of the box (${show(subtractTicks(boxHeight, p, p))}).`);
    }
  }
  if (isBase && m.baseTop === 'stretchers' && addTicks(m.stretcherWidth, m.stretcherWidth) > memberDepth) {
    error('method.stretcherWidth', `Two stretchers are wider than the box is deep (${show(memberDepth)}). Use narrower stretchers.`);
  }
  if (isBase && m.id === 'B' && m.kickDepth >= memberDepth) {
    error('method.kickDepth', `Kick depth must be less than the depth of the sides (${show(memberDepth)}).`);
  }
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function isTicks(value: number): boolean {
  return Number.isSafeInteger(value);
}
