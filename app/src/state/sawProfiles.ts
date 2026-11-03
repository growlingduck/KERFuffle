import { getStorageClient } from '../data/client';
import { toStorageError } from '../data/errors';
import { BUILT_IN_SAW, parseSawSettings } from '../data/sawProfiles';
import type { SawSettings } from '../data/sawProfiles';
import { SAW_PROFILES_SETTING } from '../data/types';
import { createStore, useStore } from './createStore';

/**
 * The shop's saw profiles, as every screen sees them. Loaded at startup;
 * Settings replaces them as it saves. Until the first load (or if it fails)
 * the built-in Table saw and Panel saw stand in.
 */
export interface SawProfilesState {
  settings: SawSettings;
  loaded: boolean;
}

export const sawProfilesStore = createStore<SawProfilesState, Partial<SawProfilesState>>((state, patch) => ({ ...state, ...patch }), {
  settings: BUILT_IN_SAW,
  loaded: false,
});

export function useSawProfiles(): SawProfilesState {
  return useStore(sawProfilesStore, (s) => s);
}

/** Read the shop's profiles. Keeps what it has if they can't be read. */
export async function loadSawProfiles(): Promise<void> {
  try {
    const { other } = await getStorageClient().getShopSettings();
    sawProfilesStore.dispatch({ settings: parseSawSettings(other[SAW_PROFILES_SETTING]), loaded: true });
  } catch (error) {
    console.warn('Could not read the saw profiles', toStorageError(error));
  }
}

/** After Settings saves them. */
export function setSawSettings(settings: SawSettings): void {
  sawProfilesStore.dispatch({ settings });
}
