import type { Material } from '../materials';
import type { PartFeature } from '../types';
import type { Ticks } from '../units';
import type { SawProfile } from './profile';

/**
 * Layout results. Nothing here depends on a machine: the saw printout, DXF and
 * a later G-code post-processor all read the same JobLayout.
 *
 * Sheet coordinates, in Ticks: the origin is one corner of the full (untrimmed)
 * sheet. x runs along the sheet's **length** (the grain direction of a grained
 * material), y along its **width**. Every piece, offcut and cut lies inside the
 * trimmed rectangle [edgeTrim, length − edgeTrim] × [edgeTrim, width − edgeTrim].
 *
 * A piece that isn't rotated has its part length along x, so its grain runs
 * with the sheet's. A rotated piece is turned a quarter turn: its part length
 * runs along y. Part features are given in sheet coordinates, already turned.
 */

/** Cost: fewest sheets. Grain: no piece turned, visible pieces first. Time: fewest saw setups. */
export type LayoutMode = 'cost' | 'grain' | 'time';

export const LAYOUT_MODES: readonly LayoutMode[] = ['cost', 'grain', 'time'];

export interface LayoutOptions {
  mode: LayoutMode;
  /** Same input and seed: same layout. */
  seed: number;
  /**
   * A safety stop for the improvement search. The search runs a fixed number
   * of steps so its result never depends on the computer's speed; if this
   * limit is hit first, the result says so (`search.complete` is false).
   */
  timeLimitMs: number;
  /** Improvement steps per material. Default: DEFAULT_ITERATIONS. */
  iterations?: number;
}

/** One piece to cut: one of a cut-list line's quantity. */
export interface Piece {
  /** "P3-2": the line's mark and which of its pieces this is. */
  id: string;
  mark: string;
  /** The cut-list line's key. */
  lineKey: string;
  name: string;
  /** The cabinet label ("B1") or run ("Run: Sink wall") the piece is for. */
  ref: string;
  /** Part length (with the grain) and width. */
  length: Ticks;
  width: Ticks;
  /** Shows in the finished job (fronts, laminate, kick faces). */
  visible: boolean;
  /** The material has grain, so the piece may not be turned. */
  grainLocked: boolean;
  features: readonly PartFeature[];
}

/** A part feature on a placed piece, as a rectangle in sheet coordinates. */
export interface PlacedFeature {
  kind: PartFeature['kind'];
  x: Ticks;
  y: Ticks;
  length: Ticks;
  width: Ticks;
  /** The feature as the part declares it, in part coordinates. */
  part: PartFeature;
}

/** Where one piece of a sheet pattern goes. */
export interface Placement {
  mark: string;
  lineKey: string;
  name: string;
  x: Ticks;
  y: Ticks;
  /** Extent along x and along y on the sheet. */
  length: Ticks;
  width: Ticks;
  rotated: boolean;
  /** The part's own length and width. */
  partLength: Ticks;
  partWidth: Ticks;
  visible: boolean;
  grainLocked: boolean;
  features: PlacedFeature[];
}

export interface Offcut {
  x: Ticks;
  y: Ticks;
  length: Ticks;
  width: Ticks;
  /** At least the profile's keepable size, either way round. Otherwise waste. */
  keepable: boolean;
}

/** Rip and crosscut by the direction the cut runs; trim for every cut below the second stage. */
export type CutStage = 'rip' | 'crosscut' | 'trim';

/** One saw cut. */
export interface Cut {
  /** 1-based, in cut order on the sheet. */
  n: number;
  stage: CutStage;
  /** 1: cuts across the whole sheet; 2: across a strip; 3 and on: trims. */
  depth: number;
  /** The direction the cut line runs: x is along the sheet's length (a rip on a grained sheet). */
  along: 'x' | 'y';
  /** Where the kerf starts, on the other axis. The kerf is [at, at + kerf]. */
  at: Ticks;
  /** The cut's extent along `along`. */
  from: Ticks;
  to: Ticks;
  /** The fence or stop setting: the size of what this cut takes off. */
  setting: Ticks;
}

/**
 * The sheet's guillotine cut tree. A split's children lie side by side across
 * `axis`, from the low edge, with one kerf between neighbors; each cut runs
 * the full length of the region it divides.
 */
export type CutNode =
  | { kind: 'piece'; x: Ticks; y: Ticks; length: Ticks; width: Ticks; placement: number }
  | { kind: 'offcut'; x: Ticks; y: Ticks; length: Ticks; width: Ticks; offcut: number }
  | {
      kind: 'split';
      x: Ticks;
      y: Ticks;
      length: Ticks;
      width: Ticks;
      /** Children are stacked along this axis; the cuts between them run along the other. */
      axis: 'x' | 'y';
      depth: number;
      children: CutNode[];
      /** Indexes into the pattern's `cuts`. */
      cuts: number[];
    };

/** Identical sheets merged into one pattern, cut `count` times. */
export interface SheetPattern {
  /** 1-based, in sheet order. */
  id: number;
  count: number;
  /** The direction of this pattern's first cuts. */
  firstCut: 'length' | 'width';
  placements: Placement[];
  /** The trimmed sheet, divided. */
  cutTree: CutNode;
  /** In cut order: every first-stage cut, then each strip's crosscuts, then the trims. */
  cuts: Cut[];
  offcuts: Offcut[];
  /** The sheets cut to this pattern: sheet number (1-based, per material) and the piece at each placement. */
  sheets: { number: number; pieceIds: string[] }[];
  /** Piece area over full sheet area, in percent. */
  yieldPercent: number;
}

export interface LayoutStats {
  sheets: number;
  pieces: number;
  /** All piece area over all sheet area (full sheets), in percent, to one decimal. */
  yieldPercent: number;
  /**
   * Rip-fence settings: distinct rip widths at each cutting stage, added up.
   * Every strip of one width is ripped at one setting before the fence moves;
   * a width that comes up again at a later stage (after the crosscuts) is set
   * again.
   */
  fenceSettings: number;
  /** Crosscut stop settings, counted the same way. */
  crosscutStops: number;
  patterns: number;
  /** Every saw cut on every sheet, edge trims not included. */
  cuts: number;
  keepableOffcuts: number;
}

export type UnplacedReason = 'too-big' | 'no-material' | 'no-sheet-size' | 'solid-stock';

export interface UnplacedPiece {
  piece: Piece;
  reason: UnplacedReason;
  /** Plain words: "P1 Side (100 × 23 1/4) is bigger than a trimmed sheet of Birch plywood 3/4″." */
  message: string;
}

export interface MaterialLayout {
  material: Material;
  /** The full sheet, x along its length. */
  sheetLength: Ticks;
  sheetWidth: Ticks;
  /** Every piece cut from this material, placed or not. */
  pieces: Piece[];
  patterns: SheetPattern[];
  unplaced: UnplacedPiece[];
  /** Pieces narrower than the profile's smallest safe piece. Laid out, but cut them with care. */
  small: string[];
  stats: LayoutStats;
}

export interface JobLayout {
  algorithmVersion: number;
  mode: LayoutMode;
  seed: number;
  profile: SawProfile;
  /** One per material, in cut-list group order. */
  materials: MaterialLayout[];
  /** Pieces with no material, a material without a sheet size, or solid stock. */
  unplaced: UnplacedPiece[];
  search: {
    /** Improvement steps run, all materials together. */
    iterations: number;
    /** False when the time limit stopped the search before its steps ran out. */
    complete: boolean;
  };
}

export interface LayoutProgress {
  /** 'first': the fast first layout. 'improved': the search found a better one. */
  phase: 'first' | 'improved';
  layout: JobLayout;
}
