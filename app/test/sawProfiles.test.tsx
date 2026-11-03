import { ALGORITHM_VERSION, DEFAULT_RULES, DEFAULT_SAW_PROFILES, inches, layoutInput, upgradeVersion1Rules } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput, Sensitivity } from '@kerfuffle/engine';
import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { cabinetSpec } from '../src/data/jobSession';
import { engineMaterials, defaultJobMaterials, BUILT_IN_ESTIMATE, STANDARD_MATERIALS } from '../src/data/materials';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { BUILT_IN_SAW, jobSawProfile, parseSawSettings, sawSettingValue } from '../src/data/sawProfiles';
import { createJob } from '../src/data/storage';
import { handleRequest } from '../src/layout/protocol';
import type { LayoutAnswer, LayoutRequest } from '../src/layout/protocol';
import { createLayoutRunner } from '../src/layout/runner';
import { useJobLayout } from '../src/layout/useJobLayout';
import type { WorkerLike } from '../src/layout/runner';
import { canSave, changedSettings, createDraft, draftReducer, sawField } from '../src/screens/settings/draft';
import type { DraftAction, SettingsValues } from '../src/screens/settings/draft';
import { sawProfilesStore } from '../src/state/sawProfiles';
import { dismissToast, toastStore } from '../src/state/toast';
import { testCabinet, testJob, useTestDatabase } from './storage';

const TABLE = DEFAULT_SAW_PROFILES[0]!;
const PANEL = DEFAULT_SAW_PROFILES[1]!;
const toastText = () => document.querySelector('.toast')?.textContent ?? '';

let db: MemoryStorageClient;

beforeEach(async () => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  window.localStorage.clear();
  db = await useTestDatabase([testJob({ cabinets: [testCabinet('c-b1', 'B1'), testCabinet('c-w1', 'W1', { type: 'wall', height: inches(30), depth: inches(12) })] })]);
});

describe('saw profiles: the setting', () => {
  it('starts with a table saw and a panel saw: 1/8″ kerf, 1/4″ trim, 2″ smallest piece, 12 × 12 keepable, 1 extra sheet', () => {
    expect(BUILT_IN_SAW.profiles.map((p) => [p.name, p.firstCut])).toEqual([
      ['Table saw', 'length'],
      ['Panel saw', 'either'],
    ]);
    for (const p of BUILT_IN_SAW.profiles) {
      expect(p).toMatchObject({ kerf: inches(1 / 8), edgeTrim: inches(1 / 4), minPiece: inches(2), keepLength: inches(12), keepWidth: inches(12), extraSheets: 1 });
    }
    expect(BUILT_IN_SAW.defaultId).toBe('table-saw');
  });

  it('reads what it stored, leaves out what it can’t read, and never ends up empty', () => {
    const thin = { ...PANEL, id: 'thin', name: 'Thin kerf', kerf: inches(3 / 32) };
    expect(parseSawSettings(sawSettingValue({ profiles: [TABLE, thin], defaultId: 'thin' }))).toEqual({ profiles: [TABLE, thin], defaultId: 'thin' });
    expect(parseSawSettings({ profiles: [TABLE, { ...thin, kerf: -1 }, { id: '', name: 'x' }, TABLE], defaultId: 'gone' })).toEqual({
      profiles: [TABLE],
      defaultId: 'table-saw',
    });
    expect(parseSawSettings(undefined)).toEqual(BUILT_IN_SAW);
    expect(parseSawSettings({ profiles: 'nope' })).toEqual(BUILT_IN_SAW);
  });

  it('gives a job its own copy, or the shop default for a job from before profiles', () => {
    const shop = { profiles: [TABLE, PANEL], defaultId: 'panel-saw' };
    expect(jobSawProfile({ sawProfile: null }, shop)).toEqual(PANEL);
    const own = { ...TABLE, kerf: inches(5 / 32) };
    expect(jobSawProfile({ sawProfile: own }, shop)).toBe(own);
  });
});

describe('saw profiles: the Settings draft', () => {
  const SAVED: SettingsValues = { rules: { ...DEFAULT_RULES }, roundTo: 16, backups: { folder: null, keep: 14 }, estimate: BUILT_IN_ESTIMATE, saw: BUILT_IN_SAW };
  const run = (...actions: DraftAction[]) => actions.reduce(draftReducer, createDraft(SAVED));

  it('edits, adds, duplicates and chooses the default; each is a change to save', () => {
    const copy = { ...PANEL, id: 'copy', name: 'Panel saw (copy)' };
    const draft = run(
      { type: 'sawLength', id: 'panel-saw', field: 'kerf', value: inches(5 / 32) },
      { type: 'sawAdd', profile: copy, after: 'table-saw' },
      { type: 'sawField', id: 'copy', patch: { firstCut: 'width', extraSheets: 2 } },
      { type: 'sawDefault', id: 'copy' },
    );
    expect(draft.current.saw.profiles.map((p) => p.id)).toEqual(['table-saw', 'copy', 'panel-saw']);
    expect(draft.current.saw.profiles[2]!.kerf).toBe(inches(5 / 32));
    expect(draft.current.saw.profiles[1]).toMatchObject({ firstCut: 'width', extraSheets: 2 });
    expect(draft.current.saw.defaultId).toBe('copy');
    expect(changedSettings(draft)).toEqual(['sawProfiles']);
    expect(canSave(draft)).toBe(true);
    expect(run({ type: 'sawDefault', id: 'nope' }).current.saw.defaultId).toBe('table-saw');
  });

  it('won’t remove the default or the last profile', () => {
    expect(run({ type: 'sawRemove', id: 'table-saw' }).current.saw.profiles).toHaveLength(2);
    const one = run({ type: 'sawRemove', id: 'panel-saw' });
    expect(one.current.saw.profiles.map((p) => p.id)).toEqual(['table-saw']);
    expect(draftReducer(one, { type: 'sawDefault', id: 'table-saw' }).current.saw.profiles).toHaveLength(1);
  });

  it('won’t save a size it can’t read, a blank name or an impossible number', () => {
    const unreadable = run({ type: 'sawLength', id: 'table-saw', field: 'edgeTrim', value: null });
    expect(unreadable.unparsed.has(sawField('table-saw', 'edgeTrim'))).toBe(true);
    expect(changedSettings(unreadable)).toEqual(['sawProfiles']);
    expect(canSave(unreadable)).toBe(false);
    expect(canSave(run({ type: 'sawField', id: 'table-saw', patch: { name: '  ' } }))).toBe(false);
    expect(canSave(run({ type: 'sawLength', id: 'table-saw', field: 'kerf', value: inches(1) }))).toBe(false);
    expect(canSave(run({ type: 'sawField', id: 'table-saw', patch: { extraSheets: 11 } }))).toBe(false);
    // Removing a profile drops its unreadable fields with it.
    const gone = draftReducer(run({ type: 'sawLength', id: 'panel-saw', field: 'kerf', value: null }), { type: 'sawRemove', id: 'panel-saw' });
    expect(gone.unparsed.size).toBe(0);
  });
});

async function openSettings() {
  window.location.hash = '#/settings';
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Saw profiles' });
  return user;
}

const profileRow = (id: string) => document.querySelector<HTMLElement>(`tr[data-profile="${id}"]`)!;

describe('Settings → Saw profiles', () => {
  it('lists the profiles, edits one, duplicates it, and saves with the other settings', { timeout: 20_000 }, async () => {
    const user = await openSettings();
    expect(profileRow('table-saw')).toHaveTextContent('Table saw');
    expect(profileRow('table-saw')).toHaveTextContent('New jobs');
    expect(profileRow('panel-saw')).toHaveTextContent('Either (the optimizer picks)');

    await user.click(screen.getByRole('button', { name: 'Edit Panel saw' }));
    const kerf = screen.getByLabelText(/^Kerf/);
    await user.clear(kerf);
    await user.type(kerf, '5/32{Enter}');
    expect(profileRow('panel-saw')).toHaveTextContent('5/32″');

    await user.click(screen.getByRole('button', { name: 'Duplicate Panel saw' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Panel saw (copy)');
    await user.click(screen.getByRole('button', { name: 'Use Panel saw (copy) for new jobs' }));

    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    await user.click(within(bar).getByRole('button', { name: 'Save defaults' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument());
    const stored = parseSawSettings((await db.getShopSettings()).other.saw_profiles);
    expect(stored.profiles.map((p) => p.name)).toEqual(['Table saw', 'Panel saw', 'Panel saw (copy)']);
    expect(stored.profiles[1]!.kerf).toBe(inches(5 / 32));
    expect(stored.profiles.find((p) => p.id === stored.defaultId)!.name).toBe('Panel saw (copy)');
    // Every screen sees the saved profiles at once.
    expect(sawProfilesStore.getState().settings).toEqual(stored);
  });
});

describe('a job’s saw profile', () => {
  it('is a copy of the shop default, made when the job is', async () => {
    const created = await createJob({ name: 'Vanity' });
    expect((await db.getJob(created.id)).sawProfile).toEqual(TABLE);
  });

  it('is chosen from the cut list, kept as a copy, with Undo', async () => {
    window.location.hash = '#/jobs/j-0014/cut-list';
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
    const rail = screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
    const picker = within(rail).getByLabelText('Sheet layouts are cut on');
    expect(picker).toHaveValue('table-saw');
    expect(within(rail).getByText(/uses the shop’s default saw profile/)).toBeInTheDocument();
    // Nothing is saved just by looking.
    expect((await db.getJob('j-0014')).sawProfile).toBeNull();

    await user.selectOptions(picker, 'panel-saw');
    expect(toastText()).toContain('Saw profile: Panel saw');
    await waitFor(async () => expect((await db.getJob('j-0014')).sawProfile).toEqual(PANEL));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.getJob('j-0014')).sawProfile).toEqual(TABLE));
  });
});

// ---------------------------------------------------------------------------
// The layout worker
// ---------------------------------------------------------------------------

/** Runs the worker's code in this thread, a tick later, the way a real worker answers. */
function fakeWorkers() {
  const spawned: { worker: WorkerLike; requests: LayoutRequest[]; terminated: boolean }[] = [];
  const spawn = (): WorkerLike => {
    const entry = { worker: null as unknown as WorkerLike, requests: [] as LayoutRequest[], terminated: false };
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(request) {
        entry.requests.push(request);
        setTimeout(() => {
          if (entry.terminated) return;
          handleRequest(request, (answer: LayoutAnswer) => !entry.terminated && worker.onmessage?.({ data: answer }));
        }, 0);
      },
      terminate() {
        entry.terminated = true;
      },
    };
    entry.worker = worker;
    spawned.push(entry);
    return worker;
  };
  return { spawn, spawned };
}

function sampleInput(kerf = TABLE.kerf): LayoutInput {
  const cabinets = [testCabinet('c-b1', 'B1'), testCabinet('c-w1', 'W1', { type: 'wall', height: inches(30), depth: inches(12), quantity: 4 })].map(cabinetSpec);
  return {
    cabinets,
    rules: upgradeVersion1Rules(DEFAULT_RULES),
    materials: engineMaterials(defaultJobMaterials(STANDARD_MATERIALS, BUILT_IN_ESTIMATE, '2026-11-02T00:00:00.000Z'), STANDARD_MATERIALS),
    profile: { ...TABLE, kerf },
    options: { mode: 'cost', seed: 1, timeLimitMs: 5000, iterations: 8 },
  };
}

describe('the layout worker', () => {
  it('reports progress, then the layout, then the sensitivity notes', async () => {
    const { spawn, spawned } = fakeWorkers();
    const runner = createLayoutRunner({ spawn });
    const seen: string[] = [];
    let final: JobLayout | null = null;
    let notes: Sensitivity | null = null;
    runner.run(sampleInput(), {
      onLayout: (layout, done) => {
        seen.push(done ? 'final' : 'progress');
        if (done) final = layout;
      },
      onSensitivity: (n) => (notes = n),
    });
    await waitFor(() => expect(notes).not.toBeNull());
    expect(seen[0]).toBe('progress');
    expect(seen.at(-1)).toBe('final');
    expect(final).toEqual(layoutInput(sampleInput()));
    expect(final!.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(spawned).toHaveLength(1);
  });

  it('answers the same input from the cache, without a worker', async () => {
    const { spawn, spawned } = fakeWorkers();
    const runner = createLayoutRunner({ spawn });
    let done = false;
    runner.run(sampleInput(), { onSensitivity: () => (done = true) });
    await waitFor(() => expect(done).toBe(true));
    expect(runner.cached(sampleInput())?.sensitivity).not.toBeNull();

    const seen: boolean[] = [];
    let notes = false;
    runner.run({ ...sampleInput() }, { onLayout: (_, final) => seen.push(final), onSensitivity: () => (notes = true) });
    expect(seen).toEqual([true]);
    expect(notes).toBe(true);
    expect(spawned.flatMap((s) => s.requests)).toHaveLength(1);
  });

  it('cancels a run when the inputs change, and ignores what it was still going to say', async () => {
    const { spawn, spawned } = fakeWorkers();
    const runner = createLayoutRunner({ spawn });
    const first: string[] = [];
    runner.run(sampleInput(), { onLayout: () => first.push('layout'), onSensitivity: () => first.push('notes') });
    let second: JobLayout | null = null;
    runner.run(sampleInput(inches(3 / 32)), { onLayout: (layout, final) => final && (second = layout) });
    await waitFor(() => expect(second).not.toBeNull());
    expect(first).toEqual([]);
    expect(spawned[0]!.terminated).toBe(true);
    expect(spawned).toHaveLength(2);
    expect(second!.profile.kerf).toBe(inches(3 / 32));

    // Cancelling by hand stops it too.
    let third = false;
    const cancel = runner.run(sampleInput(inches(1 / 16)), { onLayout: () => (third = true) });
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(third).toBe(false);
    runner.dispose();
  });

  it('keeps the last layout on screen while a changed job lays out again', async () => {
    const runner = createLayoutRunner({ spawn: fakeWorkers().spawn });
    const initialProps: { input: LayoutInput | null } = { input: sampleInput() };
    const { result, rerender } = renderHook(({ input }) => useJobLayout(input, runner), { initialProps });
    await waitFor(() => expect(result.current.sensitivity).not.toBeNull());
    expect(result.current.final).toBe(true);
    const before = result.current.layout!;

    rerender({ input: sampleInput(inches(3 / 32)) });
    // Until the new layout's first result, the old one stays, marked not final, without its notes.
    expect(result.current.layout).toBe(before);
    expect(result.current.final).toBe(false);
    expect(result.current.sensitivity).toBeNull();
    await waitFor(() => expect(result.current.final).toBe(true));
    expect(result.current.layout!.profile.kerf).toBe(inches(3 / 32));

    rerender({ input: null });
    expect(result.current.layout).toBeNull();
    runner.dispose();
  });

  it('passes on an error instead of a layout', async () => {
    const runner = createLayoutRunner({ spawn: fakeWorkers().spawn });
    let error: string | null = null;
    runner.run({ ...sampleInput(), cabinets: null as never }, { onError: (message) => (error = message) });
    await waitFor(() => expect(error).not.toBeNull());
  });
});
