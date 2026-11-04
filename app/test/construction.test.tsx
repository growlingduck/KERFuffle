import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCutList,
  constructionName,
  DEFAULT_METHOD,
  DEFAULT_RULES,
  inches,
  parseDimension,
  ticks,
  upgradeVersion1Rules,
} from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules, MethodSettings, Ticks } from '@kerfuffle/engine';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { cutListCsv } from '../src/cutlist/csv';
import { createJobSession, cabinetSpec } from '../src/data/jobSession';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession } from '../src/data/storage';
import type { CabinetRecord, JobRecord } from '../src/data/types';
import { RULES_SETTING } from '../src/data/types';
import { dismissToast, toastStore } from '../src/state/toast';
import { groupByRun } from '../src/screens/workspace/CabinetList';
import { applyCommand } from '../src/workspace/commands';
import { diffConstruction, diffText } from '../src/workspace/construction';
import { historyStore } from '../src/workspace/history';
import { testCabinet, testJob, useTestDatabase } from './storage';

const METHOD_B: ConstructionRules = { ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, id: 'B' } };
const METHOD_A2: ConstructionRules = { ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, baseType: 'legs' } };

const B1 = testCabinet('c-b1', 'B1', { height: inches(36), finishedEnds: 'left', run: 'Sink wall' });
const B2 = testCabinet('c-b2', 'B2', { width: inches(36), height: inches(36), run: 'Sink wall' });
const B3 = testCabinet('c-b3', 'B3', { width: inches(18), height: inches(36), run: 'Range wall' });
const B4 = testCabinet('c-b4', 'B4', { width: inches(24), height: inches(36) });
const W1 = testCabinet('c-w1', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 });

/** Not a React hook, despite the name. */
const seedDatabase = useTestDatabase;

let client: MemoryStorageClient;

async function openWorkspace(job: Partial<JobRecord> = {}) {
  client = await seedDatabase([testJob({ rules: DEFAULT_RULES, rulesVersion: 2, cabinets: [B1, B2, B3, B4, W1], ...job })]);
  window.location.hash = '#/jobs/j-0014/workspace';
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument());
  return { user, ...view };
}

const pick = (user: ReturnType<typeof userEvent.setup>, label: string) => user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
const openConstruction = async (user: ReturnType<typeof userEvent.setup>) => {
  const toggle = screen.getByRole('button', { name: /^Construction/ });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
};
const latestToast = () => toastStore.getState();

afterEach(() => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The prompt 09 fixtures, as a new job built each way
// ---------------------------------------------------------------------------

const FIXTURES = join(process.cwd(), '..', 'engine', 'fixtures', 'methods');

interface Fixture {
  name: string;
  rules: { preset: 'DEFAULT_RULES'; method?: Record<string, string | number | null> };
  cabinets: (Omit<CabinetSpec, 'width' | 'height' | 'depth'> & { width: string; height: string; depth: string })[];
}

const size = (text: string): Ticks => {
  const parsed = parseDimension(text);
  if (!parsed.ok) throw new Error(text);
  return parsed.value;
};

function fixture(file: string): { rules: ConstructionRules; cabinets: CabinetRecord[] } {
  const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Fixture;
  const method: Record<string, unknown> = { ...DEFAULT_METHOD };
  for (const [key, value] of Object.entries(raw.rules.method ?? {})) {
    const sample = DEFAULT_METHOD[key as keyof MethodSettings];
    method[key] = typeof value === 'string' && (typeof sample === 'number' || sample === null) ? size(value) : value;
  }
  const cabinets = raw.cabinets.map(
    (c, i): CabinetRecord => ({
      id: `fx-${i}`,
      label: c.id,
      type: c.type,
      width: size(c.width),
      height: size(c.height),
      depth: size(c.depth),
      shelfCount: c.shelfCount,
      finishedEnds: c.finishedEnds,
      quantity: c.quantity,
      room: null,
      run: c.run ?? null,
    }),
  );
  return { rules: { ...DEFAULT_RULES, method: method as unknown as MethodSettings }, cabinets };
}

describe('a new job built each way', () => {
  beforeEach(async () => {
    window.location.hash = '#/jobs';
    client = await seedDatabase([]);
  });

  it.each([
    ['Frameless on a separate ladder base', 'a1-single-run.json'],
    ['Frameless on a separate ladder base', 'a1-run-over-maximum.json'],
    ['Frameless on leveling legs', 'a2-legs.json'],
    ['Frameless with integral toe kick', 'b-integral-kick-finished-end.json'],
  ])('%s: the New job dialog snapshots it, and the cut list matches %s', async (choice, file) => {
    const { rules, cabinets } = fixture(file);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'New job' }));
    const dialog = screen.getByRole('dialog', { name: 'New job' });
    await user.click(await within(dialog).findByRole('button', { name: 'Change…' }));
    const group = within(dialog).getByRole('group', { name: 'Construction' });
    // The shop default is picked to start with.
    expect(within(group).getByRole('radio', { name: 'Frameless on a separate ladder base' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: choice }));
    await user.type(within(dialog).getByLabelText('Job name'), file);
    await user.click(within(dialog).getByRole('button', { name: 'Create and open' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: `Workspace: ${file}` })).toBeInTheDocument());

    const created = (await client.listJobs()).find((j) => j.name === file)!;
    const job = await client.getJob(created.id);
    expect(job.rules).toEqual(rules);
    const specs = cabinets.map(cabinetSpec);
    expect(buildCutList(specs, job.rules)).toEqual(buildCutList(specs, rules));
  });

  it('inset back with stretchers: the shop settings plus the chosen construction', async () => {
    const { rules, cabinets } = fixture('inset-back-stretchers.json');
    await client.setShopSetting(RULES_SETTING, { ...DEFAULT_RULES, method: { ...rules.method, id: 'B' } });
    const job = await client.createJob({ name: 'Inset', construction: 'A1' });
    expect(job.rules).toEqual(rules);
    expect(buildCutList(cabinets.map(cabinetSpec), job.rules).lines.length).toBeGreaterThan(0);
  });

  it('a copy keeps its source’s construction unless another is picked', async () => {
    await useTestDatabase([testJob({ rules: METHOD_B, rulesVersion: 2 }), testJob({ id: 'j-old', number: 9, name: 'Old job' })]);
    window.location.hash = '#/jobs';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'New job' }));
    const dialog = screen.getByRole('dialog', { name: 'New job' });
    await user.type(within(dialog).getByLabelText('Job name'), 'Copy of B');
    await user.selectOptions(within(dialog).getByLabelText('Start with'), 'A copy of “Kitchen remodel” (J-0014)');
    // Unchanged, the copy just says it keeps that job's construction.
    expect(await within(dialog).findByText('Construction: same as “Kitchen remodel”')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Change…' }));
    const group = within(dialog).getByRole('group', { name: 'Construction' });
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Frameless with integral toe kick' })).toBeChecked());
    await user.click(within(dialog).getByRole('button', { name: 'Create and open' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Copy of B' })).toBeInTheDocument());
    const { getStorageClient } = await import('../src/data/client');
    const db = getStorageClient();
    const copy = (await db.listJobs()).find((j) => j.name === 'Copy of B')!;
    expect((await db.getJob(copy.id)).rules.method.id).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Saving a construction change
// ---------------------------------------------------------------------------

describe('the job session saves a changed construction', () => {
  it('sends rules only when they changed, and only the method may change', async () => {
    const db = await useTestDatabase([testJob()]);
    const session = createJobSession({ client: db, debounceMs: 0 });
    await session.open('j-0014');
    const job = session.getJob()!;
    expect(job.rulesVersion).toBe(1);
    const save = vi.spyOn(db, 'saveJob');

    session.commit({ ...job, name: 'Renamed' });
    await session.flush();
    expect(save.mock.calls[0]![0]).not.toHaveProperty('rules');

    // A rule other than the method never changes through an edit.
    session.commit((j) => ({ ...j, rules: { ...j.rules, panelThickness: ticks(46) } }));
    expect(session.getJob()!.rules).toBe(job.rules);

    const b = { ...job.rules, method: { ...job.rules.method, id: 'B' as const } };
    session.commit((j) => ({ ...j, rules: b }));
    await session.flush();
    expect(save.mock.calls.at(-1)![0].rules).toEqual(b);
    expect(session.getJob()!.rulesVersion).toBe(2);
    expect((await db.getJob('j-0014')).rules.method.id).toBe('B');

    session.commit((j) => ({ ...j, notes: 'more' }));
    await session.flush();
    expect(save.mock.calls.at(-1)![0]).not.toHaveProperty('rules');
    session.dispose();
  });

  it('the database refuses a construction change once the job is ready to cut', async () => {
    const db = await useTestDatabase([testJob({ status: 'ready' })]);
    const job = await db.getJob('j-0014');
    const rules = { ...job.rules, method: { ...job.rules.method, id: 'B' as const } };
    await expect(db.saveJob({ ...job, rules })).rejects.toThrow(/locked/);
    // Undoing back to draft in the same save is allowed.
    await expect(db.saveJob({ ...job, status: 'draft', rules })).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

describe('construction and run commands', () => {
  const content = { cabinets: [B1, B4, W1], status: 'draft' as const, rules: DEFAULT_RULES };

  it('changes the construction as one step, and refuses after Draft', () => {
    const result = applyCommand(content, { type: 'setConstruction', choice: 'B' })!;
    expect(result.label).toBe('Change construction to Frameless · integral toe kick');
    expect(result.content.rules.method).toEqual({ ...DEFAULT_METHOD, id: 'B' });
    expect(result.content.cabinets).toBe(content.cabinets);
    expect(applyCommand(content, { type: 'setConstruction', choice: 'A1' })).toBeNull();
    expect(applyCommand({ ...content, status: 'ready' }, { type: 'setConstruction', choice: 'B' })).toBeNull();
  });

  it('choosing a construction for a job made before methods lists its base from then on', () => {
    const old = { ...content, rules: upgradeVersion1Rules(DEFAULT_RULES) };
    const result = applyCommand(old, { type: 'setConstruction', choice: 'A1' })!;
    expect(result.content.rules.method.listBase).toBe(true);
  });

  it('puts a cabinet in a run and takes it out', () => {
    const put = applyCommand(content, { type: 'setRun', cabinetId: 'c-b4', run: '  Island ' })!;
    expect(put.label).toBe('Put B4 in run Island');
    expect(put.content.cabinets[1]!.run).toBe('Island');
    const out = applyCommand(put.content, { type: 'setRun', cabinetId: 'c-b4', run: '' })!;
    expect(out.label).toBe('Take B4 out of its run');
    expect(out.content.cabinets[1]!.run).toBeNull();
    expect(applyCommand(content, { type: 'setRun', cabinetId: 'c-b4', run: null })).toBeNull();
  });

  it('counts what a construction change does to the whole job', () => {
    const cabinets = [B1, B2, W1];
    const diff = diffConstruction(cabinets, DEFAULT_RULES, METHOD_B);
    // B1 and B2 change sides, back, front and laminate, and gain a kick board; the run's
    // ladder base (four lines) goes; the wall cabinet is untouched.
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(4);
    expect(diff.changed).toBeGreaterThan(0);
    expect(diffText(diff)).toBe(`${diff.changed} parts changed, 2 added, 4 removed`);
    expect(diffText({ changed: 0, added: 0, removed: 0 })).toBe('No parts changed');
    expect(diffText({ changed: 0, added: 1, removed: 0 })).toBe('1 part added');
  });

  it('groups the list by run, then cabinets with no run, then wall cabinets', () => {
    const groups = groupByRun([B1, B3, W1, B2, B4]);
    expect(groups.map((g) => [g.title, g.sub, g.cabinets.map((c) => c.label)])).toEqual([
      ['Run: Sink wall', '2 cabinets · 66″ long', ['B1', 'B2']],
      ['Run: Range wall', '1 cabinet · 18″ long', ['B3']],
      ['No run (own base)', '1 cabinet', ['B4']],
      ['Wall cabinets', '1 cabinet', ['W1']],
    ]);
  });
});

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

describe('workspace: runs', () => {
  it('a Run field on base cabinets, with the job’s runs as suggestions; none on wall cabinets', async () => {
    const { user } = await openWorkspace();
    const run = screen.getByLabelText<HTMLInputElement>('Run');
    expect(run.value).toBe('Sink wall');
    expect(run).toHaveAccessibleDescription('Shares one ladder base with B2.');
    const options = [...document.querySelectorAll(`#${CSS.escape(run.getAttribute('list')!)} option`)].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['Sink wall', 'Range wall']);

    await pick(user, 'W1');
    expect(screen.queryByLabelText('Run')).toBeNull();
  });

  it('typing a run commits on Enter as one undoable step; Esc puts it back', async () => {
    const { user } = await openWorkspace();
    await pick(user, 'B4');
    const run = screen.getByLabelText<HTMLInputElement>('Run');
    expect(run).toHaveAccessibleDescription('No run: this cabinet gets its own base.');
    await user.click(run);
    await user.type(run, 'Range');
    await user.keyboard('{Escape}');
    expect(run.value).toBe('');
    await user.type(run, 'Range wall{Enter}');
    expect(jobSession.getJob()!.cabinets[3]!.run).toBe('Range wall');
    expect(historyStore.getState().past.at(-1)!.label).toBe('Put B4 in run Range wall');
    expect(screen.getByLabelText('Run')).toHaveAccessibleDescription('Shares one ladder base with B3.');
  });

  it('is hidden when the job’s construction has no runs', async () => {
    await openWorkspace({ rules: METHOD_B });
    expect(screen.queryByLabelText('Run')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Group by run' })).toBeNull();
  });

  it('the list groups by run, and arrow keys follow the groups', async () => {
    const { user } = await openWorkspace();
    await user.click(screen.getByRole('button', { name: 'Group by run' }));
    expect(screen.getByRole('button', { name: 'Group by run' })).toHaveAttribute('aria-pressed', 'true');
    const lists = screen.getAllByRole('list');
    expect(lists.map((l) => l.getAttribute('aria-labelledby') && document.getElementById(l.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
      'Run: Sink wall2 cabinets · 66″ long',
      'Run: Range wall1 cabinet · 18″ long',
      'No run (own base)1 cabinet',
      'Wall cabinets1 cabinet',
    ]);
    const b2 = screen.getByRole('button', { name: /^B2/ });
    b2.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^B3/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^B4/ })).toHaveFocus();
  });

  it('the parts panel lists the run’s base under the run, with whole-run quantities', async () => {
    await openWorkspace();
    const table = screen.getByRole('table', { name: /Run: Sink wall/ });
    expect(within(table).getByText('Shared by 2 cabinets (B1, B2). Quantities are for the whole run.')).toBeInTheDocument();
    const rail = table.querySelector('tr[data-role="base-rail-front"]')!;
    // 30 + 36 = 66″ of rail under the run.
    expect(rail.querySelector('td[data-col="L"]')).toHaveTextContent('66');
    // Listed once, under the run, not with the cabinet's own parts.
    expect(document.querySelectorAll('tr[data-role="base-rail-front"]')).toHaveLength(1);
  });

  it('a cabinet with no run lists its own platform with its parts', async () => {
    const { user } = await openWorkspace();
    await pick(user, 'B4');
    expect(screen.queryByRole('table', { name: /^Run:/ })).toBeNull();
    expect(document.querySelector('tr[data-role="base-rail-front"] td[data-col="L"]')).toHaveTextContent('24');
  });

  it('tracing width lights the run’s rails and kick skin too', async () => {
    const { user } = await openWorkspace();
    await user.hover(screen.getByLabelText(/^Width/, { selector: 'input' }));
    const traced = [...document.querySelectorAll<HTMLElement>('td[data-traced]')].map((td) => `${td.closest('tr')?.dataset.role}.${td.dataset.col}`);
    expect(traced).toEqual(expect.arrayContaining(['base-rail-front.L', 'base-rail-back.L', 'kick-skin.L', 'bottom.L']));
  });
});

describe('workspace: the drawing shows the method', () => {
  it('A1: kick skin, rails and sleepers under the box', async () => {
    await openWorkspace();
    for (const role of ['kick-skin', 'base-rail-front', 'base-rail-back', 'base-sleeper']) {
      expect(document.querySelector(`svg [data-part="${role}"]`), role).not.toBeNull();
    }
    expect(screen.getByRole('img', { name: /stands on a ladder base/ })).toBeInTheDocument();
  });

  it('A2: legs and a clip-on kick board', async () => {
    await openWorkspace({ rules: METHOD_A2 });
    expect(document.querySelectorAll('svg [data-part="kick-board"]')).toHaveLength(2);
    expect(document.querySelectorAll('svg [data-leg]')).toHaveLength(2);
  });

  it('B: notched sides to the floor and a kick board; tracing the toe kick lights the notch', async () => {
    const { user } = await openWorkspace({ rules: METHOD_B });
    const side = document.querySelector('svg path[data-part="side-right"]');
    expect(side).not.toBeNull();
    expect(document.querySelector('svg [data-part="kick-board"]')).not.toBeNull();
    expect(screen.getByText('Box height').parentElement).toHaveTextContent('36″ − 4″ − 1 1/2″ = 30 1/2″');
    expect(screen.getAllByText('notched 4 × 3', { selector: 'div' })).toHaveLength(3);

    await user.hover(document.querySelector('[data-dim="toe"] > g')!);
    expect(document.querySelector('tr[data-role="side-left"] [data-traced]')).toHaveTextContent('notched 4 × 3');
    expect(document.querySelector('tr[data-role="kick-board"] td[data-col="W"]')).toHaveAttribute('data-traced');
  });

  it('stretchers and an inset back draw in place of the top', async () => {
    const rules = { ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, baseTop: 'stretchers' as const, backType: 'rabbet' as const, backThickness: inches(1 / 4) } };
    await openWorkspace({ rules });
    expect(document.querySelector('svg [data-part="top"]')).toBeNull();
    expect(document.querySelectorAll('svg [data-part="stretcher-front"]')).toHaveLength(2);
    expect(document.querySelector('svg [data-part="stretcher-back"]')).not.toBeNull();
    expect(document.querySelectorAll('svg [data-part="nailer"]')).toHaveLength(2);
  });
});

describe('workspace: changing the construction', () => {
  it('in Draft: one undoable step with a toast that says what changed', async () => {
    const { user } = await openWorkspace();
    await openConstruction(user);
    expect(screen.getByText('Frameless on a separate ladder base')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change…' }));
    const dialog = screen.getByRole('dialog', { name: 'Change construction' });
    expect(within(dialog).getByRole('radio', { name: 'Frameless on a separate ladder base' })).toBeChecked();
    expect(within(dialog).getByRole('status')).toHaveTextContent('This is how the job is built now.');
    await user.click(within(dialog).getByRole('radio', { name: 'Frameless with integral toe kick' }));
    const diff = diffText(diffConstruction([B1, B2, B3, B4, W1], DEFAULT_RULES, METHOD_B));
    expect(within(dialog).getByRole('status')).toHaveTextContent(`On the cut list: ${diff}.`);
    await user.click(within(dialog).getByRole('button', { name: 'Change construction' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jobSession.getJob()!.rules.method.id).toBe('B');
    expect(latestToast()?.message).toBe(`Construction: Frameless · integral toe kick. ${diff}.`);
    expect(screen.getAllByText('Frameless · integral toe kick').length).toBeGreaterThan(0);
    await waitFor(async () => expect((await client.getJob('j-0014')).rules.method.id).toBe('B'));

    act(() => latestToast()!.action!.run());
    expect(jobSession.getJob()!.rules.method.id).toBe('A');
    await waitFor(async () => expect((await client.getJob('j-0014')).rules.method.id).toBe('A'));
    // Redo puts it back.
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(jobSession.getJob()!.rules.method.id).toBe('B');
  });

  it('from Ready to cut onward the control is disabled, with the reason and a hint to duplicate', async () => {
    const { user } = await openWorkspace({ status: 'ready' });
    await openConstruction(user);
    const change = screen.getByRole('button', { name: 'Change…' });
    expect(change).toHaveAttribute('aria-disabled', 'true');
    expect(change).toHaveAccessibleDescription('Locked once the job is ready to cut. Duplicate the job to try another method.');
    await user.click(change);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

describe('Settings: construction', () => {
  async function openSettings() {
    client = await seedDatabase([]);
    window.location.hash = '#/settings';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Construction defaults' });
    return user;
  }

  it('the default construction and every method setting, shown only for the methods that use them', async () => {
    const user = await openSettings();
    const method = screen.getByRole('group', { name: 'Default for new jobs' });
    expect(within(method).getByRole('radio', { name: 'Frameless on a separate ladder base' })).toBeChecked();
    for (const group of ['Back', 'Top', 'Toe kick', 'Base']) expect(screen.getByRole('group', { name: group })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Sleeper spacing, most/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Legs per box')).toBeNull();
    expect(screen.queryByLabelText(/^Groove depth/, { selector: 'input' })).toBeNull();

    // A typed value survives being hidden.
    const spacing = screen.getByLabelText(/^Sleeper spacing, most/, { selector: 'input' });
    await user.clear(spacing);
    await user.type(spacing, '20{Enter}');
    await user.click(within(method).getByRole('radio', { name: 'Frameless with integral toe kick' }));
    expect(screen.queryByRole('group', { name: 'Base' })).toBeNull();
    expect(screen.queryByLabelText(/^Kick skin thickness/, { selector: 'input' })).toBeNull();
    await user.click(within(method).getByRole('radio', { name: 'Frameless on a separate ladder base' }));
    expect(screen.getByLabelText<HTMLInputElement>(/^Sleeper spacing, most/, { selector: 'input' }).value).toBe('20');

    await user.click(within(method).getByRole('radio', { name: 'Frameless on leveling legs' }));
    expect(screen.getByLabelText('Legs per box')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Inset in a dado' }));
    expect(screen.getByLabelText(/^Groove depth/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Dado in from the back edge/, { selector: 'input' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Inset in a rabbet' }));
    expect(screen.queryByLabelText(/^Dado in from the back edge/, { selector: 'input' })).toBeNull();
  });

  it('validates beside the field, blocks Save, and saves like the other rules', async () => {
    const user = await openSettings();
    const kick = screen.getByLabelText(/^Kick depth/, { selector: 'input' });
    await user.clear(kick);
    await user.type(kick, '30');
    // Too deep for the ladder base, and for method B's notch, whichever is the default.
    expect(await screen.findByText(/too shallow for a ladder base with a 30″ kick depth/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save defaults' })).toHaveAttribute('aria-disabled', 'true');

    await user.clear(kick);
    await user.type(kick, '2 1/2');
    await user.click(screen.getByRole('radio', { name: 'Frameless with integral toe kick' }));
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('2 unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(async () => expect((await client.getShopSettings()).rules.method).toMatchObject({ id: 'B', kickDepth: inches(2.5) }));
    const job = await client.createJob({ name: 'After' });
    expect(job.rules.method).toMatchObject({ id: 'B', kickDepth: inches(2.5) });
  });

  it('the detail drawing follows the construction settings', async () => {
    const user = await openSettings();
    await user.click(screen.getByLabelText(/^Kick depth/, { selector: 'input' }));
    expect(screen.getByRole('img', { name: /^Detail J: Toe kick\. 30″ base → rails 30″ long, 3″ back · 3 sleepers 19 1\/2″/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Frameless with integral toe kick' }));
    expect(screen.getByRole('img', { name: /^Detail G: Construction\. 34 1\/2″ base → sides 33″ long, notched 4″ × 3″/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Two stretchers' }));
    expect(screen.getByRole('img', { name: /^Detail I: Base cabinet top\. 30″ base → two stretchers 28 1\/2″ × 4″/ })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

describe('output names the construction', () => {
  it('the CSV header', () => {
    const list = buildCutList([B1, B2].map(cabinetSpec), DEFAULT_RULES);
    const csv = cutListCsv(list, { jobName: 'K', jobNumber: 'J-0014', construction: constructionName(DEFAULT_RULES.method), date: '2026-11-01', revision: 2 });
    expect(csv.split('\r\n')[0]).toBe('﻿# KERFuffle cut list: K · J-0014 · Frameless · separate ladder base · Rev. 2 · printed 2026-11-01 · Identical parts merged · fronts included · inches');
    expect(csv).toContain('Run: Sink wall');
  });

  it('the printed mode line and title block; run parts carry their run', async () => {
    client = await seedDatabase([testJob({ rules: METHOD_B, rulesVersion: 2, cabinets: [B1, W1] })]);
    window.location.hash = '#/jobs/j-0014/cut-list';
    render(<App />);
    const sheet = await screen.findByRole('article', { name: /^Sheet 1 of/ });
    expect(within(sheet).getAllByText('Frameless · integral toe kick')).toHaveLength(2);
    expect(within(sheet).getByText('Construction')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

describe('keyboard', () => {
  it('the construction choice moves with the arrow keys, like any radio group', async () => {
    const { user } = await openWorkspace();
    await openConstruction(user);
    const change = screen.getByRole('button', { name: 'Change…' });
    change.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Change construction' });
    const a1 = within(dialog).getByRole('radio', { name: 'Frameless on a separate ladder base' });
    a1.focus();
    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('radio', { name: 'Frameless on leveling legs' })).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('radio', { name: 'Frameless with integral toe kick' })).toBeChecked();
    // Esc closes without changing anything, and focus goes back to the button.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jobSession.getJob()!.rules.method.id).toBe('A');
    expect(change).toHaveFocus();
  });

  it('Tab reaches the change button, and the dialog applies from the keyboard', async () => {
    const { user } = await openWorkspace();
    await openConstruction(user);
    screen.getByRole('button', { name: 'Change…' }).focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Change construction' });
    within(dialog).getByRole('radio', { name: 'Frameless on a separate ladder base' }).focus();
    await user.keyboard('{ArrowUp}');
    expect(within(dialog).getByRole('radio', { name: 'Frameless with integral toe kick' })).toBeChecked();
    within(dialog).getByRole('button', { name: 'Change construction' }).focus();
    await user.keyboard('{Enter}');
    expect(jobSession.getJob()!.rules.method.id).toBe('B');
    // Ctrl+Z undoes it like any edit.
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(jobSession.getJob()!.rules.method.id).toBe('A');
  });

  it('Group by run is a toggle button that works from the keyboard', async () => {
    const { user } = await openWorkspace();
    const toggle = screen.getByRole('button', { name: 'Group by run' });
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
