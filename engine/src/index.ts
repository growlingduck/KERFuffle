export type {
  BackType,
  BaseTop,
  BaseType,
  CabinetSpec,
  CabinetType,
  CalculationResult,
  ConstructionRules,
  FinishedEnds,
  MethodField,
  MethodId,
  MethodSettings,
  NotchFeature,
  Part,
  PartCategory,
  PartCorner,
  PartFeature,
  PartRole,
  ShelfThickComparison,
  ValidationField,
  ValidationIssue,
} from './types';

export type { FormatOptions, FormattedDimension, ParseResult, Ticks } from './units';
export { TICKS_PER_INCH, formatDimension, inches, parseDimension, ticks, toInches } from './units';

export {
  DEFAULT_METHOD,
  DEFAULT_RULES,
  LEGACY_SHEET_RULES,
  LEGACY_WEB_RULES,
  RULE_PRESETS,
  VERSION_1_METHOD,
  backThicknessOf,
  shelfThicknessFor,
  upgradeVersion1Rules,
} from './rules';
export type { RulePresetName } from './rules';

export { PLAUSIBLE_LIMITS, hasErrors, validate } from './validate';
export { PART_NAMES, PART_ORDER, ROLE_ORDER, calculateParts, jobParts } from './calculate';

export { METHODS, METHOD_IDS, boxGeometry, kickNotch, methodOf, runOf, runRef, sleeperCount, splitPlatform } from './methods';
export type {
  BoxGeometry,
  ConstructionMethod,
  HardwareItem,
  JobIssue,
  JobPart,
  JobPartsResult,
  ListedCabinet,
  MaterialSlot,
} from './methods';

export { DEPENDENCIES, TRACE_KEYS, dependenciesFor } from './dependencies';
export type { DependencyMap, PartField, TraceKey } from './dependencies';

export { DEFAULT_CUT_LIST_OPTIONS, buildCutList, featureNote, grainOf, sortLines } from './cutlist';
export type {
  BlockedCabinet,
  CutList,
  CutListGroup,
  CutListLine,
  CutListMode,
  CutListOptions,
  CutListRef,
  CutListRunSection,
  CutListSection,
  CutListSortKey,
  CutListTotals,
  Grain,
  SortDirection,
} from './cutlist';
