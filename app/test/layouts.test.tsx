import { ALGORITHM_VERSION, DEFAULT_RULES, inches, layoutInput, materialInputKeys, upgradeVersion1Rules } from '@kerfuffle/engine';
import type { LayoutInput, MaterialLayout, SheetPattern } from '@kerfuffle/engine';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { cutSequence, layoutPages, SMALL_PATTERN_STEPS, stripOfCuts } from '../src/cutlist/layoutText';
import { canonicalJson, readJobFile, writeJobFile } from '../src/data/jobFile';
import { cabinetSpec } from '../src/data/jobSession';
import { changesText, layoutChanges, layoutRecords, parseSavedLayouts } from '../src/data/layouts';
import { BUILT_IN_ESTIMATE, defaultJobMaterials, engineMaterials, STANDARD_MATERIALS } from '../src/data/materials';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { BUILT_IN_SAW } from '../src/data/sawProfiles';
import { changeJobStatus, jobSession } from '../src/data/storage';
import type { CabinetRecord, JobRecord } from '../src/data/types';
import { layoutInputOf } from '../src/layout/jobInput';
import { setLayoutWorkers } from '../src/layout/runner';
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

const TABLE = BUILT_IN_SAW.profiles[0]!;
const toastText = () => document.querySelector('.toast')?.textContent ?? '';
let db: MemoryStorageClient;

beforeEach(async () => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  window.localStorage.clear();
  db = await useTestDatabase([testJob({ cabinets: SAMPLE })]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openLayouts() {
  window.location.hash = '#/jobs/j-0014/cut-list';
  const user = userEvent.setup();
  const rendered = render(<App />);
  await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
  await user.click(screen.getByRole('button', { name: 'Layouts' }));
  return { user, ...rendered };
}

const layoutStatus = () => document.querySelector('[data-layout-status]')?.textContent ?? '';
/** The layout on screen has finished its search. */
const finished = () => waitFor(() => expect(layoutStatus()).not.toMatch(/Laying out|Searching/), { timeout: 15_000 });
/** And the other modes are laid out beside it. */
const compared = () =>
  waitFor(() => expect(screen.getByRole('table', { name: 'Measures in each mode' }).textContent).not.toContain('…'), { timeout: 20_000 });
const statsRow = (mode: string) => [...document.querySelectorAll(`tr[data-mode="${mode}"] td`)].map((td) => td.textContent);

describe('the Layouts tab', () => {
  it('draws one drawing per pattern with × N, marks, rips in cut order, grain and offcuts, and the measures in each mode', async () => {
    await openLayouts();
    await finished();
    const patterns = [...document.querySelectorAll<HTMLElement>('[data-pattern-id]')];
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(within(p).getByRole('heading', { level: 3 }).textContent).toMatch(/^Pattern \d+ × \d+$/);
      const drawing = within(p).getByRole('img');
      expect(drawing.getAttribute('aria-label')).toMatch(/^Sheet pattern \d+ of .+ cut (once|\d+ times): \d+ pieces?,/);
      // Rips dimensioned, numbered in cut order.
      const rips = [...drawing.querySelectorAll<SVGGElement>('[data-rip]')].map((g) => Number(g.dataset.rip));
      expect(rips).toEqual(rips.map((_, i) => i + 1));
    }
    // Pieces carry their cut-list marks; grained birch shows its grain as lines, offcuts are hatched.
    expect(document.querySelector('[data-pattern-id] g[data-mark="P1"]')).not.toBeNull();
    expect(document.querySelector('[data-pattern-id] path[data-grain]')).not.toBeNull();
    expect(document.querySelector('[data-offcut]')).not.toBeNull();

    await compared();
    for (const mode of ['cost', 'grain', 'time']) expect(statsRow(mode)).toHaveLength(5);
    expect(document.querySelector('tr[data-mode="cost"]')).toHaveAttribute('aria-current', 'true');
    // The patterns drawn are the ones counted.
    expect(Number(statsRow('cost')[3])).toBe(patterns.length);
  }, 30_000);

  it('switches mode, remembers it per job, and keeps the other modes’ numbers beside it', async () => {
    const { user } = await openLayouts();
    await finished();
    await user.click(within(screen.getByRole('group', { name: 'Layout mode' })).getByRole('button', { name: 'Time' }));
    expect(within(screen.getByRole('group', { name: 'Layout mode' })).getByRole('button', { name: 'Time' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(document.querySelector('tr[data-mode="time"]')).toHaveAttribute('aria-current', 'true'));
    expect(window.localStorage.getItem('kerfuffle.layouts.mode.j-0014')).toBe('time');
    await compared();
    // Time mode never uses more fence settings than Cost.
    expect(Number(statsRow('time')[2])).toBeLessThanOrEqual(Number(statsRow('cost')[2]));
  }, 30_000);

  it('shows the sensitivity notes once the background run finishes; they only suggest', async () => {
    await openLayouts();
    const notes = () => screen.getByRole('region', { name: /Sensitivity notes/ });
    await waitFor(() => expect(notes().textContent).not.toMatch(/Checking how close/), { timeout: 20_000 });
    const items = notes().querySelectorAll('li[data-note]');
    if (items.length > 0) expect(notes()).toHaveTextContent('Suggestions only. Nothing changes until you change it.');
    else expect(notes()).toHaveTextContent('No near misses');
    for (const link of within(notes()).queryAllByRole('link')) expect(link.getAttribute('href')).toMatch(/^#\/(settings|jobs\/j-0014\/workspace)$/);
    // Nothing was changed by looking.
    expect((await db.getJob('j-0014')).sawProfile).toBeNull();
  }, 30_000);

  it('traces a piece to its cut-list line and cabinet, by pointer and by keyboard', async () => {
    const { user } = await openLayouts();
    await finished();
    const piece = document.querySelector<SVGGElement>('[data-pattern-id] g[data-mark]')!;
    const mark = piece.dataset.mark!;
    await user.hover(piece);
    const trace = document.querySelector('[data-layout-trace]')!;
    expect(trace.textContent).toMatch(new RegExp(`^${mark}-\\d+ .+ · for (B|W)\\d`));
    // The rail sketches the line, as on the cut list.
    const rail = screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
    expect(within(rail).getAllByText(mark).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(`g[data-mark="${mark}"][data-hot]`).length).toBeGreaterThan(0);
    await user.unhover(piece);

    // The marks under each drawing are buttons: focus traces, Enter pins.
    const chip = within(document.querySelector<HTMLElement>('[data-pattern-id]')!).getAllByRole('button')[0]!;
    chip.focus();
    await waitFor(() => expect(document.querySelectorAll('g[data-hot]').length).toBeGreaterThan(0));
    await user.keyboard('{Enter}');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  }, 30_000);

  it('lists the pieces that didn’t fit, with the reason', async () => {
    db = await useTestDatabase([testJob({ cabinets: [testCabinet('c-t', 'T1', { height: inches(110) })] })]);
    await openLayouts();
    await finished();
    const missing = screen.getByRole('region', { name: 'Not on these sheets' });
    expect(missing.querySelector('[data-unplaced="too-big"]')?.textContent).toMatch(/bigger than a trimmed sheet/);
  }, 30_000);

  it('shows the best layout so far while it searches, and says so', async () => {
    quietLayouts();
    await openLayouts();
    expect(layoutStatus()).toBe('Laying out…');
    expect(screen.getByRole('button', { name: /Print layouts/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the layouts printout', () => {
  it('prints one or two patterns a page, each with its cut sequence, tick boxes and the saw, and keeps the layout', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = await openLayouts();
    await finished();
    const pages = [...document.querySelectorAll<HTMLElement>('[data-layout-page]')];
    expect(pages.length).toBeGreaterThan(0);
    const first = pages[0]!;
    expect(first).toHaveTextContent('KERFuffle · Sheet layouts');
    expect(first).toHaveTextContent('Table saw · kerf 1/8″ · trim 1/4″ each edge');
    expect(first).toHaveTextContent(`Sheet1 / ${pages.length}`);
    const steps = [...first.querySelectorAll('ol li')].map((li) => li.textContent);
    expect(steps[0]).toMatch(/^(Rip|Crosscut) \d+( \d+\/\d+)?( ×\d+)?$/);
    for (const section of first.querySelectorAll('section[aria-label^="Pattern"]')) {
      const times = Number(/× (\d+)/.exec(section.querySelector('h2')!.textContent)![1]);
      expect(section.querySelectorAll('[class*="tick"] > span[aria-hidden]')).toHaveLength(times);
    }
    expect((await db.getJob('j-0014')).layouts ?? []).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Print layouts…' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    await waitFor(async () => expect((await db.getJob('j-0014')).layouts?.length).toBeGreaterThan(0));
    const kept = (await db.getJob('j-0014')).layouts!;
    expect(kept.every((r) => r.algorithmVersion === ALGORITHM_VERSION && r.mode === 'cost' && r.profile.kerf === TABLE.kerf)).toBe(true);
    // Keeping a layout isn't an edit.
    expect((await db.getJob('j-0014')).revision).toBe(3);

    // Ctrl+P on this tab prints the layouts too.
    await user.keyboard('{Control>}p{/Control}');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
  }, 30_000);
});

describe('saved layouts', () => {
  it('are kept when the job is marked Ready to cut, shown on reopening after a restart, and fixed until Recalculate (with Undo)', async () => {
    const { user, unmount } = await openLayouts();
    await finished();
    act(() => changeJobStatus('j-0014', 'ready'));
    await waitFor(async () => expect((await db.getJob('j-0014')).layouts?.length).toBeGreaterThan(0), { timeout: 15_000 });
    const kept = (await db.getJob('j-0014')).layouts!;

    // Restart: a fresh session and fresh layout workers over the same database.
    unmount();
    await jobSession.close();
    setLayoutWorkers(null);
    cleanup();
    await openLayouts();
    await waitFor(() => expect(layoutStatus()).toMatch(/^Kept with the job \d{4}-\d{2}-\d{2} · Cost mode · Table saw/));
    expect(document.querySelectorAll('[data-pattern-id]')).toHaveLength(kept[0]!.layout.patterns.length);
    expect(document.querySelector('[data-layout-banner]')).toBeNull();

    // The cut list changes: the kept layout stays, and says so.
    act(() =>
      jobSession.commit((job) => ({ ...job, cabinets: job.cabinets.map((c) => (c.label === 'B2' ? { ...c, width: inches(36) } : c)) })),
    );
    const banner = await screen.findByText(/Cut list changed since this layout was saved/);
    expect(layoutStatus()).toMatch(/^Kept with the job/);
    // Enabled once the job as it is now has been laid out.
    const recalc = () => within(banner.closest('[data-layout-banner]')!).getByRole('button', { name: 'Recalculate' });
    await waitFor(() => expect(recalc()).not.toHaveAttribute('aria-disabled'), { timeout: 15_000 });
    await userEvent.setup().click(recalc());
    await waitFor(() => expect(toastText()).toContain('Layouts recalculated and kept with the job'));
    const recalculated = (await db.getJob('j-0014')).layouts!;
    expect(recalculated.find((r) => r.materialId === kept[0]!.materialId)!.inputHash).not.toBe(kept[0]!.inputHash);
    await waitFor(() => expect(document.querySelector('[data-layout-banner]')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.getJob('j-0014')).layouts).toEqual(kept));
    await screen.findByText(/Cut list changed since this layout was saved/);
  }, 60_000);

  it('a draft recalculates freely: a printed layout is used only while the job is unchanged', async () => {
    const input = sampleInput();
    const layout = layoutInput(input);
    const records = layoutRecords(layout, materialInputKeys(input), '2026-11-02T10:00:00.000Z');
    db = await useTestDatabase([testJob({ cabinets: SAMPLE, layouts: records })]);
    await openLayouts();
    await waitFor(() => expect(layoutStatus()).toMatch(/^Kept with the job 2026-11-02/));
    act(() => jobSession.commit((job) => ({ ...job, cabinets: job.cabinets.slice(1) })));
    await waitFor(() => expect(layoutStatus()).not.toMatch(/^Kept/));
    expect(document.querySelector('[data-layout-banner]')).toBeNull();
  }, 30_000);
});

describe('the Layouts tab from the keyboard', () => {
  it('reaches the tab, its toolbar and the marks from the keyboard, in visual order', async () => {
    const { user } = await openLayouts();
    await finished();
    const layoutsTab = screen.getByRole('button', { name: 'Layouts' });
    expect(layoutsTab).toHaveAttribute('aria-pressed', 'true');
    layoutsTab.focus();
    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      reached.push(el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName);
    }
    const at = (pattern: RegExp) => reached.findIndex((r) => pattern.test(r));
    expect(at(/^Cost$/)).toBeGreaterThanOrEqual(0);
    expect(at(/^Cost$/)).toBeLessThan(at(/^Grain$/));
    expect(at(/Print layouts/)).toBeGreaterThan(at(/^Time$/));
  }, 30_000);

});

// ---------------------------------------------------------------------------
// Pure parts
// ---------------------------------------------------------------------------

function sampleInput(mode: LayoutInput['options']['mode'] = 'cost'): LayoutInput {
  return layoutInputOf(
    {
      cabinets: SAMPLE.map(cabinetSpec),
      rules: upgradeVersion1Rules(DEFAULT_RULES),
      materials: engineMaterials(defaultJobMaterials(STANDARD_MATERIALS, BUILT_IN_ESTIMATE, '2026-11-02T00:00:00.000Z'), STANDARD_MATERIALS),
      profile: TABLE,
      includeFronts: true,
    },
    mode,
  );
}

describe('cut sequence and pages', () => {
  const layout = layoutInput(sampleInput());
  const birch = layout.materials[0]!;

  it('lists every cut once, in saw order, running repeats of one setting together', () => {
    for (const pattern of birch.patterns) {
      const steps = cutSequence(pattern);
      expect(steps.flatMap((s) => s.cuts)).toEqual(pattern.cuts.map((_, i) => i));
      expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
      for (const s of steps) {
        const cut = pattern.cuts[s.cuts[0]!]!;
        expect(s.text).toMatch(cut.depth === 1 ? /^(Rip|Crosscut) / : /^Strip \d+: (crosscut|rip|trim) /);
        if (s.cuts.length > 1) expect(s.text).toMatch(new RegExp(` ×${s.cuts.length}$`));
        for (const i of s.cuts) expect(pattern.cuts[i]!.setting).toBe(cut.setting);
      }
    }
  });

  it('puts every later cut in the strip it divides', () => {
    for (const pattern of birch.patterns) {
      const strips = stripOfCuts(pattern);
      pattern.cuts.forEach((cut, i) => expect(strips.get(i) === 0).toBe(cut.depth === 1));
    }
  });

  it('gives each pattern a page, or two small ones of one material a page together', () => {
    const fake = (steps: number): SheetPattern =>
      ({ cuts: Array.from({ length: steps }, (_, i) => ({ n: i + 1, stage: 'rip', depth: 1, along: 'x', at: i * 100, from: 0, to: 1, setting: 64 + i })), cutTree: { kind: 'split', axis: 'y', cuts: [], children: [] } }) as unknown as SheetPattern;
    const small = fake(3);
    const big = fake(SMALL_PATTERN_STEPS + 1);
    const m = (patterns: SheetPattern[], unplaced = 0) => ({ patterns, unplaced: Array.from({ length: unplaced }) }) as unknown as MaterialLayout;
    expect(layoutPages([m([small, small, small]), m([big, small]), m([], 1)])).toEqual([
      { material: 0, patterns: [0, 1], lastOfMaterial: false },
      { material: 0, patterns: [2], lastOfMaterial: true },
      { material: 1, patterns: [0], lastOfMaterial: false },
      { material: 1, patterns: [1], lastOfMaterial: true },
      { material: 2, patterns: [], lastOfMaterial: true },
    ]);
  });
});

describe('saved layout records', () => {
  const input = sampleInput();
  const layout = layoutInput(input);
  const keys = materialInputKeys(input);
  const records = layoutRecords(layout, keys, '2026-11-02T10:00:00.000Z');

  it('keep what each was made from, and say what changed', () => {
    const r = records[0]!;
    expect(r).toMatchObject({ materialId: layout.materials[0]!.material.id, inputHash: keys[r.materialId], algorithmVersion: ALGORITHM_VERSION, mode: 'cost' });
    expect(layoutChanges(r, { inputKeys: keys, profile: TABLE, mode: 'cost' })).toEqual([]);
    const otherKeys = materialInputKeys({ ...input, cabinets: input.cabinets.slice(1) });
    expect(layoutChanges(r, { inputKeys: otherKeys, profile: { ...TABLE, kerf: inches(5 / 32) }, mode: 'grain' })).toEqual(['cutList', 'profile', 'mode']);
    expect(layoutChanges({ ...r, algorithmVersion: ALGORITHM_VERSION - 1 }, { inputKeys: keys, profile: TABLE, mode: 'cost' })).toEqual(['algorithm']);
    // A price or a name doesn't change what's cut.
    const priced = Object.fromEntries(Object.entries(input.materials).map(([slot, m]) => [slot, { ...m, price: 9999 }]));
    expect(materialInputKeys({ ...input, materials: priced })).toEqual(keys);
  });

  it('say it in plain words', () => {
    expect(changesText(['cutList'])).toBe('Cut list changed since this layout was saved');
    expect(changesText(['cutList', 'profile'])).toBe('Cut list and saw profile changed since this layout was saved');
    expect(changesText(['algorithm'])).toBe('The optimizer has been updated since this layout was saved');
    expect(changesText(['mode', 'algorithm'])).toBe('Layout mode changed since this layout was saved, and the optimizer has been updated');
  });

  it('read back as written, and refuse what can’t be drawn', () => {
    expect(parseSavedLayouts(JSON.parse(JSON.stringify(records)))).toEqual(records);
    expect(parseSavedLayouts(undefined)).toEqual([]);
    expect(() => parseSavedLayouts([{ ...records[0], mode: 'fastest' }])).toThrow();
    expect(() => parseSavedLayouts([{ ...records[0], layout: { ...records[0]!.layout, patterns: null } }])).toThrow();
    expect(() => parseSavedLayouts([records[0], records[0]])).toThrow();
  });

  it('travel in .kerfjob files, and files without them read back exactly', async () => {
    const header = { appVersion: '0.1.0', exportedAt: '2026-11-02T10:00:00.000Z' };
    const job: JobRecord = testJob({ cabinets: SAMPLE, status: 'ready', layouts: records });
    const text = await writeJobFile(job, header);
    const reading = await readJobFile(text);
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job.layouts).toEqual(records);
    // Imported into another database, they come along.
    const pcB = await useTestDatabase([]);
    const imported = await pcB.importJob(reading.job, 'new');
    expect(imported.layouts).toEqual(records);

    const without = await readJobFile(await writeJobFile(testJob(), header));
    if (!without.ok) throw new Error(without.message);
    expect(without.job).not.toHaveProperty('layouts');
    expect(canonicalJson(JSON.parse(await writeJobFile(testJob(), header)))).not.toContain('"layouts"');
  });
});
