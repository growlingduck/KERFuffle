import { DEFAULT_RULES, inches } from '@kerfuffle/engine';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import type { JobRecord } from '../src/data/types';
import { formatEdited } from '../src/lib/relativeDate';
import { resetRegisterView } from '../src/state/register';
import { dismissToast, toastStore } from '../src/state/toast';
import { testCabinet, testJob, useTestDatabase } from './storage';

/** "Now" for every test: Oct 31, 2026, 3:00 PM local time. */
const NOW = new Date(2026, 9, 31, 15, 0);
const at = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();
/** A job's own rules that differ from the shop defaults (3/4″ panels). */
const OWN_RULES = { ...DEFAULT_RULES, panelThickness: inches(23 / 32) };

function seedJobs(): JobRecord[] {
  return [
    testJob({
      id: 'k',
      number: 14,
      name: 'Kitchen remodel',
      customer: 'Smith',
      status: 'draft',
      notes: 'Island deferred.',
      updatedAt: at(10, 31, 9, 41),
      cabinets: [
        testCabinet('k1', 'B1'),
        testCabinet('k2', 'B2', { quantity: 2, finishedEnds: 'left' }),
        testCabinet('k3', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 }),
      ],
    }),
    testJob({ id: 'l', number: 13, name: 'Laundry room built-ins', customer: 'Jones', status: 'ready', updatedAt: at(10, 30, 16, 12), cabinets: [testCabinet('l1', 'B1')] }),
    testJob({
      id: 'g',
      number: 12,
      name: 'Garage wall cabinets',
      customer: 'Shop',
      status: 'ready',
      updatedAt: at(10, 21),
      rules: OWN_RULES,
      cabinets: [1, 2, 3].map((n) => testCabinet(`g${n}`, `W${n}`, { type: 'wall', width: inches(36), height: inches(30), depth: inches(12) })),
    }),
    testJob({
      id: 'v',
      number: 11,
      name: 'Bathroom vanity',
      customer: 'Smith',
      status: 'completed',
      updatedAt: at(10, 9),
      // B2 is shorter than the toe kick plus countertop: an error, so a dashed placeholder with no parts.
      cabinets: [testCabinet('v1', 'B1'), testCabinet('v2', 'B2', { height: inches(3) })],
    }),
    testJob({ id: 'o', number: 9, name: 'Office storage', customer: null, status: 'archived', updatedAt: at(8, 30), cabinets: [] }),
  ];
}

let db: MemoryStorageClient;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.location.hash = '#/jobs';
  resetRegisterView();
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  db = await useTestDatabase(seedJobs());
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderJobs() {
  const user = userEvent.setup();
  render(<App />);
  // Let the full records (engine totals, invalid cabinets) load.
  await act(async () => {});
  return user;
}

const table = () => screen.getByRole('table');
const bodyRows = () => [...table().querySelectorAll<HTMLElement>('tbody tr')];
const rowLink = (row: HTMLElement) => row.querySelector<HTMLAnchorElement>('[data-row-link]')!;
const rowNames = () => bodyRows().map((r) => rowLink(r).textContent);
function row(name: string): HTMLElement {
  const found = bodyRows().find((r) => rowLink(r).textContent === name);
  if (!found) throw new Error(`No row for ${name}; rows are ${rowNames().join(', ')}`);
  return found;
}
const marks = (el: HTMLElement) => [...el.querySelectorAll('mark')].map((m) => m.textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search' });
const showButton = (name: RegExp) => within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name });
const preview = () => screen.getByRole('complementary', { name: 'Job preview' });
function previewCell(label: string): string | null {
  return within(preview()).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}
/** The toast itself (the toast host is one of several role="status" regions on the page). */
const toast = () => document.querySelector<HTMLElement>('.toast')!;

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(row(name)).getByRole('button', { name: `More actions for ${name}` }));
  return screen.getByRole('menu', { name: `More actions for ${name}` });
}

describe('Jobs register', () => {
  it('lists active jobs, newest first, with relative last-edited dates and box counts', async () => {
    await renderJobs();
    expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
    expect(rowNames()).toEqual(['Kitchen remodel', 'Laundry room built-ins', 'Garage wall cabinets', 'Bathroom vanity']);

    const kitchen = row('Kitchen remodel');
    expect(within(kitchen).getByText('J-0014')).toBeInTheDocument();
    expect(within(kitchen).getByText('Draft')).toBeInTheDocument();
    expect(kitchen.querySelector('.cabinets')).toHaveTextContent('4 cabinets');
    expect(kitchen.querySelector('time')).toHaveAttribute('dateTime', at(10, 31, 9, 41));
    expect(formatEdited(at(10, 31, 9, 41), NOW, 'en-US')).toBe('Today, 9:41 AM');
    expect(within(kitchen).getByText(formatEdited(at(10, 31, 9, 41), NOW))).toBeInTheDocument();
    expect(within(row('Laundry room built-ins')).getByText(formatEdited(at(10, 30, 16, 12), NOW))).toBeInTheDocument();
    expect(within(row('Garage wall cabinets')).getByText(formatEdited(at(10, 21), NOW))).toBeInTheDocument();

    // The strip draws one box per cabinet × quantity.
    expect(kitchen.querySelectorAll('svg.strip rect')).toHaveLength(4);
  });

  it('highlights search matches in the name and customer, and finds job numbers', async () => {
    const user = await renderJobs();
    await user.type(search(), 'smi');
    expect(rowNames()).toEqual(['Kitchen remodel', 'Bathroom vanity']);
    expect(marks(row('Kitchen remodel'))).toEqual(['Smi']);

    await user.clear(search());
    await user.type(search(), 'ROOM');
    expect(rowNames()).toEqual(['Laundry room built-ins', 'Bathroom vanity']);
    expect(marks(row('Laundry room built-ins'))).toEqual(['room']);
    expect(marks(row('Bathroom vanity'))).toEqual(['room']);

    await user.clear(search());
    await user.type(search(), 'e');
    // Every occurrence is marked, in the original case.
    expect(marks(row('Kitchen remodel'))).toEqual(['e', 'e', 'e']);

    await user.clear(search());
    await user.type(search(), 'j-0012');
    expect(rowNames()).toEqual(['Garage wall cabinets']);
    expect(marks(row('Garage wall cabinets'))).toEqual(['J-0012']);
  });

  it('/ focuses the search, Esc and × clear it, and no matches offers Clear search', async () => {
    const user = await renderJobs();
    expect(screen.getByText('/', { selector: 'kbd' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(search()).toHaveFocus();

    await user.keyboard('zzz');
    expect(rowNames()).toEqual([]);
    expect(screen.getByText('No jobs match “zzz”.')).toBeInTheDocument();
    const [clearIcon, clearButton] = screen.getAllByRole('button', { name: 'Clear search' });
    expect(clearIcon).toBeDefined();
    await user.click(clearButton!);
    expect(search()).toHaveValue('');
    expect(search()).toHaveFocus();
    expect(rowNames()).toHaveLength(4);

    await user.keyboard('kit');
    expect(rowNames()).toEqual(['Kitchen remodel']);
    await user.keyboard('{Escape}');
    expect(search()).toHaveValue('');

    await user.keyboard('lau');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search()).toHaveValue('');
  });

  it('shows live counts in the Show control and filters by it', async () => {
    const user = await renderJobs();
    expect(showButton(/^Active/)).toHaveAccessibleName('Active 4');
    expect(showButton(/^Active/)).toHaveAttribute('aria-pressed', 'true');
    expect(showButton(/^All/)).toHaveAccessibleName('All 5');
    expect(showButton(/^Archived/)).toHaveAccessibleName('Archived 1');

    await user.click(showButton(/^Archived/));
    expect(showButton(/^Archived/)).toHaveAttribute('aria-pressed', 'true');
    expect(rowNames()).toEqual(['Office storage']);
    await user.click(showButton(/^All/));
    expect(rowNames()).toHaveLength(5);

    // Counts ignore the search but follow status changes.
    await user.type(search(), 'kitchen');
    expect(showButton(/^All/)).toHaveAccessibleName('All 5');
    await openRowMenu(user, 'Kitchen remodel');
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(showButton(/^Active/)).toHaveAccessibleName('Active 3');
    expect(showButton(/^Archived/)).toHaveAccessibleName('Archived 2');
  });

  it('sorts by Job, Status and Last edited, toggling direction with ▲/▼ and aria-sort', async () => {
    const user = await renderJobs();
    const header = (name: string) => screen.getByRole('button', { name }).closest('th')!;
    expect(header('Last edited')).toHaveAttribute('aria-sort', 'descending');
    expect(header('Job')).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: 'Job' }));
    expect(header('Job')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Job')).toHaveTextContent('Job▲');
    expect(header('Last edited')).toHaveAttribute('aria-sort', 'none');
    expect(rowNames()).toEqual(['Bathroom vanity', 'Garage wall cabinets', 'Kitchen remodel', 'Laundry room built-ins']);

    await user.click(screen.getByRole('button', { name: 'Job' }));
    expect(header('Job')).toHaveAttribute('aria-sort', 'descending');
    expect(header('Job')).toHaveTextContent('Job▼');
    expect(rowNames()).toEqual(['Laundry room built-ins', 'Kitchen remodel', 'Garage wall cabinets', 'Bathroom vanity']);

    await user.click(screen.getByRole('button', { name: 'Status' }));
    expect(header('Status')).toHaveAttribute('aria-sort', 'ascending');
    // Draft, Ready to cut (newest first), Completed.
    expect(rowNames()).toEqual(['Kitchen remodel', 'Laundry room built-ins', 'Garage wall cabinets', 'Bathroom vanity']);

    await user.click(screen.getByRole('button', { name: 'Last edited' }));
    expect(header('Last edited')).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: 'Last edited' }));
    expect(header('Last edited')).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['Bathroom vanity', 'Garage wall cabinets', 'Laundry room built-ins', 'Kitchen remodel']);
  });
});

describe('Job preview', () => {
  it('previews the first row, then whichever row is pointed at or focused, with totals from the engine', async () => {
    await renderJobs();
    expect(previewCell('No.')).toBe('J-0014');
    // B1, B2 ×2 (left end finished) and W1: totals counted by calculateParts with the job's rules.
    await waitFor(() => expect(previewCell('Panel pcs')).toBe('25'));
    expect(previewCell('Boxes')).toBe('4');
    expect(previewCell('Laminate pcs')).toBe('6');
    expect(previewCell('Customer')).toBe('Smith');
    expect(previewCell('Notes')).toBe('Island deferred.');
    expect(within(preview()).getByRole('img')).toHaveAccessibleName(
      'Kitchen remodel elevation: 3 base cabinets and 1 wall cabinet, base run 7′-6″.',
    );
    expect(within(preview()).getByText('BASE RUN 7′-6″')).toBeInTheDocument();
    expect(within(preview()).getByRole('link', { name: 'Open job' })).toHaveAttribute('href', '#/jobs/k/workspace');
    expect(within(preview()).getByRole('link', { name: 'Cut list' })).toHaveAttribute('href', '#/jobs/k/cut-list');

    fireEvent.mouseEnter(row('Laundry room built-ins'));
    expect(previewCell('No.')).toBe('J-0013');
    expect(previewCell('Notes')).toBe('No notes.');

    act(() => rowLink(row('Garage wall cabinets')).focus());
    expect(previewCell('No.')).toBe('J-0012');
    // Walls only: no base run.
    expect(within(preview()).getByRole('img')).toHaveAccessibleName('Garage wall cabinets elevation: 0 base cabinets and 3 wall cabinets.');
  });

  it('draws invalid cabinets as dashed placeholders and leaves their parts out of the totals', async () => {
    await renderJobs();
    const vanity = row('Bathroom vanity');
    await waitFor(() => expect(vanity.querySelectorAll('rect[data-invalid]')).toHaveLength(1));
    fireEvent.mouseEnter(vanity);
    await waitFor(() => expect(previewCell('Panel pcs')).toBe('6'));
    expect(previewCell('Boxes')).toBe('2');
    expect(preview().querySelectorAll('svg [data-invalid]')).toHaveLength(1);
    expect(within(preview()).getByRole('img')).toHaveAccessibleName(/1 cabinet has errors and is drawn dashed\./);
    expect(within(preview()).getByText(/B2 has errors, so its parts aren’t counted\./)).toBeInTheDocument();
  });
});

describe('Duplicate', () => {
  it('copies with the next number, as Draft, keeping the source job’s own rules, and offers Open', async () => {
    const user = await renderJobs();
    await openRowMenu(user, 'Garage wall cabinets');
    await user.click(screen.getByRole('menuitem', { name: /^Duplicate/ }));

    await waitFor(() => expect(rowNames()[0]).toBe('Garage wall cabinets (copy)'));
    const copyRow = row('Garage wall cabinets (copy)');
    expect(within(copyRow).getByText('J-0015')).toBeInTheDocument();
    expect(within(copyRow).getByText('Draft')).toBeInTheDocument();
    expect(copyRow.className).toContain('fresh');
    expect(previewCell('No.')).toBe('J-0015');
    expect(toast()).toHaveTextContent('Duplicated as “Garage wall cabinets (copy)”');

    const copyId = copyRow.dataset.jobId!;
    const saved = await db.getJob(copyId);
    expect(saved.rules.panelThickness).toBe(inches(23 / 32));
    expect(saved.createdAt).toBe(NOW.toISOString());
    expect(saved.cabinets.map((c) => c.label)).toEqual(['W1', 'W2', 'W3']);

    await user.click(within(toast()).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Garage wall cabinets (copy)' })).toBeInTheDocument());
  });

  it('Ctrl+D duplicates the focused job, and does nothing when no row has focus', async () => {
    await renderJobs();
    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true });
    await act(async () => {});
    expect(rowNames()).toHaveLength(4);

    const link = rowLink(row('Laundry room built-ins'));
    act(() => link.focus());
    fireEvent.keyDown(link, { key: 'd', ctrlKey: true });
    await waitFor(() => expect(rowNames()).toContain('Laundry room built-ins (copy)'));
    expect(within(row('Laundry room built-ins (copy)')).getByText('Draft')).toBeInTheDocument();
  });

  it('the preview’s Duplicate button duplicates the previewed job', async () => {
    const user = await renderJobs();
    await user.click(within(preview()).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(rowNames()[0]).toBe('Kitchen remodel (copy)'));
  });
});

describe('Archive and status changes', () => {
  it('archive slides the row out and moves focus on; Undo still works after the filter changes', async () => {
    const user = await renderJobs();
    await openRowMenu(user, 'Kitchen remodel');
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(row('Kitchen remodel').className).toContain('leaving');
    expect(toast()).toHaveTextContent('Archived “Kitchen remodel”');
    await waitFor(() => expect(rowNames()).not.toContain('Kitchen remodel'));
    expect(rowLink(row('Laundry room built-ins'))).toHaveFocus();
    await waitFor(async () => expect((await db.getJob('k')).status).toBe('archived'));

    // Change the filter, then undo from the same toast.
    await user.click(showButton(/^Archived/));
    expect(rowNames()).toEqual(['Kitchen remodel', 'Office storage']);
    await user.click(within(toast()).getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect((await db.getJob('k')).status).toBe('draft'));
    expect(rowNames()).toEqual(['Office storage']);

    await user.click(showButton(/^Active/));
    expect(within(row('Kitchen remodel')).getByText('Draft')).toBeInTheDocument();
  });

  it('Mark as changes the status in place, with Undo', async () => {
    const user = await renderJobs();
    const menu = await openRowMenu(user, 'Kitchen remodel');
    const markAs = within(menu).getByRole('group', { name: 'Mark as' });
    expect(within(markAs).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['◆Ready to cut', '✓Completed']);

    await user.click(within(markAs).getByRole('menuitem', { name: 'Ready to cut' }));
    expect(within(row('Kitchen remodel')).getByText('Ready to cut')).toBeInTheDocument();
    expect(row('Kitchen remodel').className).not.toContain('leaving');
    expect(toast()).toHaveTextContent('Marked ready to cut');
    await waitFor(async () => expect((await db.getJob('k')).status).toBe('ready'));

    await user.click(within(toast()).getByRole('button', { name: 'Undo' }));
    expect(within(row('Kitchen remodel')).getByText('Draft')).toBeInTheDocument();
    await waitFor(async () => expect((await db.getJob('k')).status).toBe('draft'));
  });

  it('Restore from archive brings a job back as Draft', async () => {
    const user = await renderJobs();
    await user.click(showButton(/^Archived/));
    await openRowMenu(user, 'Office storage');
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Restore from archive' }));
    expect(toast()).toHaveTextContent('Restored “Office storage” from archive');
    await waitFor(() => expect(screen.getByText('Nothing archived yet.')).toBeInTheDocument());
    await waitFor(async () => expect((await db.getJob('o')).status).toBe('draft'));
  });
});

describe('Keyboard and navigation', () => {
  it('↑/↓ move between rows and Enter opens the job', async () => {
    const user = await renderJobs();
    const kitchen = rowLink(row('Kitchen remodel'));
    act(() => kitchen.focus());
    await user.keyboard('{ArrowDown}');
    expect(rowLink(row('Laundry room built-ins'))).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(kitchen).toHaveFocus();

    // Tab reaches the row's actions; ↑/↓ from there still move by row.
    await user.tab();
    expect(within(row('Kitchen remodel')).getByRole('link', { name: 'Open Kitchen remodel' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(rowLink(row('Laundry room built-ins'))).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Laundry room built-ins' })).toBeInTheDocument());
    expect(window.location.hash).toBe('#/jobs/l/workspace');
  });

  it('coming back from a job restores the filter, sort and scroll position', async () => {
    const scrollTo = vi.fn();
    const originalScrollTo = window.scrollTo;
    window.scrollTo = scrollTo as typeof window.scrollTo;
    try {
      const user = await renderJobs();
      await user.click(showButton(/^All/));
      await user.click(screen.getByRole('button', { name: 'Job' }));
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
      fireEvent.scroll(window);

      await user.click(within(row('Kitchen remodel')).getByRole('link', { name: 'Open Kitchen remodel' }));
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Kitchen remodel' })).toBeInTheDocument());
      expect(scrollTo).not.toHaveBeenCalled();

      await user.click(screen.getByRole('link', { name: 'Jobs' }));
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument());
      expect(showButton(/^All/)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Job' }).closest('th')).toHaveAttribute('aria-sort', 'ascending');
      expect(rowNames()[0]).toBe('Bathroom vanity');
      expect(scrollTo).toHaveBeenCalledWith(0, 640);
    } finally {
      window.scrollTo = originalScrollTo;
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    }
  });

  it('row Open and Cut list links go to that job', async () => {
    await renderJobs();
    const laundry = row('Laundry room built-ins');
    expect(within(laundry).getByRole('link', { name: 'Open Laundry room built-ins' })).toHaveAttribute('href', '#/jobs/l/workspace');
    expect(within(laundry).getByRole('link', { name: 'Cut list for Laundry room built-ins' })).toHaveAttribute('href', '#/jobs/l/cut-list');
    expect(rowLink(laundry)).toHaveAttribute('href', '#/jobs/l/workspace');
  });
});

describe('New job', () => {
  it('Ctrl+N opens it; an empty name is flagged and focused; a duplicate name is only a note; Esc closes', async () => {
    const user = await renderJobs();
    fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'New job' });
    expect(within(dialog).getByText('J-0015 · STARTS AS DRAFT')).toBeInTheDocument();
    const name = within(dialog).getByLabelText('Job name');
    expect(name).toHaveFocus();
    expect(await within(dialog).findByText('Panel 3/4″')).toBeInTheDocument();
    expect(within(dialog).getByText('Construction · copied from shop defaults')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Create and open' }));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('⚠ Give the job a name');
    expect(name).toHaveFocus();
    expect(await db.listJobs()).toHaveLength(5);

    await user.type(name, '  kitchen REMODEL ');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(name).toHaveAccessibleDescription('△ A job with this name already exists. That’s allowed.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await db.listJobs()).toHaveLength(5);
  });

  it('creates an empty job from the shop defaults and opens it', async () => {
    const user = await renderJobs();
    const newButton = screen.getByRole('button', { name: 'New job' });
    await user.click(newButton);
    const dialog = screen.getByRole('dialog', { name: 'New job' });
    await user.type(within(dialog).getByLabelText('Job name'), 'Pantry');
    await user.type(within(dialog).getByLabelText(/Customer or project/), 'Lee');
    await user.type(within(dialog).getByLabelText(/Notes/), 'Pull-outs');
    await user.click(within(dialog).getByRole('button', { name: 'Create and open' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Pantry' })).toBeInTheDocument());
    const created = (await db.listJobs()).find((j) => j.name === 'Pantry')!;
    expect(created).toMatchObject({ number: 15, customer: 'Lee', notes: 'Pull-outs', status: 'draft', cabinetCount: 0 });
    expect((await db.getJob(created.id)).rules).toEqual(DEFAULT_RULES);
  });

  it('“Start with” a copy takes that job’s cabinets and own rules under the new name', async () => {
    const user = await renderJobs();
    await user.click(screen.getByRole('button', { name: 'New job' }));
    const dialog = screen.getByRole('dialog', { name: 'New job' });
    await user.type(within(dialog).getByLabelText('Job name'), 'Garage, east wall');
    await user.selectOptions(within(dialog).getByLabelText('Start with'), 'A copy of “Garage wall cabinets” (J-0012)');
    expect(within(dialog).getByText('Construction · copied from “Garage wall cabinets”')).toBeInTheDocument();
    expect(await within(dialog).findByText('Panel 23/32″')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create and open' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Workspace: Garage, east wall' })).toBeInTheDocument());
    const jobs = await db.listJobs();
    expect(jobs.map((j) => j.name)).not.toContain('Garage wall cabinets (copy)');
    const created = jobs.find((j) => j.name === 'Garage, east wall')!;
    expect(created).toMatchObject({ status: 'draft', customer: null, cabinetCount: 3 });
    expect((await db.getJob(created.id)).rules.panelThickness).toBe(inches(23 / 32));
  });
});

describe('Empty states', () => {
  it('first run says how to start', async () => {
    await useTestDatabase([]);
    await renderJobs();
    expect(screen.getByText('No jobs yet. Start one with New job.')).toBeInTheDocument();
    expect(within(preview()).getByText('Point at a job to preview it.')).toBeInTheDocument();
  });
});
