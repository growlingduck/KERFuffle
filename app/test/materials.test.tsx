import { buildCutList, DEFAULT_RULES, estimate, inches, upgradeVersion1Rules } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { ESTIMATE_CSV_COLUMNS, estimateCsv } from '../src/cutlist/estimate';
import { cabinetSpec } from '../src/data/jobSession';
import { BUILT_IN_ESTIMATE, defaultJobMaterials, engineMaterials, snapshotMaterial, STANDARD_MATERIALS } from '../src/data/materials';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { createJob } from '../src/data/storage';
import type { CabinetRecord, JobMaterialsRecord, JobRecord, MaterialRecord } from '../src/data/types';
import { loadMaterials } from '../src/state/materials';
import { dismissToast, toastStore } from '../src/state/toast';
import { quietLayouts, testCabinet, testJob, useTestDatabase } from './storage';

/** The five-cabinet sample job (engine/fixtures/cutlist/sample-job.json). */
const SAMPLE: CabinetRecord[] = [
  testCabinet('c-b1', 'B1', { width: inches(30), height: inches(36), finishedEnds: 'left' }),
  testCabinet('c-b2', 'B2', { width: inches(42), height: inches(36) }),
  testCabinet('c-b3', 'B3', { width: inches(18), height: inches(36), finishedEnds: 'right', quantity: 2 }),
  testCabinet('c-w1', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2, finishedEnds: 'both' }),
  testCabinet('c-w2', 'W2', { type: 'wall', width: inches(15), height: inches(30), depth: inches(12.25), shelfCount: 2, finishedEnds: 'right' }),
];

const std = (id: string) => STANDARD_MATERIALS.find((m) => m.id === id)!;
const toastText = () => document.querySelector('.toast')?.textContent ?? '';

let db: MemoryStorageClient;

beforeEach(async () => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  window.localStorage.clear();
  db = await useTestDatabase([testJob({ cabinets: SAMPLE })]);
});

/** Give the sample job's default materials the prices used in engine/test/estimate.test.ts. */
async function priceTheDefaults() {
  const prices: [string, number, number | null][] = [
    ['std-birch-3-4', 6800, 2],
    ['std-plywood-1', 9500, null],
    ['std-hpl-48x96', 12000, null],
    ['std-pvc-banding-15-16', 25, null],
  ];
  for (const [id, price, onHand] of prices) await db.saveMaterial({ ...std(id), price, onHand });
  await loadMaterials();
}

async function openCutList(view: 'cutlist' | 'estimate' = 'cutlist') {
  window.location.hash = '#/jobs/j-0014/cut-list';
  const user = userEvent.setup();
  const rendered = render(<App />);
  await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
  if (view === 'estimate') await user.click(screen.getByRole('button', { name: 'Estimate' }));
  return { user, ...rendered };
}

async function openSettings() {
  window.location.hash = '#/settings';
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Materials' });
  return user;
}

const materialRows = () => [...document.querySelectorAll<HTMLElement>('tr[data-material]')];
const materialRow = (name: string) => materialRows().find((tr) => tr.querySelector('td')?.textContent?.startsWith(name))!;

describe('Settings → Materials', () => {
  it('starts with the standard materials, none priced, and filters by kind', async () => {
    const user = await openSettings();
    expect(materialRows()).toHaveLength(12);
    expect(screen.getAllByText('needs a price')).toHaveLength(12);
    expect(materialRow('Melamine, white 3/4″')).toHaveTextContent('49 × 97');
    expect(materialRow('Melamine, white 3/4″')).toHaveTextContent('None');
    expect(materialRow('Birch plywood 3/4″')).toHaveTextContent('Along length');

    await user.click(screen.getByRole('button', { name: 'Laminate (2)' }));
    expect(materialRows().map((tr) => tr.querySelector('td')?.textContent)).toEqual(['HPL laminate 48 × 96Laminate', 'HPL laminate 60 × 144Laminate']);
    await user.click(screen.getByRole('button', { name: 'Hardware (2)' }));
    expect(materialRows()).toHaveLength(2);
  });

  it('asks only for the fields each kind needs, and adds one of each', { timeout: 20_000 }, async () => {
    const user = await openSettings();
    const add = async (kind: string) => {
      await user.click(screen.getByRole('button', { name: 'Add material' }));
      const dialog = screen.getByRole('dialog', { name: 'Add material' });
      await user.click(within(dialog).getByRole('button', { name: kind }));
      return dialog;
    };
    const labels = (dialog: HTMLElement) =>
      [...dialog.querySelectorAll('label, legend')].map((el) => el.textContent?.replace(/\s*\(.*\)$/, '').trim()).filter(Boolean);
    const save = async (dialog: HTMLElement, name: string, price: string) => {
      await user.type(within(dialog).getByLabelText('Name'), name);
      await user.type(within(dialog).getByLabelText(/^Price/), price);
      await user.click(within(dialog).getByRole('button', { name: 'Add material' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      return (await db.listMaterials()).find((m) => m.name === name)!;
    };

    let dialog = await add('Sheet goods');
    expect(labels(dialog)).toEqual(expect.arrayContaining(['Thickness', 'Sheet length', 'Sheet width', 'Grain', 'Price per sheet', 'Sheets on hand', 'Supplier', 'SKU']));
    expect(labels(dialog)).not.toContain('Sold');
    await user.clear(within(dialog).getByLabelText(/^Thickness/));
    await user.type(within(dialog).getByLabelText(/^Thickness/), '23/32');
    await user.clear(within(dialog).getByLabelText(/^Sheet width/));
    await user.type(within(dialog).getByLabelText(/^Sheet width/), '49');
    await user.clear(within(dialog).getByLabelText(/^Sheet length/));
    await user.type(within(dialog).getByLabelText(/^Sheet length/), '97');
    let saved = await save(dialog, 'Baltic birch 23/32″', '89.50');
    expect(saved).toMatchObject({ kind: 'sheet', thickness: inches(23 / 32), length: inches(97), width: inches(49), grain: 'length', price: 8950, bandingWidth: null, unit: null });

    dialog = await add('Laminate');
    expect(labels(dialog)).toContain('Grain or pattern direction');
    expect(labels(dialog)).not.toContain('Thickness');
    saved = await save(dialog, 'Wilsonart 4×8', '120');
    expect(saved).toMatchObject({ kind: 'laminate', thickness: null, length: inches(96), width: inches(48), price: 12000 });

    dialog = await add('Edge banding');
    expect(labels(dialog)).toEqual(expect.arrayContaining(['Width', 'Sold', 'Price per foot']));
    expect(labels(dialog)).not.toContain('Thickness');
    await user.click(within(dialog).getByLabelText('By the roll'));
    await user.type(within(dialog).getByLabelText('Roll length (ft)'), '250');
    saved = await save(dialog, 'Maple veneer tape', '42');
    expect(saved).toMatchObject({ kind: 'banding', bandingWidth: inches(15 / 16), rollFeet: 250, price: 4200, length: null });

    dialog = await add('Hardware');
    expect(labels(dialog)).toContain('Counted as');
    expect(labels(dialog)).not.toContain('Thickness');
    expect(labels(dialog)).not.toContain('Width');
    saved = await save(dialog, 'Leg, 6″ heavy', '1.75');
    expect(saved).toMatchObject({ kind: 'hardware', unit: 'each', price: 175, thickness: null, length: null });
    expect(materialRows()).toHaveLength(16);
  });

  it('won’t add a material without a name or with a price it can’t read', async () => {
    const user = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Add material' }));
    const dialog = screen.getByRole('dialog', { name: 'Add material' });
    await user.type(within(dialog).getByLabelText(/^Price/), 'about ten');
    await user.click(within(dialog).getByRole('button', { name: 'Add material' }));
    expect(within(dialog).getByText('⚠ Give the material a name')).toBeInTheDocument();
    expect(within(dialog).getByText('⚠ Type a price like 68.00')).toBeInTheDocument();
    expect(await db.listMaterials()).toHaveLength(12);
  });

  it('duplicates, edits and archives; a material a job uses can’t be deleted', async () => {
    const materials: JobMaterialsRecord = { slots: { box: snapshotMaterial(std('std-birch-3-4'), '2026-11-02T08:00:00.000Z') } };
    db = await useTestDatabase([testJob({ cabinets: SAMPLE, materials })]);
    const user = await openSettings();

    await user.click(screen.getByRole('button', { name: 'Delete Birch plywood 3/4″' }));
    await waitFor(() => expect(toastText()).toContain('This material is used by Kitchen remodel, so it can\'t be deleted. Archive it instead.'));
    expect(materialRows()).toHaveLength(12);

    await user.click(screen.getByRole('button', { name: 'Delete MDF 3/4″' }));
    await waitFor(() => expect(materialRows()).toHaveLength(11));
    expect(toastText()).toContain('Deleted MDF 3/4″');

    await user.click(screen.getByRole('button', { name: 'Duplicate Birch plywood 3/4″' }));
    const dialog = screen.getByRole('dialog', { name: 'Add material' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Birch plywood 3/4″ (copy)');
    await user.clear(within(dialog).getByLabelText(/^Supplier/));
    await user.type(within(dialog).getByLabelText(/^Supplier/), 'Other yard');
    await user.click(within(dialog).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(materialRows()).toHaveLength(12));
    expect(materialRow('Birch plywood 3/4″ (copy)')).toHaveTextContent('Other yard');

    await user.click(screen.getByRole('button', { name: 'Edit Birch plywood 3/4″' }));
    const edit = screen.getByRole('dialog', { name: 'Edit material' });
    expect(within(edit).queryByRole('button', { name: 'Laminate' })).not.toBeInTheDocument();
    await user.type(within(edit).getByLabelText(/^Price/), '68');
    await user.click(within(edit).getByRole('button', { name: 'Save material' }));
    await waitFor(() => expect(materialRow('Birch plywood 3/4″')).toHaveTextContent('$68.00'));
    // The job keeps its own copy: editing the catalog changes no job.
    expect((await db.getJob('j-0014')).materials?.slots.box?.price).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Archive Melamine, white 3/4″' }));
    await waitFor(() => expect(materialRows()).toHaveLength(11));
    await user.click(screen.getByRole('switch', { name: /Show archived/ }));
    expect(materialRow('Melamine, white 3/4″')).toHaveTextContent('Archived');
  });

  it('saves waste, trim and the default material per slot with the other settings', async () => {
    const user = await openSettings();
    await user.selectOptions(screen.getByRole('combobox', { name: /^Laminate/ }), 'std-hpl-60x144');
    await user.click(screen.getByRole('button', { name: 'More waste allowance' }));
    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    expect(bar).toHaveTextContent('2 unsaved changes');
    await user.click(within(bar).getByRole('button', { name: 'Save defaults' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument());
    const { other } = await db.getShopSettings();
    expect(other.estimate).toMatchObject({ wastePercent: 16, edgeTrim: inches(1 / 4), defaults: { laminate: 'std-hpl-60x144', box: 'std-birch-3-4' } });
  });
});

describe('new jobs', () => {
  it('copy the shop’s default materials, with their prices as they are now', async () => {
    await priceTheDefaults();
    const created = await createJob({ name: 'Vanity' });
    const job = await db.getJob(created.id);
    expect(job.materials?.slots.box).toMatchObject({ id: 'std-birch-3-4', price: 6800 });
    expect(job.materials?.slots.laminate?.id).toBe('std-hpl-48x96');
    expect(job.materials?.slots['leveling-leg']?.id).toBe('std-leveling-leg');
    // On hand is the shop's stock, never copied into the job.
    expect(job.materials?.slots.box).not.toHaveProperty('onHand');
  });
});

describe('cut list: materials and the estimate', () => {
  it('opens a job from before materials with the default materials; only the group titles change', async () => {
    await openCutList();
    const titles = [...document.querySelectorAll('[data-sheet] section[data-group] h2')].map((h) => h.textContent);
    expect(titles).toEqual(['Birch plywood 3/4″ · 3/4″ thick', 'Plywood 1″ (shelves) · 1″ thick', 'HPL laminate 48 × 96 · 1″ oversize each edge']);
    const rail = screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
    expect(within(rail).getByLabelText(/^Box/)).toHaveValue('std-birch-3-4');
    expect(within(rail).getByLabelText(/^Wide shelves/)).toHaveValue('std-plywood-1');
    expect(within(rail).getByText(/uses the shop’s default materials/)).toBeInTheDocument();
    // Nothing is saved just by looking.
    expect((await db.getJob('j-0014')).materials).toBeNull();
  });

  it('says the total is incomplete while materials need a price', async () => {
    quietLayouts();
    await openCutList('estimate');
    const total = document.querySelector('[data-estimate-total]');
    expect(total).toHaveTextContent('Incomplete: 4 materials need a price');
    expect(document.querySelector('[data-estimate-line="std-birch-3-4"]')).toHaveTextContent('≈ 7 sheets');
    expect(screen.getAllByText(/area \+ 15% waste/).length).toBeGreaterThan(0);
  });

  it('estimates the sample job as worked out by hand from area, before it is laid out: $812.50', async () => {
    quietLayouts();
    await priceTheDefaults();
    await openCutList('estimate');
    const line = (id: string) => [...document.querySelector(`[data-estimate-line="${id}"]`)!.querySelectorAll('td')].map((td) => td.textContent);
    expect(line('std-birch-3-4')).toEqual([
      'Birch plywood 3/4″Box, back, shelves',
      '≈ 7 sheets24,356 sq in · area + 15% waste',
      '2 sheets',
      '5 sheets',
      '$68.00per sheet',
      '$340.00',
    ]);
    expect(line('std-pvc-banding-15-16')).toEqual(['PVC edge banding 15/16″Edge banding', '70 ft836″ of edges', '—', '70 ft', '$0.25per foot', '$17.50']);
    expect(document.querySelector('[data-estimate-total]')).toHaveTextContent('$812.50');
  });

  it('counts sheets from the layout once the job is laid out, and on hand and to buy as before', async () => {
    await priceTheDefaults();
    await openCutList('estimate');
    const line = (id: string) => [...document.querySelector(`[data-estimate-line="${id}"]`)!.querySelectorAll('td')].map((td) => td.textContent);
    await waitFor(() => expect(line('std-birch-3-4')[1]).toBe('6 sheetsfrom layout'), { timeout: 15_000 });
    expect(line('std-birch-3-4')).toEqual(['Birch plywood 3/4″Box, back, shelves', '6 sheetsfrom layout', '2 sheets', '4 sheets', '$68.00per sheet', '$272.00']);
    // Banding and hardware are counted as before.
    expect(line('std-pvc-banding-15-16')).toEqual(['PVC edge banding 15/16″Edge banding', '70 ft836″ of edges', '—', '70 ft', '$0.25per foot', '$17.50']);
    expect(screen.getAllByText(/sheets from layout/).length).toBeGreaterThan(0);
  }, 20_000);

  it('changes a slot’s material from the cut list, regrouping it, with Undo', async () => {
    const { user } = await openCutList();
    const rail = screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
    await user.selectOptions(within(rail).getByLabelText(/^Back/), 'std-maple-prefinished-3-4');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Maple plywood, prefinished 3/4″ · 3/4″ thick' })).toBeInTheDocument());
    expect(toastText()).toContain('Back: Maple plywood, prefinished 3/4″');
    await waitFor(async () => expect((await db.getJob('j-0014')).materials?.slots.back?.id).toBe('std-maple-prefinished-3-4'));
    // The rest of the job's defaults are kept with it.
    expect((await db.getJob('j-0014')).materials?.slots.box?.id).toBe('std-birch-3-4');

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Maple plywood, prefinished 3/4″ · 3/4″ thick' })).not.toBeInTheDocument());
  });

  it('keeps the job’s prices until Update prices, never silently', async () => {
    const old = { ...snapshotMaterial(std('std-birch-3-4'), '2026-10-01T12:00:00.000Z'), price: 6000 };
    const materials: JobMaterialsRecord = {
      slots: { ...defaultJobMaterials(STANDARD_MATERIALS, BUILT_IN_ESTIMATE, '2026-10-01T12:00:00.000Z').slots, box: old, back: old, shelves: old },
    };
    db = await useTestDatabase([testJob({ cabinets: SAMPLE, materials })]);
    await db.saveMaterial({ ...std('std-birch-3-4'), price: 6800 });
    await loadMaterials();
    const { user } = await openCutList('estimate');
    expect(document.querySelector('[data-estimate-line="std-birch-3-4"]')).toHaveTextContent('$60.00per sheet');
    expect(screen.getByText(/1 catalog price has changed/)).toBeInTheDocument();
    expect(document.querySelector('[data-sheet]')).toHaveTextContent('prices as of 2026-10-01');

    await user.click(screen.getByRole('button', { name: 'Update prices' }));
    await waitFor(() => expect(document.querySelector('[data-estimate-line="std-birch-3-4"]')).toHaveTextContent('$68.00per sheet'));
    expect(toastText()).toContain('Updated 1 price from the catalog');
    await waitFor(async () => expect((await db.getJob('j-0014')).materials?.slots.box?.price).toBe(6800));
    expect(screen.getByRole('button', { name: 'Update prices' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('warns when a material’s thickness doesn’t match the rules, as the shelf warning does', async () => {
    db = await useTestDatabase([testJob({ cabinets: SAMPLE, rules: upgradeVersion1Rules({ ...DEFAULT_RULES, panelThickness: inches(23 / 32) }) })]);
    await openCutList();
    const notes = screen.getAllByRole('note').map((n) => n.textContent);
    expect(notes).toContain(
      '△ Warning: Box: Birch plywood 3/4″ is 3/4″ thick, but these parts are 23/32″ (the panel thickness rule). Choose a 23/32″ material, or change the rule.',
    );
  });

  it('prints the estimate on one sheet with the cut list’s title block', async () => {
    await openCutList('estimate');
    const sheets = document.querySelectorAll('[data-sheet]');
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0] as HTMLElement;
    expect(sheet).toHaveTextContent('KERFuffle · Estimate');
    expect(within(sheet).getByText('Job no.')).toBeInTheDocument();
    expect(within(sheet).getByText('Prices as of')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Hinges, slides, pulls, screws and glue are not included.');
  });

  it('has no serious or critical accessibility violations in the estimate view', { timeout: 20_000 }, async () => {
    const { container } = await openCutList('estimate');
    await act(async () => {});
    const results = await axe.run(container, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } });
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' ')}`)).toEqual([]);
  });
});

describe('estimate CSV', () => {
  it('is in the cut-list CSV’s format: BOM, a comment row, a header, then a total', () => {
    const priced: MaterialRecord[] = STANDARD_MATERIALS.map((m) => (m.id === 'std-birch-3-4' ? { ...m, price: 6800 } : m));
    const job: JobRecord = testJob({ cabinets: SAMPLE });
    const materials = engineMaterials(defaultJobMaterials(priced, BUILT_IN_ESTIMATE, '2026-11-02T08:00:00.000Z'), priced);
    const list = buildCutList(job.cabinets.map(cabinetSpec), job.rules, undefined, materials);
    const csv = estimateCsv(estimate(list, materials, BUILT_IN_ESTIMATE), list, {
      jobName: 'Kitchen, "big" job',
      jobNumber: 'J-0014',
      date: '2026-11-02',
      revision: 3,
      pricesAsOf: '2026-11-02',
    });
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = csv.slice(1).split('\r\n');
    expect(rows[0]).toBe('"# KERFuffle estimate: Kitchen, ""big"" job · J-0014 · Rev. 3 · printed 2026-11-02 · prices as of 2026-11-02 · sheets ≈ area + 15% waste"');
    expect(rows[1]).toBe(ESTIMATE_CSV_COLUMNS.join(','));
    expect(rows[2]).toBe('Birch plywood 3/4″,sheet goods,"Box, back, shelves",7,sheet,area (approximate),,7,68.00,476.00');
    expect(rows.at(-2)).toBe('Total,,,,,,,,,Incomplete: 3 materials need a price');
    expect(rows.at(-1)).toBe('');
  });
});
