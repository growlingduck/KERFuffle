import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inches, parseDimension, type CabinetSpec, type JobMaterials, type Material, type Ticks } from '../../src/index';

function size(text: string): Ticks {
  const parsed = parseDimension(text);
  if (!parsed.ok) throw new Error(`Bad size in fixture: ${text}`);
  return parsed.value;
}

/** A cut-list fixture's cabinets (fixtures/cutlist/*.json). */
export function loadJob(file: string): CabinetSpec[] {
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'cutlist', file), 'utf8')) as {
    cabinets: (Omit<CabinetSpec, 'width' | 'height' | 'depth'> & { width: string; height: string; depth: string })[];
  };
  return raw.cabinets.map((c) => ({ ...c, width: size(c.width), height: size(c.height), depth: size(c.depth) }));
}

const blank = { thickness: null, length: null, width: null, grain: 'none', bandingWidth: null, rollFeet: null, unit: null, price: null, onHand: null } as const;

export function sheet(id: string, name: string, t: number | null, l: number, w: number, extra: Partial<Material> = {}): Material {
  return { ...blank, id, kind: 'sheet', name, thickness: t === null ? null : inches(t), length: inches(l), width: inches(w), grain: 'length', ...extra };
}

/** The shop's standard materials (app/src-tauri/src/db/standard_materials.json), as the built-in defaults assign them. */
export const BIRCH_34 = sheet('std-birch-3-4', 'Birch plywood 3/4″', 3 / 4, 96, 48);
export const BIRCH_14 = sheet('std-birch-1-4', 'Birch plywood 1/4″', 1 / 4, 96, 48);
export const PLY_1 = sheet('std-plywood-1', 'Plywood 1″ (shelves)', 1, 96, 48);
export const MELAMINE = sheet('std-melamine-white-3-4', 'Melamine, white 3/4″', 3 / 4, 97, 49, { grain: 'none' });
export const HPL: Material = { ...blank, id: 'std-hpl-48x96', kind: 'laminate', name: 'HPL laminate 48 × 96', length: inches(96), width: inches(48), grain: 'length' };

export const DEFAULT_JOB_MATERIALS: JobMaterials = {
  box: BIRCH_34,
  back: BIRCH_34,
  shelves: BIRCH_34,
  'wide-shelves': PLY_1,
  base: BIRCH_34,
  'kick-face': BIRCH_14,
  laminate: HPL,
};
