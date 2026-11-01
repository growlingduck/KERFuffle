import type { ConstructionRules } from './types';
import { inches, type Ticks } from './units';

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

  legacyWallBackDeductsBaseAllowances: false,
  legacyWallLaminateDeductsBaseAllowances: false,
});

/**
 * The legacy calculators' hard-coded values: 1/8" off shelf length in total,
 * no shelf setback, 1" added to each laminate dimension.
 */
const LEGACY_COMMON = {
  shelfClearancePerSide: inches(1 / 16),
  shelfSetback: inches(0),
  laminateOversizePerEdge: inches(1 / 2),
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

/** Shelf thickness for a cabinet width, per the wide-shelf rule. */
export function shelfThicknessFor(width: Ticks, rules: ConstructionRules): Ticks {
  const wide =
    rules.shelfThickComparison === 'gte'
      ? width >= rules.shelfThickWidthThreshold
      : width > rules.shelfThickWidthThreshold;
  return wide ? rules.wideShelfThickness : rules.shelfThickness;
}
