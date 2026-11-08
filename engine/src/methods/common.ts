import { DEFAULT_METHOD } from '../rules';
import type { MethodSettings, Part, PartRole } from '../types';
import { ticks, type Ticks } from '../units';
import type { MaterialSlot } from './types';

/** Material slots shared by the frameless methods. */
export const FRAMELESS_SLOTS: Readonly<Record<PartRole, MaterialSlot>> = Object.freeze({
  back: 'back',
  bottom: 'box',
  'side-left': 'box',
  'side-right': 'box',
  top: 'box',
  'stretcher-front': 'box',
  'stretcher-back': 'box',
  nailer: 'box',
  front: 'box',
  shelf: 'shelves',
  // Structural, so cut from the box stock, not the shelf stock.
  'fixed-shelf': 'box',
  'kick-board': 'base',
  'base-rail-front': 'base',
  'base-rail-back': 'base',
  'base-sleeper': 'base',
  'kick-skin': 'kick-face',
  'laminate-side-left': 'laminate',
  'laminate-side-right': 'laminate',
  'laminate-front': 'laminate',
});

/**
 * Parts whose front edge shows in a frameless cabinet, and so is edge banded:
 * the sides, the top or front stretcher, the bottom, the shelves and fixed shelves.
 */
export const FRAMELESS_BANDED: ReadonlySet<PartRole> = new Set([
  'side-left',
  'side-right',
  'top',
  'stretcher-front',
  'bottom',
  'shelf',
  'fixed-shelf',
]);

/**
 * Banding on one frameless piece: its front edge, which runs the part's length
 * (y = width is the front, see PartCorner). A notch at a front corner takes
 * its length off the edge: method B's kick notch leaves the edge above the kick.
 */
export function framelessBanding(part: Part): Ticks {
  if (!FRAMELESS_BANDED.has(part.role)) return ticks(0);
  const notched = (part.features ?? [])
    .filter((f) => f.corner === 'start-front' || f.corner === 'end-front')
    .reduce((sum, f) => sum + f.length, 0);
  return ticks(Math.max(0, part.length - notched));
}

/** The settings every frameless box reads. */
export const BOX_SETTINGS: readonly (keyof MethodSettings)[] = [
  'backType',
  'backThickness',
  'backGrooveDepth',
  'backDadoInset',
  'nailerWidth',
  'baseTop',
  'stretcherWidth',
  'kickDepth',
];

export function defaultsFor(settings: readonly (keyof MethodSettings)[]): Readonly<Partial<MethodSettings>> {
  return Object.freeze(Object.fromEntries(settings.map((key) => [key, DEFAULT_METHOD[key]])));
}
