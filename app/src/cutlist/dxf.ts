import { layoutToDxf } from '@kerfuffle/engine';
import type { DxfUnits, MaterialLayout } from '@kerfuffle/engine';
import type { ExportFile, SavedFolder } from '../platform/export';
import { dxfFileName } from './format';

/** What the Export DXF… menu calls each unit. */
export const DXF_UNIT_NAMES: Readonly<Record<DxfUnits, string>> = { in: 'Inches', mm: 'Millimeters' };

/**
 * The DXF files for a job's sheet layouts: one per sheet pattern, per
 * material, written from the layouts as shown (and kept), never laid out again.
 */
export function dxfFiles(jobName: string, layouts: readonly MaterialLayout[], units: DxfUnits): ExportFile[] {
  const used = new Map<string, number>();
  return layouts.flatMap((m) => {
    // Two materials with the same name still get a file each.
    const seen = (used.get(m.material.name) ?? 0) + 1;
    used.set(m.material.name, seen);
    const name = seen === 1 ? m.material.name : `${m.material.name} (${seen})`;
    return m.patterns.map((pattern) => ({
      name: dxfFileName(jobName, name, pattern.id),
      contents: layoutToDxf(pattern, { units, sheetLength: m.sheetLength, sheetWidth: m.sheetWidth, pieces: m.pieces }),
    }));
  });
}

/** After "Saved 4 DXF files to …": what happened to the job's DXFs from an earlier export. */
export function staleNote({ removed, notRemoved }: Pick<SavedFolder, 'removed' | 'notRemoved'>): string {
  if (notRemoved.length > 0) {
    const names = notRemoved.map((n) => `“${n}”`).join(', ');
    const one = notRemoved.length === 1;
    return `. ${names} ${one ? 'is' : 'are'} from an earlier export and couldn’t be removed. Delete ${one ? 'it' : 'them'} before cutting.`;
  }
  if (removed.length > 0) return `. Removed ${removed.length === 1 ? '1 older DXF' : `${removed.length} older DXFs`} of this job.`;
  return '';
}
