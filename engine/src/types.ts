import type { Ticks } from './units';

export type CabinetType = 'base' | 'wall';
export type FinishedEnds = 'none' | 'left' | 'right' | 'both';

export interface CabinetSpec {
  /** Carried to every part, e.g. "B1". */
  id: string;
  type: CabinetType;
  /** Overall width, side to side. */
  width: Ticks;
  /** Overall height. For base cabinets this includes toe kick and countertop. */
  height: Ticks;
  /** Overall depth, front to back. */
  depth: Ticks;
  /** Integer >= 0. */
  shelfCount: number;
  finishedEnds: FinishedEnds;
  /** Integer >= 1. Every part quantity is multiplied by this. */
  quantity: number;
}

export type ShelfThickComparison = 'gt' | 'gte';

/**
 * Shop construction rules. Every hard-coded number or behavior from the legacy
 * calculators has a named field here so nothing is decided silently in code.
 * See docs/calculation-rules.md for the origin and status of each field.
 */
export interface ConstructionRules {
  /** Thickness of all box panels (back, bottom, sides, top, front). */
  panelThickness: Ticks;
  /** Base cabinets only. Subtracted from overall height to get box height. */
  toeKickHeight: Ticks;
  /** Base cabinets only. Subtracted from overall height to get box height. */
  countertopThickness: Ticks;

  /** Shelf thickness for narrower cabinets (3/4"). */
  shelfThickness: Ticks;
  /** Shelf thickness for wide cabinets (1"). */
  wideShelfThickness: Ticks;
  /** Cabinet width at which shelves switch to `wideShelfThickness` (36"). */
  shelfThickWidthThreshold: Ticks;
  /**
   * 'gte': width >= threshold is wide (web, confirmed by the shop).
   * 'gt': width > threshold is wide (spreadsheet; legacy reproduction only).
   */
  shelfThickComparison: ShelfThickComparison;
  /** Gap left at EACH side of a shelf; shelf length loses twice this (shop: 1/8"). */
  shelfClearancePerSide: Ticks;
  /** Amount taken off shelf depth so it sits back from the front (shop: 1/8"). */
  shelfSetback: Ticks;

  /**
   * Extra laminate past EACH edge; every laminate dimension gains twice this
   * (shop: 1" all around). Laminate never carries a thickness.
   */
  laminateOversizePerEdge: Ticks;

  /**
   * Legacy reproduction only. The spreadsheet subtracted toe kick and
   * countertop from the wall-cabinet back. The shop confirmed this is wrong;
   * keep false except in LEGACY_SHEET_RULES.
   */
  legacyWallBackDeductsBaseAllowances: boolean;
  /**
   * Legacy reproduction only. Both legacy versions subtracted toe kick and
   * countertop from wall-cabinet laminate. The shop confirmed this is wrong;
   * keep false except in the LEGACY_* presets.
   */
  legacyWallLaminateDeductsBaseAllowances: boolean;
}

export type PartRole =
  | 'back'
  | 'bottom'
  | 'side-left'
  | 'side-right'
  | 'top'
  | 'front'
  | 'shelf'
  | 'laminate-side-left'
  | 'laminate-side-right'
  | 'laminate-front';

export type PartCategory = 'panel' | 'laminate';

export interface Part {
  cabinetId: string;
  role: PartRole;
  category: PartCategory;
  /** Human label, e.g. "Left side". */
  name: string;
  /**
   * The grain-wise dimension: vertical for back, sides, front and laminate;
   * side to side for top, bottom and shelves.
   */
  length: Ticks;
  /** The cross-grain dimension. */
  width: Ticks;
  /** Null when not tracked (laminate, by default). */
  thickness: Ticks | null;
  quantity: number;
  /**
   * True only for the Front reference size (door blank / front laminate size).
   * The cut-list layer decides whether to show optional parts.
   */
  optional: boolean;
}

export type ValidationField = keyof CabinetSpec | keyof ConstructionRules;

export interface ValidationIssue {
  field: ValidationField;
  severity: 'error' | 'warning';
  /** Plain-language message, shown beside the field. */
  message: string;
}

export interface CalculationResult {
  /** Empty whenever `issues` contains an error. */
  parts: Part[];
  issues: ValidationIssue[];
}
