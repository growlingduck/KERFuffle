import { DEFAULT_SAW_PROFILES, inches } from '@kerfuffle/engine';
import type { FirstCut, SawProfile, Ticks } from '@kerfuffle/engine';
import type { JobRecord } from './types';

/**
 * Saw profiles as the app keeps them (plan §2.2): the shop's list and which
 * one new jobs get, as one shop setting; each job keeps a copy of its own.
 * Editing a profile in Settings never changes a job.
 */

export interface SawSettings {
  /** In the order the shop sees them. Never empty. */
  profiles: SawProfile[];
  /** The profile new jobs copy. Always one of `profiles`. */
  defaultId: string;
}

export const BUILT_IN_SAW: Readonly<SawSettings> = Object.freeze({
  profiles: DEFAULT_SAW_PROFILES.map((p) => ({ ...p })),
  defaultId: DEFAULT_SAW_PROFILES[0]!.id,
});

export const FIRST_CUTS: readonly FirstCut[] = ['length', 'width', 'either'];
export const FIRST_CUT_NAMES: Readonly<Record<FirstCut, string>> = {
  length: 'Rip along the length',
  width: 'Crosscut first',
  either: 'Either (the optimizer picks)',
};

/** The sizes a profile has, in the order the Settings form shows them. */
export type SawLengthField = 'kerf' | 'edgeTrim' | 'minPiece' | 'keepLength' | 'keepWidth';
export const SAW_LENGTH_FIELDS: readonly SawLengthField[] = ['kerf', 'edgeTrim', 'minPiece', 'keepLength', 'keepWidth'];

export const MAX_EXTRA_SHEETS = 10;
/** Past these, the number is surely a typing slip. */
const LIMITS: Readonly<Record<SawLengthField, Ticks>> = {
  kerf: inches(1 / 2),
  edgeTrim: inches(2),
  minPiece: inches(24),
  keepLength: inches(96),
  keepWidth: inches(96),
};

/** What's wrong with a profile, by field. Empty when it can be saved. */
export function sawProfileIssues(p: SawProfile): Partial<Record<SawLengthField | 'name' | 'extraSheets', string>> {
  const issues: Partial<Record<SawLengthField | 'name' | 'extraSheets', string>> = {};
  if (p.name.trim() === '') issues.name = 'A profile needs a name.';
  for (const field of SAW_LENGTH_FIELDS) {
    const value = p[field];
    if (!Number.isSafeInteger(value) || value < 0) issues[field] = 'Can’t be less than 0.';
    else if (value > LIMITS[field]) issues[field] = `That’s more than ${LIMITS[field] / 64}″. Check the number.`;
  }
  if (!Number.isInteger(p.extraSheets) || p.extraSheets < 0 || p.extraSheets > MAX_EXTRA_SHEETS) {
    issues.extraSheets = `Between 0 and ${MAX_EXTRA_SHEETS}.`;
  }
  return Object.fromEntries(Object.entries(issues).filter(([, v]) => v !== undefined));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const size = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A stored profile, or null when it can't be read. */
export function parseSawProfile(raw: unknown): SawProfile | null {
  if (!isObject(raw)) return null;
  const { id, name, kerf, edgeTrim, minPiece, keepLength, keepWidth, firstCut, extraSheets } = raw;
  if (typeof id !== 'string' || id.trim() === '' || typeof name !== 'string' || name.trim() === '') return null;
  if (![kerf, edgeTrim, minPiece, keepLength, keepWidth, extraSheets].every(size)) return null;
  if (!FIRST_CUTS.includes(firstCut as FirstCut)) return null;
  return {
    id,
    name,
    kerf: kerf as Ticks,
    edgeTrim: edgeTrim as Ticks,
    minPiece: minPiece as Ticks,
    keepLength: keepLength as Ticks,
    keepWidth: keepWidth as Ticks,
    firstCut: firstCut as FirstCut,
    extraSheets: extraSheets as number,
  };
}

/** Read the stored setting. Unreadable profiles are left out; with none left, the built-in ones. */
export function parseSawSettings(raw: unknown): SawSettings {
  const source = isObject(raw) ? raw : {};
  const seen = new Set<string>();
  const profiles = (Array.isArray(source.profiles) ? source.profiles : [])
    .map(parseSawProfile)
    .filter((p): p is SawProfile => p !== null && !seen.has(p.id) && Boolean(seen.add(p.id)));
  if (profiles.length === 0) return { profiles: BUILT_IN_SAW.profiles.map((p) => ({ ...p })), defaultId: BUILT_IN_SAW.defaultId };
  const defaultId = profiles.some((p) => p.id === source.defaultId) ? (source.defaultId as string) : profiles[0]!.id;
  return { profiles, defaultId };
}

/** The setting as stored. */
export function sawSettingValue(settings: SawSettings): Record<string, unknown> {
  return { profiles: settings.profiles.map((p) => ({ ...p })), defaultId: settings.defaultId };
}

export function defaultProfile(settings: SawSettings): SawProfile {
  return settings.profiles.find((p) => p.id === settings.defaultId) ?? settings.profiles[0] ?? BUILT_IN_SAW.profiles[0]!;
}

/** The profile a job lays out with: its own copy, or (made before saw profiles) the shop's default. */
export function jobSawProfile(job: Pick<JobRecord, 'sawProfile'>, settings: SawSettings): SawProfile {
  return job.sawProfile ?? defaultProfile(settings);
}

/**
 * A job's stored copy: null when it has none (made before saw profiles).
 * Throws when there is one but it can't be read.
 */
export function parseJobSawProfile(raw: unknown): SawProfile | null {
  if (raw === null || raw === undefined) return null;
  const profile = parseSawProfile(raw);
  if (!profile) throw new Error('its saw profile is unreadable');
  return profile;
}

/** Two profiles cut the same way (names and ids aside). */
export function sameCutting(a: SawProfile, b: SawProfile): boolean {
  return SAW_LENGTH_FIELDS.every((f) => a[f] === b[f]) && a.firstCut === b.firstCut && a.extraSheets === b.extraSheets;
}
