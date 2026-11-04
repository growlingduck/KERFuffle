import type { DisplaySettings, RoundTo } from '../data/types';
import { DEFAULT_ROUND_TO } from '../data/types';
import { createStore, useStore } from './createStore';

/**
 * How sizes are shown: the shop's "round shown sizes to" setting. Loaded at
 * startup and replaced when Settings are saved. `displayInches` reads it, so
 * every screen, the CSV and the printout round the same way. Screens that
 * aren't on view re-render from it when they next mount.
 *
 * The same stored setting remembers that the workspace's tracing hint was
 * dismissed. Until the setting is read, the hint counts as dismissed, so it
 * never flashes up and away.
 */
export const displayStore = createStore<DisplaySettings, DisplaySettings>((_state, next) => next, {
  roundTo: DEFAULT_ROUND_TO,
  tracingHintDismissed: true,
});

export function displayRoundTo(): RoundTo {
  return displayStore.getState().roundTo;
}

export function setDisplaySettings(settings: DisplaySettings): void {
  const now = displayStore.getState();
  if (settings.roundTo !== now.roundTo || settings.tracingHintDismissed !== now.tracingHintDismissed) displayStore.dispatch(settings);
}

export function useDisplayRoundTo(): RoundTo {
  return useStore(displayStore, (s) => s.roundTo);
}

export function useTracingHintDismissed(): boolean {
  return useStore(displayStore, (s) => s.tracingHintDismissed);
}
