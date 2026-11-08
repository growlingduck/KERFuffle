import { inches } from '@kerfuffle/engine';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { CabinetRecord, JobRecord } from '../src/data/types';
import { testCabinet, testJob, useTestDatabase } from './storage';

/** Not a React hook, despite the name. */
const seedDatabase = useTestDatabase;

/** The five-cabinet sample job from docs/wireframes/CutList.dc.html. */
const SAMPLE: CabinetRecord[] = [
  testCabinet('c-b1', 'B1', { width: inches(30), height: inches(36), finishedEnds: 'left' }),
  testCabinet('c-b2', 'B2', { width: inches(42), height: inches(36) }),
  testCabinet('c-b3', 'B3', { width: inches(18), height: inches(36), finishedEnds: 'right', quantity: 2 }),
  testCabinet('c-w1', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2, finishedEnds: 'both' }),
  testCabinet('c-w2', 'W2', { type: 'wall', width: inches(15), height: inches(30), depth: inches(12.25), shelfCount: 2, finishedEnds: 'right' }),
];

async function openCutList(job: Partial<JobRecord> = {}) {
  await seedDatabase([testJob({ cabinets: SAMPLE, ...job })]);
  window.location.hash = '#/jobs/j-0014/cut-list';
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
  return { user, ...view };
}

const sheet = () => document.querySelector<HTMLElement>('[data-sheet="1"]')!;
const row = (mark: string) => sheet().querySelector<HTMLTableRowElement>(`tr[data-mark="${mark}"]`);
const marks = () => [...sheet().querySelectorAll<HTMLElement>('tr[data-mark]')].map((tr) => tr.dataset.mark);
const cellsOf = (mark: string) => [...(row(mark)?.querySelectorAll('td') ?? [])].slice(2).map((td) => td.textContent);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cut list screen', () => {
  it('shows the merged list with marks, sizes and where each cut comes from', async () => {
    await openCutList();
    expect(marks()).toHaveLength(26);
    expect(cellsOf('P4')).toEqual(['Left side / Right side', 'grain up and down', '30 1/2″', '23 1/4″', '8', 'B1×2, B2×2, B3×4']);
    expect(cellsOf('L3')).toEqual(['Left side / Right side', 'grain up and down', '32 1/2″', '26″', '3', 'B1, B3×2']);
    expect(within(sheet()).getByRole('region', { name: 'Birch plywood 3/4″ · 3/4″ thick' })).toBeInTheDocument();
    expect(within(sheet()).getByRole('region', { name: 'HPL laminate 48 × 96 · 1″ oversize each edge' })).toBeInTheDocument();
  });

  it('prints its options, revision, date and sheet number in the title block', async () => {
    await openCutList({ revision: 7, status: 'ready' });
    const page = sheet();
    expect(page).toHaveTextContent('Identical parts merged · fronts included · inches');
    expect(page).toHaveTextContent(/Rev\.△7/);
    expect(page).toHaveTextContent(/Printed\d{4}-\d{2}-\d{2}/);
    expect(page).toHaveTextContent('Sheet1 / 1');
    expect(page).toHaveTextContent('Contents6 boxes · 56 pieces');
    expect(page).toHaveTextContent('Ready to cut');
    expect(within(page).queryByText('DRAFT')).toBeNull();
  });

  it('stamps a Draft job DRAFT', async () => {
    await openCutList({ status: 'draft' });
    expect(within(sheet()).getByLabelText('Draft: not ready to cut')).toHaveTextContent('DRAFT');
  });

  it('remembers the fronts switch per job, and keeps the marks', async () => {
    const { user, unmount } = await openCutList();
    const fronts = screen.getByRole('switch', { name: /Include fronts/ });
    expect(fronts).toHaveAttribute('aria-checked', 'true');
    expect(cellsOf('P2')?.[0]).toBe('Back / Front');

    await user.click(fronts);
    expect(fronts).toHaveAttribute('aria-checked', 'false');
    expect(cellsOf('P2')).toEqual(['Back', 'grain up and down', '30 1/2″', '42″', '1', 'B2']);
    expect(sheet()).toHaveTextContent('fronts left out');
    expect(marks()).toHaveLength(26);

    unmount();
    render(<App />);
    await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
    expect(screen.getByRole('switch', { name: /Include fronts/ })).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('kerfuffle.cutlist.includeFronts.j-0014')).toBe('false');
    expect(window.localStorage.getItem('kerfuffle.cutlist.includeFronts.other-job')).toBeNull();
  });

  it('re-sorts without moving the marks', async () => {
    const { user } = await openCutList();
    const panels = within(sheet()).getByRole('region', { name: 'Birch plywood 3/4″ · 3/4″ thick' });
    const lengthHeader = within(panels).getByRole('columnheader', { name: /Length/ });
    expect(lengthHeader).toHaveAttribute('aria-sort', 'descending');
    const before = new Map([...sheet().querySelectorAll<HTMLElement>('tr[data-mark]')].map((tr) => [tr.dataset.mark, tr.textContent]));

    await user.click(within(panels).getByRole('button', { name: /Qty/ }));
    expect(within(panels).getByRole('columnheader', { name: /Qty/ })).toHaveAttribute('aria-sort', 'descending');
    expect(lengthHeader).toHaveAttribute('aria-sort', 'none');
    expect(marks()[0]).toBe('P4');
    for (const tr of sheet().querySelectorAll<HTMLElement>('tr[data-mark]')) expect(tr.textContent).toBe(before.get(tr.dataset.mark));

    await user.click(within(panels).getByRole('button', { name: /Qty/ }));
    expect(within(panels).getByRole('columnheader', { name: /Qty/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('lists by cabinet with thickness and build count', async () => {
    const { user } = await openCutList();
    await user.click(screen.getByRole('button', { name: 'By cabinet' }));
    expect(sheet()).toHaveTextContent('Listed by cabinet');
    const b3 = within(sheet()).getByRole('region', { name: 'B3 · Base' });
    expect(b3).toHaveTextContent('18″ W × 36″ H × 24″ D · build 2');
    expect(within(b3).getByRole('columnheader', { name: 'Thick.' })).toBeInTheDocument();
    expect([...b3.querySelectorAll<HTMLElement>('tr[data-mark]')].map((tr) => tr.dataset.mark)).toEqual(['P5', 'P14', 'P4', 'P4', 'P14', 'P5', 'P15', 'L3', 'L4']);
  });

  it('by cabinet, the chips are an index: each names its sheet and goes to its cabinet', async () => {
    const { user } = await openCutList();
    await user.click(screen.getByRole('button', { name: 'By cabinet' }));
    const chip = await waitFor(() => {
      const found = within(sheet()).getByRole('button', { name: /^B3/ });
      expect(found).toHaveTextContent(/sheet \d+/);
      return found;
    });
    // Nothing to trace or pin: each cabinet already has its own section.
    expect(chip).not.toHaveAttribute('aria-pressed');
    fireEvent.pointerEnter(chip);
    expect(document.querySelector('[data-dimmed]')).toBeNull();

    await user.click(chip);
    const b3 = within(sheet()).getByRole('region', { name: 'B3 · Base' });
    expect(b3).toHaveFocus();
    expect(b3).toHaveAttribute('data-flash');
  });

  it('traces a cabinet from its chip and pins it', async () => {
    const { user } = await openCutList();
    const chip = within(sheet()).getByRole('button', { name: /^B2/ });
    fireEvent.pointerEnter(chip);
    expect(row('P1')).not.toHaveAttribute('data-dimmed');
    expect(row('P3')).toHaveAttribute('data-dimmed');
    fireEvent.pointerLeave(chip);
    expect(row('P3')).not.toHaveAttribute('data-dimmed');

    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(row('P3')).toHaveAttribute('data-dimmed');
    await user.click(within(sheet()).getByRole('button', { name: 'Show all' }));
    expect(row('P3')).not.toHaveAttribute('data-dimmed');
  });

  it('sketches the row pointed at or pinned, with totals beside it', async () => {
    const { user } = await openCutList();
    const rail = screen.getByRole('complementary', { name: 'Part sketch, totals and materials' });
    expect(rail).toHaveTextContent('First row');
    expect(within(rail).getByRole('img')).toHaveAccessibleName('Bottom / Top, 40 1/2″ long by 23 1/4″ wide, grain along the length');

    await user.click(within(sheet()).getByRole('button', { name: 'L3: sketch Left side / Right side' }));
    expect(rail).toHaveTextContent('Pinned · Laminate');
    expect(rail).toHaveTextContent('from B1, B3×2');
    expect(within(sheet()).getByRole('button', { name: /^B3/ }).className).toContain('chipHot');
    expect(rail).toHaveTextContent(/Boxes to build6Panel pieces44Laminate pieces12Distinct cuts26/);
  });

  it('leaves out cabinets that need a fix, and says so on screen and on the sheet', async () => {
    const broken = SAMPLE.map((c) => (c.label === 'B3' ? { ...c, width: inches(1) } : c));
    await openCutList({ cabinets: broken });
    expect(screen.getByRole('alert')).toHaveTextContent('B3 needs a fix');
    expect(sheet()).toHaveTextContent('Excludes B3: needs a fix');
    expect(sheet()).toHaveTextContent('Contents4 boxes');
    expect(within(sheet()).getByRole('button', { name: /^B3/ })).toHaveTextContent('needs a fix, not listed');
  });

  it('exports a CSV with a BOM and confirms it', async () => {
    let saved: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:cut-list';
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = await openCutList();

    await user.click(screen.getByRole('button', { name: 'Export CSV…' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'CSV saved' })).toBeInTheDocument());
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText('Downloaded “Kitchen remodel – cut list.csv”')).toBeInTheDocument();
    const bytes = new Uint8Array(await saved!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await saved!.text()).toContain('P4,Left side / Right side,panel,30 1/2″,23 1/4″,3/4″,30.5,23.25,0.75,8,"B1×2, B2×2, B3×4"');
  });

  it('prints with Print… and Ctrl+P', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = await openCutList();
    await user.click(screen.getByRole('button', { name: /Print…/ }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    await user.keyboard('{Control>}p{/Control}');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
  });

  it('prints from the workspace with Ctrl+P', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await seedDatabase([testJob({ cabinets: SAMPLE })]);
    window.location.hash = '#/jobs/j-0014/workspace';
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument());
    await user.keyboard('{Control>}p{/Control}');
    await waitFor(() => expect(window.location.hash).toBe('#/jobs/j-0014/cut-list'));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
  });

  it('has no serious or critical accessibility violations', async () => {
    const { user, container } = await openCutList();
    await user.click(within(sheet()).getByRole('button', { name: 'P4: sketch Left side / Right side' }));
    await act(async () => {});
    const results = await axe.run(container, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } });
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)).toEqual([]);
    // axe over the whole printed sheet takes ~2 s alone and several times that when the suite runs in parallel.
  }, 20_000);
});
