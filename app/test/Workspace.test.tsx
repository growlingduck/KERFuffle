import { inches } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { jobSession } from '../src/data/storage';
import type { CabinetRecord } from '../src/data/types';
import { historyStore } from '../src/workspace/history';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { testCabinet, testJob, useTestDatabase } from './storage';

/** Not a React hook, despite the name. */
const seedDatabase = useTestDatabase;

/** The worked examples in docs/calculation-rules.md. */
const B1 = testCabinet('c-b1', 'B1', { height: inches(36), finishedEnds: 'left' });
const B2 = testCabinet('c-b2', 'B2', { width: inches(42), height: inches(36) });
const W1 = testCabinet('c-w1', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2, finishedEnds: 'both' });

let client: MemoryStorageClient;

async function openWorkspace(cabinets: CabinetRecord[] = [B1, B2, W1]) {
  client = await seedDatabase([testJob({ cabinets })]);
  window.location.hash = '#/jobs/j-0014/workspace';
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument());
  return { user, ...view };
}

const input = (label: RegExp | string) => screen.getByLabelText<HTMLInputElement>(label, { selector: 'input' });
const row = (role: string) => document.querySelector<HTMLTableRowElement>(`tr[data-role="${role}"]`);
const cells = (role: string) =>
  ['L', 'W', 'T', 'qty'].map((col) => row(role)?.querySelector(`td[data-col="${col}"]`)?.textContent ?? null);
const tracedCells = () =>
  [...document.querySelectorAll<HTMLElement>('td[data-traced]')].map((td) => `${td.closest('tr')?.dataset.role}.${td.dataset.col}`).sort();
const dim = (key: string) => document.querySelector<SVGGElement>(`[data-dim="${key}"] > g`);
const cabinetRows = () => [...document.querySelectorAll<HTMLElement>('[data-cabinet-id]')].map((li) => li.dataset.cabinetId);

describe('job workspace', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('numbers on screen match docs/calculation-rules.md', () => {
    it('base 30 × 36 × 24, 1 shelf, left end', async () => {
      await openWorkspace();
      expect(cells('back')).toEqual(['30 1/2', '30', '3/4', '1']);
      expect(cells('bottom')).toEqual(['28 1/2', '23 1/4', '3/4', '1']);
      expect(cells('side-left')).toEqual(['30 1/2', '23 1/4', '3/4', '1']);
      expect(cells('top')).toEqual(['28 1/2', '23 1/4', '3/4', '1']);
      expect(cells('front')).toEqual(['30 1/2', '30', '3/4', '1']);
      expect(cells('shelf')).toEqual(['28 1/4', '23 1/8', '3/4', '1']);
      expect(cells('laminate-side-left')).toEqual(['32 1/2', '26', null, '1']);
      expect(row('laminate-side-right')).toBeNull();
      expect(cells('laminate-front')).toEqual(['32 1/2', '32', null, '1']);
      expect(screen.getByText('Box height').parentElement).toHaveTextContent('36″ − 4″ − 1 1/2″ = 30 1/2″');
    });

    it('wall 30 × 30 × 12, 2 shelves, both ends', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: /^W1/ }));
      expect(cells('back')).toEqual(['30', '30', '3/4', '1']);
      expect(cells('bottom')).toEqual(['28 1/2', '11 1/4', '3/4', '1']);
      expect(cells('side-left')).toEqual(['30', '11 1/4', '3/4', '1']);
      expect(cells('side-right')).toEqual(['30', '11 1/4', '3/4', '1']);
      expect(cells('top')).toEqual(['28 1/2', '11 1/4', '3/4', '1']);
      expect(cells('front')).toEqual(['30', '30', '3/4', '1']);
      expect(cells('shelf')).toEqual(['28 1/4', '11 1/8', '3/4', '2']);
      expect(cells('laminate-side-left')).toEqual(['32', '14', null, '1']);
      expect(cells('laminate-side-right')).toEqual(['32', '14', null, '1']);
      expect(cells('laminate-front')).toEqual(['32', '32', null, '1']);
    });

    it('marks the front as a reference size and notes a 1″ shelf', async () => {
      const { user } = await openWorkspace();
      expect(within(row('front')!).getByText('REF')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^B2/ }));
      expect(row('shelf')).toHaveTextContent('1″ thick: cabinet is 36″ or wider');
    });
  });

  describe('commit model', () => {
    it('typing "3", "36", "36 1/2" then blurring is one undo step and one save', async () => {
      const { user } = await openWorkspace();
      const commit = vi.spyOn(jobSession, 'commit');
      const save = vi.spyOn(client, 'saveJob');
      const height = input(/Height, overall/);
      await user.clear(height);
      await user.type(height, '3');
      await user.type(height, '6');
      await user.type(height, ' 1/2');
      // Live while typing: the tape already reads the new box height, but nothing is committed.
      expect(screen.getByText('Box height').parentElement).toHaveTextContent('36 1/2″ − 4″ − 1 1/2″ = 31″');
      expect(commit).not.toHaveBeenCalled();
      await user.tab();
      expect(commit).toHaveBeenCalledTimes(1);
      expect(historyStore.getState().past.map((e) => e.label)).toEqual(['Change height on B1']);
      await act(() => jobSession.flush());
      expect(save).toHaveBeenCalledTimes(1);
      expect(jobSession.getJob()?.cabinets[0]?.height).toBe(inches(36.5));
    });

    it('Esc reverts to the value at focus and commits nothing', async () => {
      const { user } = await openWorkspace();
      const width = input(/^Width/);
      await user.clear(width);
      await user.type(width, '40{Escape}');
      expect(width).toHaveValue('30');
      await user.tab();
      expect(historyStore.getState().past).toHaveLength(0);
    });

    it('steppers and toggles are one undo step each, named in the Undo tooltip', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: 'One more shelf' }));
      await user.click(screen.getByRole('button', { name: 'Both' }));
      expect(historyStore.getState().past.map((e) => e.label)).toEqual(['Change shelves on B1', 'Change finished ends on B1']);
      expect(screen.getByRole('button', { name: 'Undo: Change finished ends on B1' })).toBeInTheDocument();
      await user.keyboard('{Control>}z{/Control}');
      expect(screen.getByRole('button', { name: 'Neither' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Redo: Change finished ends on B1' })).toBeInTheDocument();
    });
  });

  describe('linked tracing', () => {
    it('pointing at the Width field traces the W dimension and the right cells', async () => {
      const { user } = await openWorkspace();
      await user.hover(input(/^Width/));
      expect(dim('w')).toHaveAttribute('data-traced');
      expect(dim('d')).not.toHaveAttribute('data-traced');
      expect(tracedCells()).toEqual(['back.W', 'bottom.L', 'front.W', 'laminate-front.W', 'shelf.L', 'top.L']);
      expect(document.querySelector('.caption')).toHaveTextContent('→ changes back, bottom, top, front, shelf, front laminate');
      await user.unhover(input(/^Width/));
      expect(tracedCells()).toEqual([]);
    });

    it('focus traces too, and hover beats focus', async () => {
      const { user } = await openWorkspace();
      await user.click(input(/^Depth/));
      expect(dim('d')).toHaveAttribute('data-traced');
      await user.hover(input(/^Width/));
      expect(dim('w')).toHaveAttribute('data-traced');
      expect(dim('d')).not.toHaveAttribute('data-traced');
    });

    it('clicking the D dimension focuses Depth', async () => {
      const { user } = await openWorkspace();
      await user.click(dim('d')!);
      await waitFor(() => expect(input(/^Depth/)).toHaveFocus());
    });

    it('pointing at a part fills it in both views and fades the rest', async () => {
      const { user } = await openWorkspace();
      await user.hover(row('top')!);
      const tops = document.querySelectorAll('rect[data-part="top"]');
      expect(tops).toHaveLength(2);
      tops.forEach((r) => expect(r).toHaveAttribute('data-hot'));
      expect(document.querySelector('rect[data-part="back"]')).toHaveAttribute('data-faded');
      expect(document.querySelector('.caption')).toHaveTextContent('Top28 1/2″ × 23 1/4″ × 3/4″qty 1');
    });

    it('a pinned part stays traced until unpinned or the cabinet changes', async () => {
      const { user } = await openWorkspace();
      const pin = within(row('bottom')!).getByRole('button', { name: /Bottom/ });
      await user.click(pin);
      expect(pin).toHaveAttribute('aria-pressed', 'true');
      // Pointing elsewhere and away again: still pinned.
      await user.hover(input(/^Width/));
      await user.unhover(input(/^Width/));
      await user.click(document.body);
      expect(document.querySelector('rect[data-part="bottom"]')).toHaveAttribute('data-hot');
      // Unpin.
      await user.click(within(row('bottom')!).getByRole('button', { name: /Bottom/ }));
      expect(within(row('bottom')!).getByRole('button', { name: /Bottom/ })).toHaveAttribute('aria-pressed', 'false');
      // Pin again, then change cabinet: cleared.
      await user.click(within(row('bottom')!).getByRole('button', { name: /Bottom/ }));
      await user.click(screen.getByRole('button', { name: /^B2/ }));
      expect(within(row('bottom')!).getByRole('button', { name: /Bottom/ })).toHaveAttribute('aria-pressed', 'false');
      expect(document.querySelector('rect[data-hot]')).toBeNull();
    });

    it('the drawing has a sentence for screen readers and a scale', async () => {
      await openWorkspace();
      expect(screen.getByRole('img', { name: /^Base cabinet B1, front elevation and section: 30″ wide, 36″ high, 24″ deep, 1 shelf, left end finished\.$/ })).toBeInTheDocument();
      expect(screen.getByText(/B1 · SCALE ≈ 1:\d+/)).toBeInTheDocument();
    });
  });

  describe('revision marks', () => {
    it('a width change flashes the changed cells and shows △n with what they were', async () => {
      const { user } = await openWorkspace();
      const width = input(/^Width/);
      await user.clear(width);
      await user.type(width, '32{Enter}');
      const changed = [...document.querySelectorAll<HTMLElement>('td[data-changed]')].map((td) => `${td.closest('tr')?.dataset.role}.${td.dataset.col}`).sort();
      expect(changed).toEqual(['back.W', 'bottom.L', 'front.W', 'laminate-front.W', 'shelf.L', 'top.L']);
      const delta = within(row('shelf')!).getByRole('button', { name: /Changed in revision 1/ });
      expect(delta).toHaveAccessibleName('Changed in revision 1. Was 28 1/4 × 23 1/8 × 3/4, qty 1');
      await user.hover(delta);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Was 28 1/4 × 23 1/8 × 3/4, qty 1');
      expect(within(row('side-left')!).queryByRole('button', { name: /Changed in revision/ })).toBeNull();
    });
  });

  describe('cabinet list', () => {
    it('Remove → Undo restores the same position and ID', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: 'Remove B2' }));
      await waitFor(() => expect(cabinetRows()).toEqual(['c-b1', 'c-w1']));
      expect(screen.getByText('Removed B2')).toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'Undo' }));
      expect(cabinetRows()).toEqual(['c-b1', 'c-b2', 'c-w1']);
      expect(document.querySelectorAll('.cabId')[1]).toHaveTextContent('B2');
      // The selection goes back to what it was when B2 was removed.
      expect(screen.getByRole('button', { name: /^B1/ })).toHaveAttribute('aria-current', 'true');
    });

    it('cannot remove the last cabinet', async () => {
      await openWorkspace([B1]);
      expect(screen.getByRole('button', { name: /Remove B1/ })).toHaveAttribute('aria-disabled', 'true');
    });

    it('duplicate inserts the copy after the original with the next free ID and selects it', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: 'Duplicate B1' }));
      expect(cabinetRows()[1]).not.toBe('c-b2');
      expect(screen.getByRole('heading', { name: 'Cabinet B3' })).toBeInTheDocument();
      expect(document.querySelectorAll('.cabId')[1]).toHaveTextContent('B3');
    });

    it('Add cabinet adds the current type; presets add their size', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: 'Add cabinet' }));
      expect(screen.getByRole('heading', { name: 'Cabinet B3' })).toBeInTheDocument();
      expect(input(/^Width/)).toHaveValue('24');
      await user.click(screen.getByRole('button', { name: 'Add from a preset size' }));
      await user.click(screen.getByRole('menuitem', { name: /15″ wall/ }));
      expect(screen.getByRole('heading', { name: 'Cabinet W2' })).toBeInTheDocument();
      expect(input(/^Width/)).toHaveValue('15');
      expect(input(/Height, overall/)).toHaveValue('30');
    });

    it.each([
      ['base', 'B1', '24'],
      ['wall', 'W1', '30'],
    ])('a job with no cabinets: the editor’s Add %s cabinet adds one, ready to type its width', async (type, label, width) => {
      client = await seedDatabase([testJob({ cabinets: [] })]);
      window.location.hash = '#/jobs/j-0014/workspace';
      const user = userEvent.setup();
      render(<App />);
      const editor = await screen.findByRole('region', { name: /^Cabinet editor/ });
      expect(editor).toHaveTextContent('menu in the cabinet list has preset widths');
      expect(screen.getByText('No cabinets yet. Use Add cabinet below to start.')).toBeInTheDocument();
      expect(screen.getByText('Parts appear here once the job has a cabinet.')).toBeInTheDocument();
      // The list and parts panel point the way without repeating the editor's buttons.
      expect(screen.getAllByRole('button', { name: `Add ${type} cabinet` })).toHaveLength(1);

      await user.click(within(editor).getByRole('button', { name: `Add ${type} cabinet` }));
      expect(screen.getByRole('heading', { name: `Cabinet ${label}` })).toBeInTheDocument();
      expect(input(/^Width/)).toHaveValue(width);
      expect(input(/^Width/)).toHaveFocus();
      expect(screen.getByRole('button', { name: `Undo: Add ${label}` })).toBeInTheDocument();
    });

    it('↑/↓ move the selection; Delete removes', async () => {
      const { user } = await openWorkspace();
      screen.getByRole('button', { name: /^B1/ }).focus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', { name: /^B2/ })).toHaveAttribute('aria-current', 'true');
      await waitFor(() => expect(screen.getByRole('button', { name: /^B2/ })).toHaveFocus());
      await user.keyboard('{Delete}');
      await waitFor(() => expect(cabinetRows()).toEqual(['c-b1', 'c-w1']));
    });

    it('Alt+↓ moves to the next cabinet and keeps the field', async () => {
      const { user } = await openWorkspace();
      await user.click(input(/^Depth/));
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
      expect(screen.getByRole('heading', { name: 'Cabinet B2' })).toBeInTheDocument();
      await waitFor(() => expect(input(/^Depth/)).toHaveFocus());
    });

    it('renaming to a used ID is allowed, with a warning', async () => {
      const { user } = await openWorkspace();
      const id = input('Cabinet ID');
      await user.clear(id);
      await user.type(id, 'B2');
      expect(screen.getByText(/B2 is also used by another cabinet/)).toBeInTheDocument();
      await user.tab();
      expect(jobSession.getJob()?.cabinets[0]?.label).toBe('B2');
      expect(screen.getAllByText('ID used twice')).toHaveLength(2);
    });
  });

  describe('editor', () => {
    it('switching to Wall keeps the height and hides toe kick and countertop', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: /^Construction/ }));
      expect(screen.getByText('Toe kick')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Wall' }));
      expect(input(/Height, overall/)).toHaveValue('36');
      expect(screen.queryByText('Toe kick')).toBeNull();
      expect(screen.getByText('Box height').parentElement).toHaveTextContent('36″ = 36″');
      expect(document.querySelector('[data-dim="toe"]')).toBeNull();
    });

    it('an invalid size shows the placeholder, Needs a fix, and Go to height', async () => {
      const { user } = await openWorkspace();
      const height = input(/Height, overall/);
      await user.clear(height);
      await user.type(height, '5');
      expect(screen.queryByRole('img', { name: /front elevation/ })).toBeNull();
      expect(screen.getByText('The drawing comes back once every size is valid.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^B1/ })).toHaveTextContent('Needs a fix');
      expect(screen.getByText('Parts appear when every size is valid.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Go to height' }));
      await waitFor(() => expect(height).toHaveFocus());
    });

    it('shows the shelf-thickness warning for non-3/4″ panels beside Shelves and on the shelf row', async () => {
      await useTestDatabase([testJob({ cabinets: [B1], rules: { ...testJob().rules, panelThickness: inches(23 / 32) } })]);
      window.location.hash = '#/jobs/j-0014/workspace';
      render(<App />);
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Cabinet B1' })).toBeInTheDocument());
      const message = /Panels are 23\/32\S* but shelves are listed as 3\/4/;
      expect(screen.getAllByText(message)).toHaveLength(2);
      expect(row('shelf')).toHaveTextContent(message);
      expect(screen.getByRole('button', { name: /^Construction/ })).toHaveTextContent('Differs from shop defaults (1)');
    });

    it('a matching job says so', async () => {
      await openWorkspace();
      await waitFor(() => expect(screen.getByRole('button', { name: /^Construction/ })).toHaveTextContent('Matches shop defaults'));
    });
  });

  describe('status', () => {
    it('choosing a status saves it, shows a toast, and can be undone', async () => {
      const { user } = await openWorkspace();
      await user.click(screen.getByRole('button', { name: /Job status/ }));
      await user.click(screen.getByRole('menuitemradio', { name: /Ready to cut/ }));
      expect(screen.getByText('Marked ready to cut. Construction is locked.')).toBeInTheDocument();
      expect(jobSession.getJob()?.status).toBe('ready');
      await user.click(screen.getByRole('button', { name: 'Undo: Mark job ready to cut' }));
      expect(jobSession.getJob()?.status).toBe('draft');
    });
  });

  it('the cut list warns about duplicate IDs too', async () => {
    await seedDatabase([testJob({ cabinets: [B1, { ...B2, label: 'b1' }, W1] })]);
    window.location.hash = '#/jobs/j-0014/cut-list';
    render(<App />);
    expect(await screen.findByRole('note')).toHaveTextContent('More than one cabinet uses the ID B1.');
  });
});
