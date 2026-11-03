import { ALGORITHM_VERSION, LAYOUT_MODES } from '@kerfuffle/engine';
import type { JobLayout, LayoutMode, MaterialLayout, SawProfile } from '@kerfuffle/engine';
import { parseSawProfile, sameCutting } from './sawProfiles';
import type { JobRecord, JobStatus, SavedLayoutRecord } from './types';

/**
 * Sheet layouts kept with a job (plan §2.6). A draft's layouts are worked out
 * again whenever its inputs change. Once a job is Ready to cut, the layout it
 * was saved with is the one shown and printed, even after its cut list, saw
 * profile or the optimizer itself changes: the screen says what changed and
 * offers Recalculate. A layout is also saved when it is printed or saved as
 * PDF, so the sheets on the saw match the paper.
 */

/** Ready to cut and after: the saved layout stays until Recalculate. */
export function layoutsFixed(status: JobStatus): boolean {
  return status !== 'draft';
}

/** What a saved layout was made from that is now different. */
export type LayoutChange = 'cutList' | 'profile' | 'mode' | 'algorithm';

export interface CurrentInputs {
  /** `materialInputKeys` now, by material id. */
  inputKeys: Readonly<Record<string, string>>;
  profile: SawProfile;
  mode: LayoutMode;
}

export function layoutChanges(record: SavedLayoutRecord, now: CurrentInputs): LayoutChange[] {
  const changes: LayoutChange[] = [];
  if (now.inputKeys[record.materialId] !== record.inputHash) changes.push('cutList');
  if (!sameCutting(record.profile, now.profile)) changes.push('profile');
  if (record.mode !== now.mode) changes.push('mode');
  if (record.algorithmVersion !== ALGORITHM_VERSION) changes.push('algorithm');
  return changes;
}

const CHANGE_WORDS: Readonly<Record<Exclude<LayoutChange, 'algorithm'>, string>> = {
  cutList: 'Cut list',
  profile: 'saw profile',
  mode: 'layout mode',
};

/** "Cut list changed since this layout was saved", "Cut list and saw profile changed…", "The optimizer has been updated…". */
export function changesText(changes: readonly LayoutChange[]): string {
  const words = changes.filter((c): c is Exclude<LayoutChange, 'algorithm'> => c !== 'algorithm').map((c) => CHANGE_WORDS[c]);
  const updated = changes.includes('algorithm');
  if (words.length === 0) return updated ? 'The optimizer has been updated since this layout was saved' : '';
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} and ${words.at(-1)!}`;
  const sentence = `${list.charAt(0).toUpperCase()}${list.slice(1)} changed since this layout was saved`;
  return updated ? `${sentence}, and the optimizer has been updated` : sentence;
}

/** The job's layouts as records to keep: every material that was laid out. */
export function layoutRecords(layout: JobLayout, inputKeys: Readonly<Record<string, string>>, createdAt: string): SavedLayoutRecord[] {
  return layout.materials.flatMap((m) => {
    const inputHash = inputKeys[m.material.id];
    if (inputHash === undefined) return [];
    return [
      {
        materialId: m.material.id,
        inputHash,
        algorithmVersion: layout.algorithmVersion,
        mode: layout.mode,
        profile: { ...layout.profile },
        layout: m,
        createdAt,
      },
    ];
  });
}

/** `records` in place of the job's saved layouts for the same materials; the others are kept. */
export function withLayouts(saved: readonly SavedLayoutRecord[] | undefined, records: readonly SavedLayoutRecord[]): SavedLayoutRecord[] {
  const replaced = new Set(records.map((r) => r.materialId));
  return [...(saved ?? []).filter((r) => !replaced.has(r.materialId)), ...records];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Just enough of a material layout to draw it; anything else is the optimizer's own business. */
function readableLayout(raw: unknown): raw is MaterialLayout {
  if (!isObject(raw) || !isObject(raw.material) || typeof raw.material.id !== 'string') return false;
  if (!Number.isSafeInteger(raw.sheetLength) || !Number.isSafeInteger(raw.sheetWidth)) return false;
  if (!Array.isArray(raw.patterns) || !Array.isArray(raw.pieces) || !Array.isArray(raw.unplaced) || !isObject(raw.stats)) return false;
  return raw.patterns.every(
    (p) => isObject(p) && Number.isSafeInteger(p.count) && Array.isArray(p.placements) && Array.isArray(p.cuts) && Array.isArray(p.offcuts) && isObject(p.cutTree),
  );
}

/**
 * A job's saved layouts as stored (database or .kerfjob file). Missing:
 * none. Throws when there are some but they can't be read.
 */
export function parseSavedLayouts(raw: unknown): SavedLayoutRecord[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('its sheet layouts are unreadable');
  const seen = new Set<string>();
  return raw.map((r: unknown) => {
    if (!isObject(r)) throw new Error('a sheet layout is unreadable');
    const { materialId, inputHash, algorithmVersion, mode, profile, layout, createdAt } = r;
    const saw = parseSawProfile(profile);
    if (
      typeof materialId !== 'string' ||
      materialId.trim() === '' ||
      typeof inputHash !== 'string' ||
      !Number.isSafeInteger(algorithmVersion) ||
      (algorithmVersion as number) < 0 ||
      !LAYOUT_MODES.includes(mode as LayoutMode) ||
      saw === null ||
      typeof createdAt !== 'string' ||
      !readableLayout(layout) ||
      layout.material.id !== materialId
    ) {
      throw new Error('a sheet layout is unreadable');
    }
    if (seen.has(materialId)) throw new Error('a material has two sheet layouts');
    seen.add(materialId);
    return { materialId, inputHash, algorithmVersion: algorithmVersion as number, mode: mode as LayoutMode, profile: saw, layout, createdAt };
  });
}

/** The job's saved layout for a material. */
export function savedLayout(job: Pick<JobRecord, 'layouts'>, materialId: string): SavedLayoutRecord | undefined {
  return job.layouts?.find((r) => r.materialId === materialId);
}
