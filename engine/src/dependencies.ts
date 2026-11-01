import type { CabinetType, PartRole } from './types';

/**
 * Linked tracing (interaction-design §5.5): which part dimensions move when an
 * input moves. The workspace uses this to tint the affected cells and parts.
 *
 * Keys are cabinet inputs (`w h box toe ctop d shelves ends qty`) and
 * construction rules (`p cl sb wide lam`). `box` is the box height, which the
 * user changes through the overall height.
 *
 * engine/test/dependencies.test.ts derives every entry by nudging the input by
 * 1/64″ and checking which part dimensions change, so this map can't drift
 * from the formulas in calculate.ts.
 */
export type TraceKey =
  | 'w'
  | 'h'
  | 'box'
  | 'toe'
  | 'ctop'
  | 'd'
  | 'shelves'
  | 'ends'
  | 'qty'
  | 'p'
  | 'cl'
  | 'sb'
  | 'wide'
  | 'lam';

export const TRACE_KEYS: readonly TraceKey[] = ['w', 'h', 'box', 'toe', 'ctop', 'd', 'shelves', 'ends', 'qty', 'p', 'cl', 'sb', 'wide', 'lam'];

/** A part's Length, Width, Thickness or Quantity. */
export type PartField = 'L' | 'W' | 'T' | 'qty';

export type DependencyMap = Readonly<Partial<Record<PartRole, readonly PartField[]>>>;

const BOX_HEIGHT: DependencyMap = {
  back: ['L'],
  'side-left': ['L'],
  'side-right': ['L'],
  front: ['L'],
  'laminate-side-left': ['L'],
  'laminate-side-right': ['L'],
  'laminate-front': ['L'],
};

const EVERY_QUANTITY: DependencyMap = {
  back: ['qty'],
  bottom: ['qty'],
  'side-left': ['qty'],
  'side-right': ['qty'],
  top: ['qty'],
  front: ['qty'],
  shelf: ['qty'],
  'laminate-side-left': ['qty'],
  'laminate-side-right': ['qty'],
  'laminate-front': ['qty'],
};

/** Dependencies for a base cabinet with the shop rules. */
export const DEPENDENCIES: Readonly<Record<TraceKey, DependencyMap>> = {
  w: { back: ['W'], bottom: ['L'], top: ['L'], front: ['W'], shelf: ['L'], 'laminate-front': ['W'] },
  h: BOX_HEIGHT,
  box: BOX_HEIGHT,
  toe: BOX_HEIGHT,
  ctop: BOX_HEIGHT,
  d: {
    bottom: ['W'],
    'side-left': ['W'],
    'side-right': ['W'],
    top: ['W'],
    shelf: ['W'],
    'laminate-side-left': ['W'],
    'laminate-side-right': ['W'],
  },
  shelves: { shelf: ['qty'] },
  ends: { 'laminate-side-left': ['qty'], 'laminate-side-right': ['qty'] },
  qty: EVERY_QUANTITY,
  // Bottom and top stop at the back (D − p), so p moves their width too.
  p: {
    back: ['T'],
    bottom: ['L', 'W', 'T'],
    'side-left': ['W', 'T'],
    'side-right': ['W', 'T'],
    top: ['L', 'W', 'T'],
    front: ['T'],
    shelf: ['L', 'W'],
  },
  cl: { shelf: ['L'] },
  sb: { shelf: ['W'] },
  wide: { shelf: ['T'] },
  lam: {
    'laminate-side-left': ['L', 'W'],
    'laminate-side-right': ['L', 'W'],
    'laminate-front': ['L', 'W'],
  },
};

const NONE: DependencyMap = {};

/**
 * What a trace key moves on a cabinet of this type. Wall cabinets use their
 * full height, so toe kick and countertop move nothing on them.
 */
export function dependenciesFor(key: TraceKey, type: CabinetType): DependencyMap {
  if (type === 'wall' && (key === 'toe' || key === 'ctop')) return NONE;
  return DEPENDENCIES[key];
}
