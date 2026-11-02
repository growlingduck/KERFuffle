import { DEFAULT_METHOD } from '../rules';
import type { MethodSettings, PartRole } from '../types';
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
  'kick-board': 'base',
  'base-rail-front': 'base',
  'base-rail-back': 'base',
  'base-sleeper': 'base',
  'kick-skin': 'kick-face',
  'laminate-side-left': 'laminate',
  'laminate-side-right': 'laminate',
  'laminate-front': 'laminate',
});

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
