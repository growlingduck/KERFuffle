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
export { PART_NAMES, PART_ORDER, ROLE_ORDER, calculateParts, jobParts, listedJobParts } from './calculate';

export {
  CONSTRUCTION_CHOICES,
  CONSTRUCTION_NAMES,
  applyConstructionChoice,
  constructionChoiceOf,
  constructionName,
  usesRuns,
} from './methods/names';
export type { ConstructionChoice } from './methods/names';
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

export { JOB_SLOTS, SLOT_INFO, hardwareSlot, materialIssues, partSlot, slotRule } from './materials';
export type { JobMaterials, JobSlot, Material, MaterialGrain, MaterialIssue, MaterialKind, SlotInfo, SupplySlot } from './materials';
export { DEFAULT_ESTIMATE_OPTIONS, estimate } from './estimate';
export type { Estimate, EstimateBasis, EstimateLine, EstimateOptions, EstimateTotal } from './estimate';

export { DEPENDENCIES, TRACE_KEYS, dependenciesFor, perturb, traceDependencies } from './dependencies';
export type { DependencyMap, PartField, TraceCase, TraceKey, TraceParts } from './dependencies';

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

export * from './nesting';
