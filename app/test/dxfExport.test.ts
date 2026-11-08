import { DEFAULT_RULES, DEFAULT_SAW_PROFILES, buildCutList, inches, layoutJob } from '@kerfuffle/engine';
import type { CabinetSpec } from '@kerfuffle/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dxfFiles, staleNote } from '../src/cutlist/dxf';
import { dxfFileName, dxfFolderName, dxfJobPart } from '../src/cutlist/format';
import { BUILT_IN_ESTIMATE, defaultJobMaterials, engineMaterials, STANDARD_MATERIALS } from '../src/data/materials';

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: (command: string, args?: unknown) => invoke(command, args) }));
const { saveFolder } = await import('../src/platform/export');

const CABINETS: CabinetSpec[] = [
  { id: 'B1', type: 'base', width: inches(30), height: inches(36), depth: inches(24), shelfCount: 1, finishedEnds: 'left', quantity: 1 },
  { id: 'W1', type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2, finishedEnds: 'both', quantity: 1 },
];

describe('DXF files', () => {
  beforeEach(() => invoke.mockReset());

  it('names the job, the material and the pattern, safe for Windows', () => {
    expect(dxfFolderName('Smith: kitchen?')).toBe('Smith- kitchen- – DXF');
    expect(dxfFileName('Kitchen', 'Birch plywood 3/4″', 2)).toBe('Kitchen – Birch plywood 3-4″ – pattern 2.dxf');
    // The job part handed to the desktop app is exactly how each name starts.
    expect(dxfFileName('Smith: kitchen?', 'Birch', 1).startsWith(`${dxfJobPart('Smith: kitchen?')} – `)).toBe(true);
    expect(dxfJobPart('  ')).toBe('Job');
  });

  it('makes one file per pattern of every material, from the layout as given', () => {
    const materials = engineMaterials(defaultJobMaterials(STANDARD_MATERIALS, BUILT_IN_ESTIMATE, '2026-11-07T00:00:00Z'), STANDARD_MATERIALS);
    const list = buildCutList(CABINETS, DEFAULT_RULES, undefined, materials);
    const layout = layoutJob(list, materials, DEFAULT_SAW_PROFILES[0]!, { mode: 'cost', seed: 1, timeLimitMs: 10_000 });
    const files = dxfFiles('Kitchen', layout.materials, 'in');
    expect(files).toHaveLength(layout.materials.reduce((n, m) => n + m.patterns.length, 0));
    expect(new Set(files.map((f) => f.name)).size).toBe(files.length);
    for (const f of files) expect(f.contents).toMatch(/\$INSUNITS\r\n70\r\n1\r\n/);
    // Same name twice: still a file each.
    const twin = layout.materials.map((m) => ({ ...m, material: { ...m.material, name: 'Same' } }));
    const twins = dxfFiles('Kitchen', twin, 'in').map((f) => f.name);
    expect(new Set(twins).size).toBe(twins.length);
  });

  it('asks for a folder, writes the files there, and gives the first for Show in folder', async () => {
    invoke.mockImplementation((command: string) =>
      command === 'choose_export_folder'
        ? Promise.resolve(String.raw`C:\Users\me\Documents\KERFuffle\Kitchen – DXF`)
        : Promise.resolve({ paths: [String.raw`C:\x\a.dxf`, String.raw`C:\x\b.dxf`], removed: ['Kitchen – Birch – pattern 3.dxf'], notRemoved: [] }),
    );
    const start = vi.fn();
    const result = await saveFolder('Kitchen – DXF', [{ name: 'a.dxf', contents: 'A' }, { name: 'b.dxf', contents: 'B' }], start, 'Kitchen');
    expect(invoke).toHaveBeenNthCalledWith(1, 'choose_export_folder', { folderName: 'Kitchen – DXF' });
    expect(invoke.mock.calls[1]![0]).toBe('write_export_files');
    expect(invoke.mock.calls[1]![1]).toMatchObject({ staleDxfOf: 'Kitchen' });
    expect(start).toHaveBeenCalledOnce();
    expect(result).toEqual({
      count: 2,
      folder: 'Kitchen – DXF',
      path: String.raw`C:\x\a.dxf`,
      removed: ['Kitchen – Birch – pattern 3.dxf'],
      notRemoved: [],
    });
  });

  it('says what happened to the job’s DXFs from an earlier export', () => {
    expect(staleNote({ removed: [], notRemoved: [] })).toBe('');
    expect(staleNote({ removed: ['a.dxf'], notRemoved: [] })).toBe('. Removed 1 older DXF of this job.');
    expect(staleNote({ removed: ['a.dxf', 'b.dxf'], notRemoved: [] })).toBe('. Removed 2 older DXFs of this job.');
    expect(staleNote({ removed: ['a.dxf'], notRemoved: ['K – B – pattern 5.dxf'] })).toBe(
      '. “K – B – pattern 5.dxf” is from an earlier export and couldn’t be removed. Delete it before cutting.',
    );
  });

  it('does nothing when the folder dialog is cancelled, and passes on a plain-language error', async () => {
    invoke.mockResolvedValueOnce(null);
    expect(await saveFolder('Kitchen – DXF', [])).toBeNull();
    expect(invoke).toHaveBeenCalledOnce();
    invoke.mockResolvedValueOnce(String.raw`C:\x`).mockRejectedValueOnce({ kind: 'fileInUse', message: '“a.dxf” is open in another program.' });
    await expect(saveFolder('Kitchen – DXF', [{ name: 'a.dxf', contents: '' }])).rejects.toMatchObject({ kind: 'fileInUse' });
  });
});
