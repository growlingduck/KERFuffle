import { getStorageClient } from '../data/client';
import { toStorageError } from '../data/errors';
import { BUILT_IN_ESTIMATE, parseEstimateSettings, STANDARD_MATERIALS } from '../data/materials';
import type { EstimateSettings } from '../data/materials';
import type { MaterialRecord } from '../data/types';
import { ESTIMATE_SETTING } from '../data/types';
import { createStore, useStore } from './createStore';

/**
 * The materials catalog and the shop's estimate settings, as every screen
 * sees them. Loaded at startup; Settings replaces them as it saves. Until the
 * first load (or if it fails) the standard materials and built-in settings
 * stand in, so a cut list always has something to group by.
 */
export interface MaterialsState {
  catalog: readonly MaterialRecord[];
  estimate: EstimateSettings;
  loaded: boolean;
}

export const materialsStore = createStore<MaterialsState, Partial<MaterialsState>>((state, patch) => ({ ...state, ...patch }), {
  catalog: STANDARD_MATERIALS,
  estimate: BUILT_IN_ESTIMATE,
  loaded: false,
});

export function useMaterials(): MaterialsState {
  return useStore(materialsStore, (s) => s);
}

/** Read the catalog and estimate settings. Keeps what it has if they can't be read. */
export async function loadMaterials(): Promise<void> {
  const client = getStorageClient();
  try {
    const [catalog, settings] = await Promise.all([client.listMaterials(), client.getShopSettings()]);
    materialsStore.dispatch({ catalog, estimate: parseEstimateSettings(settings.other[ESTIMATE_SETTING]), loaded: true });
  } catch (error) {
    console.warn('Could not read the materials', toStorageError(error));
  }
}

/** Save one material and update the list. Rejects with a StorageError. */
export async function storeMaterial(material: MaterialRecord): Promise<MaterialRecord> {
  const saved = await getStorageClient().saveMaterial(material);
  const { catalog } = materialsStore.getState();
  const known = catalog.some((m) => m.id === saved.id);
  materialsStore.dispatch({ catalog: known ? catalog.map((m) => (m.id === saved.id ? saved : m)) : [...catalog, saved] });
  return saved;
}

/** Delete one material. Rejects with a StorageError (a job uses it, or it's a default). */
export async function removeMaterial(id: string): Promise<void> {
  await getStorageClient().deleteMaterial(id);
  materialsStore.dispatch({ catalog: materialsStore.getState().catalog.filter((m) => m.id !== id) });
}

/** After Settings saves the estimate settings. */
export function setEstimateSettings(estimate: EstimateSettings): void {
  materialsStore.dispatch({ estimate });
}
