import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreModule from '@tauri-apps/api/core';
import { App } from '../src/App';
import { writeJobFile } from '../src/data/jobFile';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession } from '../src/data/storage';
import type * as FilesModule from '../src/platform/files';
import { openedFileStore } from '../src/platform/openedFiles';
import { APP_VERSION, updatesStore } from '../src/platform/updates';
import type { UpdateStatus } from '../src/platform/updates';
import { resetRegisterView } from '../src/state/register';
import { dismissToast, toastStore } from '../src/state/toast';
import { testCabinet, testJob, useTestDatabase } from './storage';

// Only invoke is faked: isTauri stays false, so storage keeps using the test database.
const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', async (original) => ({ ...(await original<typeof CoreModule>()), invoke: tauri.invoke }));

const files = vi.hoisted(() => ({ readAt: vi.fn() }));
vi.mock('../src/platform/files', async (original) => ({ ...(await original<typeof FilesModule>()), readJobFileAt: files.readAt }));

const READY: UpdateStatus = {
  currentVersion: '0.1.0',
  enabled: true,
  checking: false,
  readyVersion: '0.2.0',
  lastChecked: Date.now(),
  updatedFrom: null,
};

let db: MemoryStorageClient;

beforeEach(async () => {
  window.location.hash = '#/jobs';
  resetRegisterView();
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  updatesStore.dispatch({ status: null, restarting: false });
  db = await useTestDatabase([testJob({ id: 'k', number: 14, name: 'Kitchen remodel', cabinets: [testCabinet('k1', 'B1')] })]);
});

afterEach(() => {
  vi.clearAllMocks();
  openedFileStore.dispatch(null);
});

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await act(async () => {});
  return user;
}

const header = () => screen.getByRole('banner');
const toastText = () => document.querySelector('.toast')?.textContent ?? '';

describe('Update ready', () => {
  it('says nothing until an update has downloaded, then says it installs on close', async () => {
    await renderApp();
    expect(header()).not.toHaveTextContent('Update ready');
    act(() => updatesStore.dispatch({ status: READY }));
    expect(header()).toHaveTextContent('Update ready');
    expect(header()).toHaveTextContent('Installs when you close KERFuffle');
    expect(within(header()).getByRole('button', { name: 'Restart now' })).toBeEnabled();
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('Restart now writes the open job before the installer takes over', async () => {
    window.location.hash = '#/jobs/k/workspace';
    let savedWhenRestarting: string | null = null;
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === 'restart_to_update') savedWhenRestarting = (await db.getJob('k')).notes;
    });
    const user = await renderApp();
    act(() => updatesStore.dispatch({ status: READY }));
    await waitFor(() => expect(jobSession.getJob()?.id).toBe('k'));
    act(() => jobSession.commit((job) => ({ ...job, notes: 'Edited just now' })));
    expect(jobSession.hasUnsavedChanges()).toBe(true);

    await user.click(within(header()).getByRole('button', { name: 'Restart now' }));
    await waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('restart_to_update'));
    expect(savedWhenRestarting).toBe('Edited just now');
  });

  it('with unsaved Settings, Restart now asks first, and Cancel keeps KERFuffle open', async () => {
    window.location.hash = '#/settings';
    const user = await renderApp();
    await screen.findByRole('heading', { name: 'Construction defaults' });
    act(() => updatesStore.dispatch({ status: READY }));
    const setback = screen.getByLabelText<HTMLInputElement>(/^Shelf setback/);
    await user.clear(setback);
    await user.type(setback, '1/4');
    await user.tab();

    await user.click(within(header()).getByRole('button', { name: 'Restart now' }));
    let dialog = await screen.findByRole('dialog', { name: 'Unsaved settings' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(tauri.invoke).not.toHaveBeenCalledWith('restart_to_update');

    await user.click(within(header()).getByRole('button', { name: 'Restart now' }));
    dialog = await screen.findByRole('dialog', { name: 'Unsaved settings' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tauri.invoke).toHaveBeenCalledWith('restart_to_update'));
  });

  it('a failed restart is reported and KERFuffle carries on', async () => {
    tauri.invoke.mockRejectedValueOnce('The update couldn’t start: access denied');
    const user = await renderApp();
    act(() => updatesStore.dispatch({ status: READY }));
    await user.click(within(header()).getByRole('button', { name: 'Restart now' }));
    await waitFor(() => expect(toastText()).toContain('The update couldn’t start: access denied'));
    expect(within(header()).getByRole('button', { name: 'Restart now' })).toBeEnabled();
  });
});

describe('Settings → About', () => {
  const about = () => screen.getByRole('region', { name: 'About' });

  it('shows the version; a browser build has no updates', async () => {
    window.location.hash = '#/settings';
    await renderApp();
    await screen.findByRole('heading', { name: 'About' });
    expect(about()).toHaveTextContent(`Version ${APP_VERSION}`);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(about()).toHaveTextContent('Updates are only in the desktop app.');
    expect(within(about()).getByRole('button', { name: 'Check for updates' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Check for updates says when it is up to date, or why it could not check', async () => {
    window.location.hash = '#/settings';
    const user = await renderApp();
    act(() => updatesStore.dispatch({ status: { ...READY, readyVersion: null, lastChecked: null } }));
    expect(about()).toHaveTextContent('Not checked yet.');

    tauri.invoke.mockResolvedValueOnce({ ...READY, readyVersion: null });
    await user.click(within(about()).getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(toastText()).toContain('KERFuffle is up to date.'));
    expect(about()).toHaveTextContent(/Up to date\. Last checked today, /);

    tauri.invoke.mockRejectedValueOnce('Couldn’t reach the update server. KERFuffle works normally offline; it will try again tomorrow.');
    tauri.invoke.mockResolvedValueOnce({ ...READY, readyVersion: null });
    await user.click(within(about()).getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(about()).toHaveTextContent('Couldn’t reach the update server.'));
  });

  it('a check that overlaps the daily one does not claim up to date, and settles when that one finishes', async () => {
    window.location.hash = '#/settings';
    const user = await renderApp();
    act(() => updatesStore.dispatch({ status: { ...READY, readyVersion: null, lastChecked: null } }));

    // Rust returns at once while the background check is still downloading.
    tauri.invoke.mockResolvedValueOnce({ ...READY, readyVersion: null, lastChecked: null, checking: true });
    await user.click(within(about()).getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(about()).toHaveTextContent('Checking for updates…'));
    expect(toastText()).not.toContain('up to date');

    // What the update-status event's refresh does when the background check ends.
    act(() => updatesStore.dispatch({ status: { ...READY, readyVersion: '0.2.0', checking: false } }));
    expect(about()).toHaveTextContent('Version 0.2.0 is downloaded.');
    expect(within(about()).getByRole('button', { name: 'Restart now' })).toBeInTheDocument();
  });

  it('a downloaded update offers Restart now here too', async () => {
    window.location.hash = '#/settings';
    await renderApp();
    act(() => updatesStore.dispatch({ status: READY }));
    expect(about()).toHaveTextContent('Version 0.2.0 is downloaded. It installs when you close KERFuffle.');
    expect(within(about()).getByRole('button', { name: 'Restart now' })).toBeInTheDocument();
  });
});

describe('Opening a .kerfjob from Explorer', () => {
  it('goes to Jobs and shows the import preview', async () => {
    window.location.hash = '#/settings';
    const job = testJob({ id: 'mud', number: 21, name: 'Mudroom lockers', cabinets: [testCabinet('m1', 'B1')] });
    const text = await writeJobFile(job, { appVersion: '0.1.0', exportedAt: '2026-10-30T16:00:00.000Z' });
    files.readAt.mockResolvedValueOnce({ name: 'Mudroom lockers (J-0021).kerfjob', text });
    tauri.invoke.mockImplementation((command: string) =>
      Promise.resolve(command === 'take_opened_job_file' ? 'D:\\USB\\Mudroom lockers (J-0021).kerfjob' : null),
    );
    await renderApp();

    // What startOpenedFiles does once Rust hands over the path.
    act(() => {
      openedFileStore.dispatch('D:\\USB\\Mudroom lockers (J-0021).kerfjob');
      window.location.hash = '#/jobs';
    });
    const dialog = await screen.findByRole('dialog', { name: 'Import job' });
    expect(files.readAt).toHaveBeenCalledWith('D:\\USB\\Mudroom lockers (J-0021).kerfjob');
    expect(dialog).toHaveTextContent('Mudroom lockers');
    expect(openedFileStore.getState()).toBeNull();
  });
});
