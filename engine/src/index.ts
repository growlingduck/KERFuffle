export type {
  CabinetSpec,
  CabinetType,
  CalculationResult,
  ConstructionRules,
  FinishedEnds,
  Part,
  PartCategory,
  PartRole,
  ShelfThickComparison,
  ValidationField,
  ValidationIssue,
} from './types';

export type { FormatOptions, FormattedDimension, ParseResult, Ticks } from './units';
export { TICKS_PER_INCH, formatDimension, inches, parseDimension, ticks, toInches } from './units';

export { DEFAULT_RULES, LEGACY_SHEET_RULES, LEGACY_WEB_RULES, RULE_PRESETS, shelfThicknessFor } from './rules';
export type { RulePresetName } from './rules';

export { PLAUSIBLE_LIMITS, hasErrors, validate } from './validate';
export { PART_NAMES, PART_ORDER, calculateParts } from './calculate';

export { DEPENDENCIES, TRACE_KEYS, dependenciesFor } from './dependencies';
export type { DependencyMap, PartField, TraceKey } from './dependencies';

export { DEFAULT_CUT_LIST_OPTIONS, buildCutList, grainOf, sortLines } from './cutlist';
export type {
  BlockedCabinet,
  CutList,
  CutListGroup,
  CutListLine,
  CutListMode,
  CutListOptions,
  CutListRef,
  CutListSection,
  CutListSortKey,
  CutListTotals,
  Grain,
  SortDirection,
} from './cutlist';
