import { inches } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { createMemoryClient } from '../src/data/memoryClient';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { loadShopSettings } from '../src/data/storage';
import { DEFAULTS_CHECKED_SETTING, RULES_SETTING } from '../src/data/types';
import { resetRegisterView } from '../src/state/register';
import { setDefaultsChecked } from '../src/state/shopDefaults';
import { dismissToast, toastStore } from '../src/state/toast';
import { testJob, useTestDatabase } from './storage';

/** Not a React hook, despite the name. */
const seedDatabase = useTestDatabase;

const EXAMPLE = 'Example – Small kitchen';

let db: MemoryStorageClient;

/** A database as KERFuffle finds it at startup: these jobs, and the shop settings read. */
async function startWith(jobs = [testJob()]) {
  db = await seedDatabase(jobs);
  await loadShopSettings();
}

async function renderAt(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  await act(async () => {});
  return user;
}

const banner = () => screen.queryByRole('region', { name: 'Check shop defaults' });
const toastText = () => document.querySelector('.toast')?.textContent ?? '';

beforeEach(() => {
  resetRegisterView();
  setDefaultsChecked(null);
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first run: check your shop defaults', () => {
  it('asks a new shop to check its defaults until it says they are right, including after a restart', async () => {
    await startWith([]);
    const user = await renderAt('#/jobs');
    expect(banner()).toHaveTextContent(
      'Before your first job, check your shop’s construction defaults: panel thickness, toe kick, countertop and the rest.',
    );
    expect(within(banner()!).getByRole('link', { name: 'Check defaults' })).toHaveAttribute('href', '#/settings');

    await user.click(within(banner()!).getByRole('button', { name: 'They’re right' }));
    expect(banner()).toBeNull();
    expect((await db.getShopSettings()).other[DEFAULTS_CHECKED_SETTING]).toBe(true);

    // Restart: the setting is read again from the same database.
    setDefaultsChecked(null);
    await loadShopSettings();
    await act(async () => {});
    expect(banner()).toBeNull();
  });

  it('never asks a shop that already has jobs', async () => {
    await startWith([testJob()]);
    await renderAt('#/jobs');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(banner()).toBeNull();
  });

  it('counts saving Construction in Settings as checking it', async () => {
    await startWith([]);
    const user = await renderAt('#/settings');
    await screen.findByRole('heading', { name: 'Construction defaults' });
    const panel = screen.getByLabelText<HTMLInputElement>(/^Panel thickness/);
    await user.clear(panel);
    await user.type(panel, '23/32');
    await user.click(within(screen.getByRole('region', { name: 'Unsaved changes' })).getByRole('button', { name: 'Save defaults' }));
    await waitFor(() => expect(toastText()).toContain('Shop defaults saved'));
    const settings = await db.getShopSettings();
    expect(settings.other[DEFAULTS_CHECKED_SETTING]).toBe(true);
    expect(settings.rules.panelThickness).toBe(inches(23 / 32));

    window.location.hash = '#/jobs';
    await act(async () => {});
    expect(banner()).toBeNull();
  });

  it('says the New job dialog’s values are the built-in ones until they are checked', async () => {
    await startWith([]);
    const user = await renderAt('#/jobs');
    await user.click(screen.getByRole('button', { name: /^New job/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Not checked yet: these are KERFuffle’s built-in values.');
    expect(within(dialog).getByRole('link', { name: 'Check them in Settings' })).toHaveAttribute('href', '#/settings');
  });

  it('keeps the flag out of a .kerfjob file and refuses anything but true or false', async () => {
    const client = createMemoryClient();
    await client.setShopSetting(DEFAULTS_CHECKED_SETTING, true);
    await expect(client.setShopSetting(DEFAULTS_CHECKED_SETTING, 'yes')).rejects.toMatchObject({ kind: 'invalid' });
    const job = await client.addExampleJob();
    expect(Object.keys(job)).not.toContain(DEFAULTS_CHECKED_SETTING);
  });
});

describe('first run: the example job', () => {
  it('opens from the empty Jobs screen, and its cut list prints', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await startWith([]);
    const user = await renderAt('#/jobs');
    expect(screen.getByText('No jobs yet. Start one with New job.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open an example job' }));

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/jobs\/[^/]+\/workspace$/));
    const [example] = await db.listJobs();
    expect(example).toMatchObject({ name: EXAMPLE, customer: 'Example', status: 'draft', number: 1 });
    expect(window.location.hash).toBe(`#/jobs/${example!.id}/workspace`);

    await waitFor(() => expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument());
    await user.keyboard('{Control>}p{/Control}');
    await waitFor(() => expect(window.location.hash).toBe(`#/jobs/${example!.id}/cut-list`));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(document.querySelectorAll('[data-sheet="1"] tr[data-mark]').length).toBeGreaterThan(0);
  });

  it('is built with the shop defaults: base and wall cabinets, finished ends, quantities and a run', async () => {
    const client = createMemoryClient();
    const job = await client.addExampleJob();
    expect(job.rules).toEqual((await client.getShopSettings()).rules);
    expect(new Set(job.cabinets.map((c) => c.type))).toEqual(new Set(['base', 'wall']));
    expect(job.cabinets.some((c) => c.finishedEnds !== 'none')).toBe(true);
    expect(job.cabinets.some((c) => c.quantity > 1)).toBe(true);
    expect(job.cabinets.filter((c) => c.type === 'base').every((c) => c.run === 'Sink wall')).toBe(true);

    // A shop whose default method has no runs gets the example without them.
    const rules = (await client.getShopSettings()).rules;
    await client.setShopSetting(RULES_SETTING, { ...rules, method: { ...rules.method, id: 'B' } });
    const noRuns = await client.addExampleJob();
    expect(noRuns.rules.method.id).toBe('B');
    expect(noRuns.cabinets.every((c) => c.run === null)).toBe(true);
    expect(noRuns.number).toBe(job.number + 1);
  });

  it('can be added again from Settings → Help', async () => {
    await startWith([testJob()]);
    const user = await renderAt('#/settings');
    await screen.findByRole('heading', { name: 'Help' });
    await user.click(screen.getByRole('button', { name: 'Add the example job' }));
    await waitFor(() => expect(toastText()).toContain(`Added “${EXAMPLE}” to Jobs.`));
    expect((await db.listJobs()).map((j) => j.name)).toContain(EXAMPLE);
  });
});
