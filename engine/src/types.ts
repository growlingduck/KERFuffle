import type { Ticks } from './units';

/** Base and tall cabinets stand on the floor; only base cabinets have a countertop. */
export type CabinetType = 'base' | 'wall' | 'tall';
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
  /**
   * The straight row of base cabinets this one belongs to, e.g. "Sink wall".
   * Base cabinets in the same run share one ladder base (method A1). Blank or
   * missing: the cabinet gets its own. Separate from any room grouping.
   */
  run?: string | null;
  /**
   * Tall cabinets only: structural shelves at full box depth, fastened like
   * the bottom. Integer >= 0; missing means 0. Kept but ignored on base and
   * wall cabinets, so switching back to tall restores it.
   */
  fixedShelfCount?: number;
  /**
   * Tall cabinets only: a second nailer under the lowest fixed shelf. Used
   * only with an inset back and at least one fixed shelf. Missing means false.
   */
  midNailer?: boolean;
  /**
   * Tall cabinets only: the back is cut as two pieces that join at the lowest
   * fixed shelf (needs one). Missing means false.
   */
  splitBack?: boolean;
}

export type ShelfThickComparison = 'gt' | 'gte';

/** A: frameless on a separate base. B: frameless with an integral toe kick. */
export type MethodId = 'A' | 'B';
/** Method A's base: a ladder base (A1) or leveling legs with a clip-on kick (A2). */
export type BaseType = 'ladder' | 'legs';
/** Applied: full width, behind the sides. Dado and rabbet: a thin back set into the box. */
export type BackType = 'applied' | 'dado' | 'rabbet';
/** What closes the top of a base box: a full panel, or a front and a back stretcher. */
export type BaseTop = 'full' | 'stretchers';

/**
 * How the cabinets are built. Chosen once per job; every cabinet uses it.
 * See docs/calculation-rules.md, "Construction methods". Settings a method
 * does not use are kept, so switching back restores them.
 */
export interface MethodSettings {
  id: MethodId;
  backType: BackType;
  /** Null: the back is the panel thickness. */
  backThickness: Ticks | null;
  /** Dado and rabbet backs: how deep the groove is. */
  backGrooveDepth: Ticks;
  /** Dado backs: how far the groove sits in from the back edge. */
  backDadoInset: Ticks;
  /** Inset backs: height of the nailer (hanging rail) under the top. */
  nailerWidth: Ticks;
  /** Base cabinets only. */
  baseTop: BaseTop;
  stretcherWidth: Ticks;
  /** How far the kick face sits back from the cabinet front. */
  kickDepth: Ticks;
  /** Method A only. */
  baseType: BaseType;
  /** A1: largest center-to-center gap between sleepers. */
  sleeperSpacingMax: Ticks;
  /** A1: longest platform section; longer runs are split. */
  platformLengthMax: Ticks;
  /** A1: thickness of the finished skin over the front rail. */
  kickSkinThickness: Ticks;
  /** A2: leveling legs per box, and per box wider than `legWidthThreshold`. */
  legsPerBox: number;
  legsPerWideBox: number;
  legWidthThreshold: Ticks;
  /**
   * Method A: whether the base parts are on the cut list. False only on rules
   * upgraded from version 1, which never listed the base; new jobs get true.
   */
  listBase: boolean;
}

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
   * Tall cabinets: a new one whose box is taller than this starts with one
   * fixed shelf (shop: 72″). Sets the starting count only (rules version 3).
   */
  tallFixedShelfAbove: Ticks;

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

  /** The construction method and its settings (rules version 2). */
  method: MethodSettings;
}

export type PartRole =
  | 'back'
  | 'bottom'
  | 'side-left'
  | 'side-right'
  | 'top'
  | 'stretcher-front'
  | 'stretcher-back'
  | 'nailer'
  | 'kick-board'
  | 'front'
  | 'shelf'
  | 'fixed-shelf'
  | 'base-rail-front'
  | 'base-rail-back'
  | 'base-sleeper'
  | 'kick-skin'
  | 'laminate-side-left'
  | 'laminate-side-right'
  | 'laminate-front';

/** Sheet goods, solid stock (for a later face-frame method), or laminate. */
export type PartCategory = 'panel' | 'lumber' | 'laminate';

/**
 * Part coordinates: the part lies flat, length along x (0 → length) and width
 * along y (0 → width). x = 0 is the part's **start**: the bottom edge of a part
 * that stands up in the cabinet, the left end of one that lies across it.
 * y = width is the **front** edge (the one facing the room); y = 0 is the back.
 * The coordinates are the same for left and right parts; a drawing of a
 * part's outside face mirrors one of them.
 */
export type PartCorner = 'start-front' | 'start-back' | 'end-front' | 'end-back';

/**
 * A rectangle cut out of one corner of a part: `length` along x, `width`
 * along y, both measured from that corner. Method B's toe-kick notch is
 * `{ kind: 'notch', corner: 'start-front', length: kick height, width: kick depth }`.
 */
export interface NotchFeature {
  kind: 'notch';
  corner: PartCorner;
  length: Ticks;
  width: Ticks;
}

/** Machining on a part. The saw cut list ignores features except to note them. */
export type PartFeature = NotchFeature;

export interface Part {
  /**
   * The reference the cut list shows: the cabinet label ("B1"), or the run
   * ("Run: Sink wall") for parts a run shares.
   */
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
  /** Cutouts and machining, in part coordinates. Absent when there are none. */
  features?: PartFeature[];
  /** Set on parts a run of cabinets shares: the run's name. */
  run?: string;
}

/** A method setting, as a validation field: "method.kickDepth". */
export type MethodField = `method.${keyof MethodSettings}`;

export type ValidationField = keyof CabinetSpec | keyof ConstructionRules | MethodField;

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
