import { inches, type Ticks } from '../units';

/**
 * Saw profiles: how the shop's saw cuts. The shop keeps a list in Settings; a
 * job keeps a copy of the one it uses, like its rules.
 * docs/plan-methods-optimizer-costing.md §2.2.
 */

/**
 * Which way the first cuts run. `length`: rip along the sheet's length (a
 * table saw). `width`: crosscut the sheet first. `either`: the optimizer picks
 * per sheet (a panel saw).
 */
export type FirstCut = 'length' | 'width' | 'either';

export interface SawProfile {
  id: string;
  name: string;
  /** Blade width: lost at every cut. */
  kerf: Ticks;
  /** Taken off each of the four sheet edges before anything is cut (the trim cut's own kerf included). */
  edgeTrim: Ticks;
  /** The narrowest piece the saw cuts safely. Narrower pieces are laid out but flagged. */
  minPiece: Ticks;
  /** The smallest offcut worth keeping, either way round. */
  keepLength: Ticks;
  keepWidth: Ticks;
  firstCut: FirstCut;
  /** Time mode may use this many more sheets per material than Cost mode. */
  extraSheets: number;
}

const SEED = {
  kerf: inches(1 / 8),
  edgeTrim: inches(1 / 4),
  minPiece: inches(2),
  keepLength: inches(12),
  keepWidth: inches(12),
  extraSheets: 1,
} as const;

/** The profiles a new shop starts with. Both kerfs should be checked against the real blades. */
export const DEFAULT_SAW_PROFILES: readonly SawProfile[] = Object.freeze([
  Object.freeze({ id: 'table-saw', name: 'Table saw', ...SEED, firstCut: 'length' as const }),
  Object.freeze({ id: 'panel-saw', name: 'Panel saw', ...SEED, firstCut: 'either' as const }),
]);

/**
 * How a layout is cut. Only the saw exists now; a router would add a bit
 * diameter and clearance, and allow nesting that isn't guillotine.
 */
export type CuttingMode = { kind: 'saw'; profile: SawProfile };

/** The spacing rules a layout follows. Every gap in the optimizer comes from here. */
export interface Spacing {
  /** Gap between two neighboring pieces, and between a piece and an offcut. */
  between: Ticks;
  /** Taken off each sheet edge before layout. */
  edge: Ticks;
  /** Every cut runs edge to edge of the piece it divides. */
  guillotine: boolean;
}

/** The one place spacing is decided. Saw mode: the kerf between pieces, the edge trim at the sheet edges. */
export function spacingFor(mode: CuttingMode): Spacing {
  switch (mode.kind) {
    case 'saw':
      return { between: mode.profile.kerf, edge: mode.profile.edgeTrim, guillotine: true };
  }
}
