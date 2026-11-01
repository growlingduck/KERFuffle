import type { DisplaySettings, RoundTo } from '../data/types';
import { DEFAULT_ROUND_TO } from '../data/types';
import { createStore, useStore } from './createStore';

/**
 * How sizes are shown: the shop's "round shown sizes to" setting. Loaded at
 * startup and replaced when Settings are saved. `displayInches` reads it, so
 * every screen, the CSV and the printout round the same way. Screens that
 * aren't on view re-render from it when they next mount.
 */
export const displayStore = createStore<DisplaySettings, DisplaySettings>((_state, next) => next, { roundTo: DEFAULT_ROUND_TO });

export function displayRoundTo(): RoundTo {
  return displayStore.getState().roundTo;
}

export function setDisplaySettings(settings: DisplaySettings): void {
  if (settings.roundTo !== displayStore.getState().roundTo) displayStore.dispatch(settings);
}

export function useDisplayRoundTo(): RoundTo {
  return useStore(displayStore, (s) => s.roundTo);
}
