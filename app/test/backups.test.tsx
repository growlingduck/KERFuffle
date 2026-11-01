import { inches } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { setStorageClient } from '../src/data/client';
import { createMemoryClient } from '../src/data/memoryClient';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession, refreshJobList, startStorage } from '../src/data/storage';
import { backupWhen } from '../src/screens/jobs/BackupStrip';
import { resetRegisterView } from '../src/state/register';
import { dismissToast, toastStore } from '../src/state/toast';
import { historyStore, runCommand } from '../src/workspace/history';
import { testCabinet, testJob, useTestDatabase } from './storage';

/** "Now": Nov 1, 2026, 3:00 PM local time. */
const NOW = new Date(2026, 10, 1, 15, 0);

let db: MemoryStorageClient;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.location.hash = '#/jobs';
  resetRegisterView();
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  db = await useTestDatabase([
    testJob({ id: 'k', number: 14, name: 'Kitchen remodel', cabinets: [testCabinet('k1', 'B1')] }),
    testJob({ id: 'l', number: 13, name: 'Laundry room', cabinets: [testCabinet('l1', 'B1')] }),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderJobs() {
  const user = userEvent.setup();
  render(<App />);
  await act(async () => {});
  return user;
}

const strip = () => screen.getByRole('region', { name: 'Backups' });
const stripStatus = () => within(strip()).getAllByRole('status')[0]!;
const toastText = () => document.querySelector('.toast')?.textContent ?? '';
const rowNames = () => [...document.querySelectorAll('tbody [data-row-link]')].map((a) => a.textContent);

describe('Backup strip', () => {
  it('Back up now makes a backup and says so; the strip shows the last one and how many are kept', async () => {
    const user = await renderJobs();
    expect(stripStatus()).toHaveTextContent('No backups yet.');
    await user.click(within(strip()).getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(toastText()).toContain('Backed up 2 jobs.'));
    expect(stripStatus()).toHaveTextContent('Last backup today, 3:00 PM · 1 backup kept');
    expect((await db.backupOverview()).backups[0]).toMatchObject({ fileName: 'kerfuffle-20261101-150000.db', jobCount: 2 });
  });

  it('a backup that fails its check is reported, not kept', async () => {
    const user = await renderJobs();
    db.failNextBackup('The backup copy didn’t pass its check, so it was deleted. Your jobs are unchanged. Try again.');
    await user.click(within(strip()).getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(toastText()).toContain('didn’t pass its check'));
    expect(stripStatus()).toHaveTextContent('No backups yet.');
    expect((await db.backupOverview()).backups).toEqual([]);
  });

  it('Restore backup… lists backups, confirms, backs up the current jobs first, then restores', async () => {
    await db.backUpNow(); // both jobs
    await db.deleteJob('l');
    await refreshJobList();
    const user = await renderJobs();
    expect(rowNames()).toEqual(['Kitchen remodel']);

    await user.click(within(strip()).getByRole('button', { name: 'Restore backup…' }));
    const popover = screen.getByRole('dialog', { name: 'Restore a backup' });
    await user.click(within(popover).getByRole('button', { name: /today, 3:00 PM\s*2 jobs/ }));
    expect(popover).toHaveTextContent('Restore the backup from today, 3:00 PM?');
    expect(popover).toHaveTextContent('Your jobs go back to how they were then (2 jobs). KERFuffle backs up the current jobs first');

    await user.click(within(popover).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(toastText()).toContain('Restored the backup from today, 3:00 PM. Your jobs from before were backed up first.'));
    expect(screen.queryByRole('dialog', { name: 'Restore a backup' })).not.toBeInTheDocument();
    expect(rowNames()).toEqual(['Kitchen remodel', 'Laundry room']);
    const backups = (await db.backupOverview()).backups;
    expect(backups.map((b) => b.jobCount)).toEqual([1, 2]); // the safety backup, then the one restored
    expect(stripStatus()).toHaveTextContent('2 backups kept');
  });

  it('Esc closes the restore popover and Back returns to the list', async () => {
    await db.backUpNow();
    const user = await renderJobs();
    const trigger = within(strip()).getByRole('button', { name: 'Restore backup…' });
    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /today/ }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Choose a backup');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('restoring closes the open job and drops its undo history, so an old step can’t write over the restored jobs', async () => {
    await db.backUpNow();
    await jobSession.open('k');
    runCommand({ type: 'setDimension', cabinetId: 'k1', field: 'width', value: inches(33) });
    expect(historyStore.getState().past).toHaveLength(1);

    const user = await renderJobs();
    await user.click(within(strip()).getByRole('button', { name: 'Restore backup…' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /today/ }));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(toastText()).toContain('Restored'));
    expect(jobSession.getJob()).toBeNull();
    expect(historyStore.getState().past).toEqual([]);
    expect((await db.getJob('k')).cabinets[0]!.width).toBe(inches(30));
    // The edit made just before the restore is in the safety backup.
    const safety = (await db.backupOverview()).backups[0]!;
    await db.restoreBackup(safety.fileName);
    expect((await db.getJob('k')).cabinets[0]!.width).toBe(inches(33));
  });
});

describe('Automatic backups', () => {
  it('startup takes one backup a day, and none before there are jobs', async () => {
    const empty = createMemoryClient({ now: () => NOW.toISOString() });
    setStorageClient(empty);
    await startStorage();
    expect((await empty.backupOverview()).backups).toEqual([]);

    await empty.createJob({ name: 'Kitchen remodel' });
    await startStorage();
    await startStorage();
    expect((await empty.backupOverview()).backups.map((b) => b.jobCount)).toEqual([1]);
  });

  it('describes when a backup was taken', () => {
    expect(backupWhen('2026-11-01T08:02:00', NOW)).toMatch(/^today, 8:02\sAM$/);
    expect(backupWhen('2026-10-31T16:12:00', NOW)).toMatch(/^yesterday, 4:12\sPM$/);
    expect(backupWhen('2026-10-29T08:01:00', NOW)).toMatch(/^Oct 29, 8:01\sAM$/);
  });
});
