import { DEFAULT_RULES, inches } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { StorageError } from '../src/data/errors';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { displayInches } from '../src/lib/dimensions';
import { displayStore, setDisplaySettings } from '../src/state/display';
import { dismissToast, toastStore } from '../src/state/toast';
import { testJob, useTestDatabase } from './storage';

let db: MemoryStorageClient;

beforeEach(async () => {
  window.location.hash = '#/settings';
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  setDisplaySettings({ roundTo: 16 });
  db = await useTestDatabase([testJob()]);
});

afterEach(() => {
  setDisplaySettings({ roundTo: 16 });
});

async function renderSettings() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'Construction defaults' });
  return user;
}

const field = (label: string) => screen.getByLabelText<HTMLInputElement>(new RegExp(`^${label}`));
const row = (label: string) => field(label).closest<HTMLElement>('[data-hot], div[class*="row"]')!;
const dirtyBar = () => screen.queryByRole('region', { name: 'Unsaved changes' });
const saveButton = () => within(dirtyBar()!).getByRole('button', { name: 'Save defaults' });
const toastText = () => document.querySelector('.toast')?.textContent ?? '';
const effect = () => within(screen.getByRole('complementary')).getByRole('status').textContent;

async function retype(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  await user.clear(field(label));
  await user.type(field(label), text);
}

describe('Settings: construction defaults', () => {
  it('shows each rule with its default, the banner, and no legacy flags', async () => {
    await renderSettings();
    expect(screen.getByText(/New jobs copy these\./)).toHaveTextContent('New jobs copy these. Existing jobs keep their own copy');
    for (const label of ['Panel thickness', 'Toe-kick height', 'Countertop thickness', 'Shelf thickness', 'Wide-shelf thickness', 'Wide-shelf cabinet width', 'Shelf clearance, each side', 'Shelf setback', 'Laminate oversize, each edge']) {
      expect(field(label)).toBeInTheDocument();
    }
    expect(field('Panel thickness')).toHaveValue('3/4');
    expect(within(row('Panel thickness')).getByText(/Default/)).toHaveTextContent('Default 3/4″');
    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();
    expect(dirtyBar()).not.toBeInTheDocument();
  });

  it('tracks changes, offers Reset per field, and Discard puts everything back', async () => {
    const user = await renderSettings();
    await retype(user, 'Panel thickness', '23/32');
    await user.tab();
    expect(within(row('Panel thickness')).getByText(/Changed from/)).toHaveTextContent('Changed from 3/4″');
    expect(dirtyBar()).toHaveTextContent('1 unsaved change · applies to new jobs only');

    await retype(user, 'Shelf setback', '0');
    await user.tab();
    expect(dirtyBar()).toHaveTextContent('2 unsaved changes');

    await user.click(within(row('Panel thickness')).getByRole('button', { name: 'Reset Panel thickness to 3/4″' }));
    expect(field('Panel thickness')).toHaveValue('3/4');
    expect(dirtyBar()).toHaveTextContent('1 unsaved change');

    await user.click(within(dirtyBar()!).getByRole('button', { name: 'Discard' }));
    expect(field('Shelf setback')).toHaveValue('1/8');
    expect(dirtyBar()).not.toBeInTheDocument();
  });

  it('validation from the engine shows beside the field and blocks Save', async () => {
    const user = await renderSettings();
    await retype(user, 'Countertop thickness', '31');
    expect(within(row('Countertop thickness')).getByText(/Height must be more than toe kick plus countertop/)).toBeInTheDocument();
    expect(field('Countertop thickness')).toHaveAttribute('aria-invalid', 'true');
    expect(dirtyBar()).toHaveTextContent('fix the marked field first');
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    await user.click(saveButton());
    expect((await db.getShopSettings()).rules.countertopThickness).toBe(DEFAULT_RULES.countertopThickness);

    // Text that doesn't read as a size blocks Save too.
    await retype(user, 'Countertop thickness', '2');
    expect(saveButton()).not.toHaveAttribute('aria-disabled');
    await retype(user, 'Toe-kick height', 'four');
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('saving changes the defaults for new jobs only', async () => {
    const user = await renderSettings();
    await retype(user, 'Panel thickness', '23/32');
    await user.click(screen.getByRole('radio', { name: /Wider than 36″/ }));
    await user.click(saveButton());
    await waitFor(() => expect(toastText()).toContain('Shop defaults saved. Existing jobs are unchanged.'));
    expect(dirtyBar()).not.toBeInTheDocument();

    const saved = (await db.getShopSettings()).rules;
    expect(saved).toEqual({ ...DEFAULT_RULES, panelThickness: inches(23 / 32), shelfThickComparison: 'gt' });
    expect((await db.getJob('j-0014')).rules).toEqual(DEFAULT_RULES);
    const fresh = await db.createJob({ name: 'Garage' });
    expect(fresh.rules.panelThickness).toBe(inches(23 / 32));
  });

  it('redraws the detail and its engine-computed effect as you type', async () => {
    const user = await renderSettings();
    expect(effect()).toBe('30″ cabinet → bottom 28 1/2″ long');
    await retype(user, 'Panel thickness', '1');
    expect(effect()).toBe('30″ cabinet → bottom 28″ long');
    expect(screen.getByRole('img', { name: /Detail A: Panel joint/ })).toBeInTheDocument();

    await user.click(field('Shelf clearance, each side'));
    expect(screen.getByRole('img', { name: /Detail C: Shelf clearance/ })).toBeInTheDocument();
    expect(effect()).toBe('30″ cabinet → shelf 27 3/4″ long');

    await retype(user, 'Panel thickness', '20');
    expect(effect()).toBe('Fix the marked setting to see what it does.');
  });
});

describe('Settings: leaving with unsaved changes', () => {
  it('asks Save / Discard / Cancel before leaving, and only then leaves', async () => {
    const user = await renderSettings();
    await retype(user, 'Shelf setback', '1/4');
    await user.tab();

    await user.click(screen.getByRole('link', { name: 'Jobs' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved settings' });
    expect(window.location.hash).toBe('#/settings');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field('Shelf setback')).toHaveValue('1/4');

    await user.click(screen.getByRole('link', { name: 'Jobs' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(window.location.hash).toBe('#/jobs'));
    await screen.findByRole('heading', { level: 1, name: 'Jobs' });
    expect((await db.getShopSettings()).rules.shelfSetback).toBe(inches(1 / 4));
  });

  it('Discard leaves without saving; with nothing changed there is no question', async () => {
    const user = await renderSettings();
    await user.click(screen.getByRole('link', { name: 'Jobs' }));
    await screen.findByRole('heading', { level: 1, name: 'Jobs' });

    window.location.hash = '#/settings';
    await screen.findByRole('heading', { name: 'Construction defaults' });
    await retype(user, 'Toe-kick height', '3 1/2');
    act(() => field('Toe-kick height').blur()); // shortcuts never fire while typing in a field
    await user.keyboard('{Control>}1{/Control}');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await screen.findByRole('heading', { level: 1, name: 'Jobs' });
    expect((await db.getShopSettings()).rules.toeKickHeight).toBe(DEFAULT_RULES.toeKickHeight);
  });
});

describe('Settings: display and backups', () => {
  it('rounding shows live samples, and once saved every size follows it', async () => {
    const user = await renderSettings();
    const samples = screen.getByRole('group', { name: 'Samples' });
    expect(samples).toHaveTextContent('28 7/16″');
    expect(screen.getByRole('radio', { name: /Millimetres/ })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: '1/8″' }));
    expect(samples).toHaveTextContent('≈28 1/2″');
    expect(samples).toHaveTextContent('exact 28 7/16″');
    expect(displayStore.getState().roundTo).toBe(16);

    await user.click(saveButton());
    await waitFor(() => expect(displayStore.getState().roundTo).toBe(8));
    expect(displayInches(inches(28 + 7 / 16))).toBe('≈28 1/2″');
    expect((await db.getShopSettings()).other.display).toEqual({ roundTo: 8 });
  });

  it('keeps the latest n backups, saved with the other settings', async () => {
    const user = await renderSettings();
    expect(screen.getByRole('note')).toHaveTextContent('Documents\\KERFuffle\\Backups');
    await user.click(screen.getByRole('button', { name: 'Keep more backups' }));
    expect(screen.getByRole('spinbutton', { name: 'Keep the latest' })).toHaveValue('15');
    expect(dirtyBar()).toHaveTextContent('1 unsaved change');
    await user.click(saveButton());
    await waitFor(() => expect(dirtyBar()).not.toBeInTheDocument());
    expect((await db.backupOverview()).keep).toBe(15);
    expect(toastText()).toContain('Settings saved.');
  });

  it('a backup setting that is refused leaves the change unsaved and says why', async () => {
    const user = await renderSettings();
    await act(async () => {
      await db.setBackupSettings({ folder: null, keep: 14 });
    });
    const original = db.setBackupSettings.bind(db);
    db.setBackupSettings = () =>
      Promise.reject(new StorageError('invalid', 'KERFuffle can’t save backups in E:\\ (not ready). Pick another folder.'));
    await user.click(screen.getByRole('button', { name: 'Keep fewer backups' }));
    await user.click(saveButton());
    await waitFor(() => expect(toastText()).toContain('Pick another folder.'));
    expect(dirtyBar()).toBeInTheDocument();
    db.setBackupSettings = original;
  });
});
