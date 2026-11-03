/**
 * The sheet optimizer: lays a job's pieces out on stock sheets for a table or
 * panel saw. docs/plan-methods-optimizer-costing.md §2 and §4.
 */
export { DEFAULT_SAW_PROFILES, spacingFor } from './profile';
export type { CuttingMode, FirstCut, SawProfile, Spacing } from './profile';
export { ALGORITHM_VERSION, DEFAULT_ITERATIONS, DEFAULT_LAYOUT_OPTIONS, cutListFor, layoutInput, layoutJob } from './layout';
export type { LayoutInput } from './layout';
export { layoutKey, materialInputKeys } from './hash';
export { sensitivity, SENSITIVITY_LIMITS } from './sensitivity';
export type { AllowanceRisk, FragileStrip, LightSheet, NearMiss, Sensitivity, SensitivityAllowance } from './sensitivity';
export { LAYOUT_MODES } from './types';
export type {
  Cut,
  CutNode,
  CutStage,
  JobLayout,
  LayoutMode,
  LayoutOptions,
  LayoutProgress,
  LayoutStats,
  MaterialLayout,
  Offcut,
  Piece,
  PlacedFeature,
  Placement,
  SheetPattern,
  UnplacedPiece,
  UnplacedReason,
} from './types';
