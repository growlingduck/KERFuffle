import { DEFAULT_CUT_LIST_OPTIONS } from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules, JobMaterials, LayoutInput, LayoutMode, SawProfile } from '@kerfuffle/engine';
import { cabinetSpec } from '../data/jobSession';
import { effectiveJobMaterials, engineMaterials } from '../data/materials';
import type { EstimateSettings } from '../data/materials';
import { jobSawProfile } from '../data/sawProfiles';
import type { SawSettings } from '../data/sawProfiles';
import type { JobRecord, MaterialRecord } from '../data/types';

/** Every layout the app makes uses this seed, so the same job always lays out the same. */
export const LAYOUT_SEED = 1;
/** A safety stop only: the search runs a fixed number of steps (docs/sheet-optimizer.md). */
export const LAYOUT_TIME_LIMIT_MS = 5000;

export interface LayoutParts {
  cabinets: readonly CabinetSpec[];
  rules: ConstructionRules;
  materials: JobMaterials;
  profile: SawProfile;
  /** The cut list's "Include fronts": the layout cuts what the cut list lists. */
  includeFronts: boolean;
}

/** What the optimizer lays out for a job in one mode. */
export function layoutInputOf(parts: LayoutParts, mode: LayoutMode): LayoutInput {
  return {
    cabinets: parts.cabinets,
    rules: parts.rules,
    materials: parts.materials,
    cutListOptions: { ...DEFAULT_CUT_LIST_OPTIONS, mode: 'merged', includeFronts: parts.includeFronts },
    profile: parts.profile,
    options: { mode, seed: LAYOUT_SEED, timeLimitMs: LAYOUT_TIME_LIMIT_MS },
  };
}

export interface ShopContext {
  catalog: readonly MaterialRecord[];
  estimate: EstimateSettings;
  saw: SawSettings;
}

/** The same, from a job record and the shop's settings (a job that isn't on screen). */
export function jobLayoutInput(job: JobRecord, shop: ShopContext, mode: LayoutMode, includeFronts: boolean, at: string): LayoutInput {
  const record = effectiveJobMaterials(job, shop.catalog, shop.estimate, at);
  return layoutInputOf(
    {
      cabinets: job.cabinets.map(cabinetSpec),
      rules: job.rules,
      materials: engineMaterials(record, shop.catalog),
      profile: jobSawProfile(job, shop.saw),
      includeFronts,
    },
    mode,
  );
}
