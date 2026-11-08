import type { ConstructionRules, MethodSettings } from './types';
import { inches, type Ticks } from './units';

/**
 * Construction method defaults for new jobs (plan §1.3): method A on a ladder
 * base (A1), an applied back as thick as the panels, a full top panel.
 */
export const DEFAULT_METHOD: Readonly<MethodSettings> = Object.freeze({
  id: 'A',
  backType: 'applied',
  backThickness: null,
  backGrooveDepth: inches(1 / 4),
  backDadoInset: inches(3 / 4),
  nailerWidth: inches(4),
  baseTop: 'full',
  stretcherWidth: inches(4),
  kickDepth: inches(3),
  baseType: 'ladder',
  sleeperSpacingMax: inches(24),
  platformLengthMax: inches(96),
  kickSkinThickness: inches(1 / 4),
  legsPerBox: 4,
  legsPerWideBox: 6,
  legWidthThreshold: inches(36),
  listBase: true,
});

/**
 * What a version 1 rules snapshot means as a method: the box it always
 * described (method A1, an applied back of panel thickness, a full top), with
 * the base left off the cut list, as it always was.
 */
export const VERSION_1_METHOD: Readonly<MethodSettings> = Object.freeze({ ...DEFAULT_METHOD, listBase: false });

/**
 * Current shop defaults, per the shop's answers recorded in
 * docs/calculation-rules.md. Wall cabinets never use toe kick or countertop.
 */
export const DEFAULT_RULES: Readonly<ConstructionRules> = Object.freeze({
  panelThickness: inches(3 / 4),
  toeKickHeight: inches(4),
  countertopThickness: inches(1.5),

  shelfThickness: inches(3 / 4),
  wideShelfThickness: inches(1),
  shelfThickWidthThreshold: inches(36),
  shelfThickComparison: 'gte',
  shelfClearancePerSide: inches(1 / 8),
  shelfSetback: inches(1 / 8),

  laminateOversizePerEdge: inches(1),

  tallFixedShelfAbove: inches(72),

  legacyWallBackDeductsBaseAllowances: false,
  legacyWallLaminateDeductsBaseAllowances: false,

  method: DEFAULT_METHOD,
});

/**
 * The legacy calculators' hard-coded values: 1/8" off shelf length in total,
 * no shelf setback, 1" added to each laminate dimension. Neither listed a base.
 */
const LEGACY_COMMON = {
  shelfClearancePerSide: inches(1 / 16),
  shelfSetback: inches(0),
  laminateOversizePerEdge: inches(1 / 2),
  method: VERSION_1_METHOD,
} as const;

/**
 * Reproduces legacy/calculator/site/includes/js/main.js exactly, including the
 * wall-laminate height bug. For verification only; do not use for real jobs.
 * Panel, toe-kick and countertop values match DEFAULT_RULES so results are
 * comparable (the web form itself had no fixed values for these).
 */
export const LEGACY_WEB_RULES: Readonly<ConstructionRules> = Object.freeze({
  ...DEFAULT_RULES,
  ...LEGACY_COMMON,
  shelfThickComparison: 'gte',
  legacyWallBackDeductsBaseAllowances: false,
  legacyWallLaminateDeductsBaseAllowances: true,
});

/**
 * Reproduces legacy/calculator/CutList.xlsm (sheet CutListCalculator) exactly,
 * including the wall-back and wall-laminate height bugs. For verification only.
 */
export const LEGACY_SHEET_RULES: Readonly<ConstructionRules> = Object.freeze({
  ...DEFAULT_RULES,
  ...LEGACY_COMMON,
  shelfThickComparison: 'gt',
  legacyWallBackDeductsBaseAllowances: true,
  legacyWallLaminateDeductsBaseAllowances: true,
});

export const RULE_PRESETS = Object.freeze({
  DEFAULT_RULES,
  LEGACY_WEB_RULES,
  LEGACY_SHEET_RULES,
});

export type RulePresetName = keyof typeof RULE_PRESETS;

/** Version 1 rules (no method block) as version 2 rules that give exactly the same parts. */
export function upgradeVersion1Rules(rules: Omit<ConstructionRules, 'method'>): ConstructionRules {
  return { ...rules, method: VERSION_1_METHOD };
}

/** The back's thickness: its own setting, or the panel thickness. */
export function backThicknessOf(rules: ConstructionRules): Ticks {
  return rules.method.backThickness ?? rules.panelThickness;
}

/** Shelf thickness for a cabinet width, per the wide-shelf rule. */
export function shelfThicknessFor(width: Ticks, rules: ConstructionRules): Ticks {
  const wide =
    rules.shelfThickComparison === 'gte'
      ? width >= rules.shelfThickWidthThreshold
      : width > rules.shelfThickWidthThreshold;
  return wide ? rules.wideShelfThickness : rules.shelfThickness;
}
