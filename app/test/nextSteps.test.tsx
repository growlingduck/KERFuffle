import { inches } from '@kerfuffle/engine';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { STANDARD_MATERIALS } from '../src/data/materials';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession } from '../src/data/storage';
import type { CabinetRecord, JobRecord } from '../src/data/types';
import { parseHash, routeHref } from '../src/routes';
import { materialsStore } from '../src/state/materials';
import { dismissToast, toastStore } from '../src/state/toast';
import { quietLayouts, testCabinet, testJob, useTestDatabase as seedDatabase } from './storage';

/** Prompt 17: every screen points to the next step, and every empty view says what's missing. */

const B1 = testCabinet('c-b1', 'B1');
/** Too short to make a box: needs a fix. */
const BAD = testCabinet('c-b9', 'B9', { height: inches(2) });

let db: MemoryStorageClient;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
});

async function open(hash: string, job: Partial<JobRecord> = {}) {
  db = await seedDatabase([testJob(job)]);
  quietLayouts();
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

async function openWorkspace(cabinets: CabinetRecord[], job: Partial<JobRecord> = {}) {
  const user = await open('#/jobs/j-0014/workspace', { cabinets, ...job });
  await screen.findByRole('heading', { name: /^Parts · / });
  return user;
}

async function openCutList(job: Partial<JobRecord> = {}, view?: 'Layouts' | 'Estimate') {
  const user = await open('#/jobs/j-0014/cut-list', job);
  await screen.findByRole('toolbar', { name: 'Cut list options' });
  if (view) await user.click(screen.getByRole('button', { name: view }));
  return user;
}

const notice = (kind: string) => document.querySelector<HTMLElement>(`[data-notice="${kind}"]`);
const rail = () => screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
const toastText = () => document.querySelector('.toast')?.textContent ?? '';

describe('routes: a Settings link names its section', () => {
  it('parses and builds #/settings/<section>', () => {
    expect(parseHash('#/settings/materials')).toEqual({ name: 'settings', section: 'materials' });
    expect(parseHash('#/settings/saws')).toEqual({ name: 'settings', section: 'saws' });
    expect(parseHash('#/settings/nowhere')).toEqual({ name: 'settings' });
    expect(routeHref({ name: 'settings', section: 'saws' })).toBe('#/settings/saws');
    expect(routeHref({ name: 'settings' })).toBe('#/settings');
  });

  it.each([
    ['materials', 'set-materials'],
    ['saws', 'set-saws'],
  ])('#/settings/%s opens at that section, its heading focused', async (section, headingId) => {
    await open(`#/settings/${section}`);
    await waitFor(() => expect(document.getElementById(headingId)).toHaveFocus());
    expect(screen.getByRole('navigation', { name: 'Settings sections' }).querySelector('[aria-current="true"]')).toHaveTextContent(
      section === 'saws' ? 'Saw profiles' : 'Materials',
    );
  });
});

describe('workspace → cut list', () => {
  it('a job with a valid cabinet shows Cut list →, with Ctrl+L in its tooltip', async () => {
    const user = await openWorkspace([B1]);
    const link = screen.getByRole('link', { name: 'Cut list →' });
    expect(link).toHaveAttribute('href', '#/jobs/j-0014/cut-list');
    expect(link).toHaveAttribute('aria-keyshortcuts', 'Control+L');
    expect(screen.queryByText(/needs? a fix/)).toBeNull();
    await user.hover(link);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ctrl + L');
  });

  it('Ctrl+L still opens the cut list', async () => {
    await openWorkspace([B1]);
    fireEvent.keyDown(document.body, { key: 'l', ctrlKey: true });
    await waitFor(() => expect(window.location.hash).toBe('#/jobs/j-0014/cut-list'));
  });

  it('says how many cabinets need a fix, without blocking the cut list', async () => {
    await openWorkspace([B1, BAD]);
    expect(screen.getByText('1 cabinet needs a fix')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cut list →' })).toHaveAttribute('href', '#/jobs/j-0014/cut-list');
  });

  it('counts more than one', async () => {
    await openWorkspace([B1, BAD, { ...BAD, id: 'c-b10', label: 'B10' }]);
    expect(screen.getByText('2 cabinets need a fix')).toBeInTheDocument();
  });

  it('with no valid cabinet the small link stays, and still opens the cut list', async () => {
    await openWorkspace([BAD]);
    expect(screen.queryByRole('link', { name: 'Cut list →' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Whole-job cut list →' })).toHaveAttribute('href', '#/jobs/j-0014/cut-list');
  });
});

describe('cut list: empty and blocked views name what is missing', () => {
  it('no cabinets: the notice, the materials panel and Layouts all go back to the workspace', async () => {
    const user = await openCutList({ cabinets: [] });
    const empty = notice('no-cabinets')!;
    expect(empty).toHaveTextContent('This job has no cabinets yet.');
    expect(within(empty).getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute('href', '#/jobs/j-0014/workspace');

    const slots = rail().querySelector<HTMLElement>('[data-empty="slots"]')!;
    expect(slots).toHaveTextContent('No cabinets to choose materials for yet.');
    expect(within(slots).getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute('href', '#/jobs/j-0014/workspace');

    await user.click(screen.getByRole('button', { name: 'Layouts' }));
    expect(document.querySelector('[data-layout-status]')).toHaveTextContent('Nothing to lay out yet: this job has no cabinets.');
    const action = document.querySelector<HTMLElement>('[data-layout-empty="no-cabinets"]')!;
    expect(within(action).getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute('href', '#/jobs/j-0014/workspace');
  });

  it('every cabinet needs a fix: Layouts says so and goes back to the workspace', async () => {
    await openCutList({ cabinets: [BAD] }, 'Layouts');
    expect(document.querySelector('[data-layout-status]')).toHaveTextContent('every cabinet needs a fix');
    const action = document.querySelector<HTMLElement>('[data-layout-empty="no-parts"]')!;
    expect(within(action).getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute('href', '#/jobs/j-0014/workspace');
  });

  it('no materials in the catalog: links to Settings → Materials', async () => {
    const user = await openCutList({ cabinets: [B1] });
    act(() => materialsStore.dispatch({ catalog: [] }));

    const panel = rail().querySelector<HTMLElement>('[data-empty="catalog"]')!;
    expect(panel).toHaveTextContent('The materials catalog is empty.');
    expect(within(panel).getByRole('link', { name: 'Add materials in Settings → Materials' })).toHaveAttribute('href', '#/settings/materials');

    const missing = notice('no-material')!;
    expect(missing).toHaveTextContent('The materials catalog is empty');
    expect(within(missing).getByRole('link', { name: 'Add materials in Settings → Materials' })).toHaveAttribute('href', '#/settings/materials');

    await user.click(screen.getByRole('button', { name: 'Layouts' }));
    const action = document.querySelector<HTMLElement>('[data-layout-empty="no-material"]')!;
    expect(within(action).getByRole('link', { name: 'Add materials in Settings → Materials' })).toHaveAttribute('href', '#/settings/materials');
  });

  it('parts with no material: names the slots, and Choose materials focuses the materials panel', async () => {
    const user = await openCutList({ cabinets: [B1], materials: { slots: {} } });
    const missing = notice('no-material')!;
    expect(missing).toHaveTextContent(/No material chosen for box,/);
    await user.click(within(missing).getByRole('button', { name: 'Choose materials' }));
    const focused = document.activeElement as HTMLSelectElement;
    expect(focused.tagName).toBe('SELECT');
    expect(document.getElementById('cutlist-materials')).toContainElement(focused);
    expect(focused).toHaveAttribute('aria-invalid', 'true');
  });

  it('parts with no material: Layouts offers the same action', async () => {
    const user = await openCutList({ cabinets: [B1], materials: { slots: {} } }, 'Layouts');
    expect(document.querySelector('[data-layout-status]')).toHaveTextContent('no sheet parts have a material chosen');
    await user.click(within(document.querySelector<HTMLElement>('[data-layout-empty="no-material"]')!).getByRole('button', { name: 'Choose materials' }));
    expect(document.getElementById('cutlist-materials')).toContainElement(document.activeElement as HTMLElement);
  });

  it('no saw profile chosen: says which one is used, links to Settings → Saw profiles, and can pick one', async () => {
    await openCutList({ cabinets: [B1], sawProfile: null });
    const saw = rail().querySelector<HTMLElement>('[data-empty="saw"]')!;
    expect(saw).toHaveTextContent(/No saw profile chosen for this job: layouts use the shop default, /);
    expect(within(saw).getByRole('link', { name: 'Settings → Saw profiles' })).toHaveAttribute('href', '#/settings/saws');
    expect(within(rail()).getByLabelText('Sheet layouts are cut on')).toBeEnabled();
  });

  it('an estimate with no prices names the materials that have none', async () => {
    const user = await openCutList({ cabinets: [B1] });
    // Not on the cut list itself: it doesn't need prices.
    expect(notice('no-price')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Estimate' }));
    const unpriced = notice('no-price')!;
    const birch = STANDARD_MATERIALS.find((m) => m.id === 'std-birch-3-4')!;
    expect(unpriced).toHaveTextContent(`No price for ${birch.name}`);
    expect(unpriced).toHaveTextContent('The estimate total is incomplete');
    expect(within(unpriced).getByRole('link', { name: 'Add prices in Settings → Materials' })).toHaveAttribute('href', '#/settings/materials');
  });

  it('the panels’ Settings links open their sections', async () => {
    await openCutList({ cabinets: [B1] });
    expect(within(rail()).getByRole('link', { name: 'Settings → Materials' })).toHaveAttribute('href', '#/settings/materials');
    expect(within(rail()).getAllByRole('link', { name: 'Settings → Saw profiles' }).at(-1)).toHaveAttribute('href', '#/settings/saws');
  });
});

describe('Ready to cut says it locks construction', () => {
  it('header: the item carries the hint, the toast says so, and Undo restores the draft and unlocks construction', async () => {
    const user = await openWorkspace([B1]);
    await user.click(screen.getByRole('button', { name: /Job status: .*Draft/ }));
    const ready = screen.getByRole('menuitemradio', { name: 'Ready to cut' });
    expect(ready).toHaveAccessibleDescription('Locks construction');
    // Only Ready to cut, and only from a draft.
    expect(screen.getByRole('menuitemradio', { name: 'Completed' })).not.toHaveAccessibleDescription('Locks construction');
    await user.click(ready);

    expect(toastText()).toContain('Marked ready to cut. Construction is locked.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jobSession.getJob()?.status).toBe('ready');
    const toggle = screen.getByRole('button', { name: /^Construction/ });
    if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Change…' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(within(document.querySelector<HTMLElement>('.toast')!).getByRole('button', { name: 'Undo' }));
    expect(jobSession.getJob()?.status).toBe('draft');
    expect(screen.getByRole('button', { name: 'Change…' })).not.toHaveAttribute('aria-disabled');
    await act(() => jobSession.flush());
    expect((await db.getJob('j-0014')).status).toBe('draft');
  });

  it('header: a job already past draft gets no hint', async () => {
    const user = await openWorkspace([B1], { status: 'completed' });
    await user.click(screen.getByRole('button', { name: /Job status: .*Completed/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Ready to cut' })).not.toHaveAccessibleDescription('Locks construction');
  });

  it('Jobs → Mark as: the hint, the toast, and Undo back to draft', async () => {
    const user = await open('#/jobs', { cabinets: [B1] });
    const row = await screen.findByRole('row', { name: /Kitchen remodel/ });
    await user.click(within(row).getByRole('button', { name: 'More actions for Kitchen remodel' }));
    const markAs = screen.getByRole('group', { name: 'Mark as' });
    const ready = within(markAs).getByRole('menuitem', { name: 'Ready to cut' });
    expect(ready).toHaveAccessibleDescription('Locks construction');
    await user.click(ready);
    expect(toastText()).toContain('Marked ready to cut. Construction is locked.');
    await waitFor(async () => expect((await db.getJob('j-0014')).status).toBe('ready'));
    await user.click(within(document.querySelector<HTMLElement>('.toast')!).getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.getJob('j-0014')).status).toBe('draft'));
  });
});
