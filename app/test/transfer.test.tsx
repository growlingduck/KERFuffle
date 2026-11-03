import { DEFAULT_RULES, inches, upgradeVersion1Rules } from '@kerfuffle/engine';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type * as ExportModule from '../src/platform/export';
import type * as FilesModule from '../src/platform/files';
import { canonicalJson, CHANGED_FILE_MESSAGE, JOB_FILE_VERSION, NEWER_FILE_MESSAGE, sha256Hex, writeJobFile } from '../src/data/jobFile';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession } from '../src/data/storage';
import type { JobRecord } from '../src/data/types';
import { resetRegisterView } from '../src/state/register';
import { dismissToast, toastStore } from '../src/state/toast';
import { testCabinet, testJob, useTestDatabase } from './storage';

const files = vi.hoisted(() => ({ pick: vi.fn(), saved: [] as { name: string; contents: string }[] }));

vi.mock('../src/platform/files', async (original) => ({
  ...(await original<typeof FilesModule>()),
  pickJobFile: files.pick,
}));
vi.mock('../src/platform/export', async (original) => ({
  ...(await original<typeof ExportModule>()),
  saveJobFile: vi.fn((name: string, contents: string) => {
    files.saved.push({ name, contents });
    return Promise.resolve({ name, folder: 'KERFuffle', path: null });
  }),
}));

const HEADER = { appVersion: '0.1.0', exportedAt: '2026-10-30T16:00:00.000Z' };
/** A job made on the other PC, with its own rules. */
const OTHER_PC_JOB = testJob({
  id: 'from-shop-pc',
  number: 21,
  name: 'Mudroom lockers',
  customer: 'Jones',
  status: 'ready',
  rules: upgradeVersion1Rules({ ...DEFAULT_RULES, panelThickness: inches(23 / 32) }),
  cabinets: [testCabinet('m1', 'B1'), testCabinet('m2', 'B2')],
});

let db: MemoryStorageClient;

beforeEach(async () => {
  window.location.hash = '#/jobs';
  resetRegisterView();
  files.pick.mockReset();
  files.saved.length = 0;
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
  db = await useTestDatabase([testJob({ id: 'k', number: 14, name: 'Kitchen remodel', cabinets: [testCabinet('k1', 'B1')] })]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function renderJobs() {
  const user = userEvent.setup();
  render(<App />);
  await act(async () => {});
  return user;
}

const toastText = () => document.querySelector('.toast')?.textContent ?? '';
const rowNames = () => [...document.querySelectorAll('tbody [data-row-link]')].map((a) => a.textContent);

async function importFile(user: ReturnType<typeof userEvent.setup>, text: string, name = 'Mudroom lockers (J-0021).kerfjob') {
  files.pick.mockResolvedValueOnce({ name, text });
  await user.click(screen.getByRole('button', { name: 'Import job…' }));
  await act(async () => {});
}

describe('Import job', () => {
  it('previews the file, then imports the job with its own rules', async () => {
    const user = await renderJobs();
    await importFile(user, await writeJobFile(OTHER_PC_JOB, HEADER));
    const dialog = screen.getByRole('dialog', { name: 'Import job' });
    expect(dialog).toHaveTextContent('Mudroom lockers (J-0021).kerfjob');
    const cell = (label: string) => within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
    expect(cell('Job')).toBe('Mudroom lockers');
    expect(cell('No.')).toBe('J-0021');
    expect(cell('Cabinets')).toBe('2');
    expect(cell('From KERFuffle')).toBe('0.1.0');
    expect(cell('Exported')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(toastText()).toContain('Imported “Mudroom lockers” as J-0021.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rowNames()).toContain('Mudroom lockers');
    expect(await db.getJob('from-shop-pc')).toEqual(OTHER_PC_JOB);
  });

  it('a job already here comes in as a copy by default, or replaces it after a confirm and a backup', async () => {
    const user = await renderJobs();
    const here = await db.getJob('k');
    const text = await writeJobFile({ ...here, name: 'Kitchen remodel', cabinets: [...here.cabinets, testCabinet('k2', 'W1', { type: 'wall' })] }, HEADER);

    await importFile(user, text);
    let dialog = screen.getByRole('dialog', { name: 'Import job' });
    expect(within(dialog).getByRole('radio', { name: /Import as a copy/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Import as a copy' }));
    await waitFor(() => expect(rowNames()).toContain('Kitchen remodel (copy)'));
    expect((await db.getJob('k')).cabinets).toHaveLength(1);

    await importFile(user, text);
    dialog = screen.getByRole('dialog', { name: 'Import job' });
    await user.click(within(dialog).getByRole('radio', { name: /Replace existing/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Replace…' }));
    dialog = screen.getByRole('dialog', { name: 'Replace the job on this PC?' });
    expect(dialog).toHaveTextContent('KERFuffle backs up all jobs first');
    expect((await db.backupOverview()).backups).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Replace job' }));
    await waitFor(() => expect(toastText()).toContain('Replaced “Kitchen remodel” with the job from the file. All jobs were backed up first.'));
    expect((await db.getJob('k')).cabinets).toHaveLength(2);
    const [backup] = (await db.backupOverview()).backups;
    expect(backup?.jobCount).toBe(2);
  });

  it('replacing the open job closes it first', async () => {
    await jobSession.open('k');
    const user = await renderJobs();
    await importFile(user, await writeJobFile({ ...(await db.getJob('k')), name: 'Kitchen, revised' }, HEADER));
    await user.click(screen.getByRole('radio', { name: /Replace existing/ }));
    await user.click(screen.getByRole('button', { name: 'Replace…' }));
    await user.click(screen.getByRole('button', { name: 'Replace job' }));
    await waitFor(() => expect(rowNames()).toContain('Kitchen, revised'));
    expect(jobSession.getJob()).toBeNull();
  });

  it('cabinets the engine flags are imported, and listed first', async () => {
    const user = await renderJobs();
    const flagged = { ...OTHER_PC_JOB, cabinets: [testCabinet('m1', 'B1'), testCabinet('m2', 'B2', { height: inches(3) })] };
    await importFile(user, await writeJobFile(flagged, HEADER));
    const dialog = screen.getByRole('dialog', { name: 'Import job' });
    expect(dialog).toHaveTextContent('1 cabinet needs attention.');
    expect(dialog).toHaveTextContent('B2: Height must be more than toe kick plus countertop');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(rowNames()).toContain('Mudroom lockers'));
    expect((await db.getJob('from-shop-pc')).cabinets[1]!.height).toBe(inches(3));
  });

  it('a number already used here gets the next one, and says so first', async () => {
    const user = await renderJobs();
    await importFile(user, await writeJobFile({ ...OTHER_PC_JOB, number: 14 }, HEADER));
    expect(screen.getByRole('dialog')).toHaveTextContent('J-0014 is already used on this PC, so the job gets the next free number.');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(toastText()).toContain('as J-0015'));
  });

  it('refuses a changed file, or one from a newer KERFuffle, with a toast and no dialog', async () => {
    const user = await renderJobs();
    const text = await writeJobFile(OTHER_PC_JOB, HEADER);
    await importFile(user, text.replace('Mudroom', 'Boot room'));
    expect(toastText()).toContain(CHANGED_FILE_MESSAGE);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const doc = JSON.parse(text) as Record<string, unknown>;
    delete doc.checksum;
    const newer = { ...doc, formatVersion: JOB_FILE_VERSION + 1 };
    await importFile(user, JSON.stringify({ ...newer, checksum: await sha256Hex(canonicalJson(newer)) }));
    expect(toastText()).toContain(NEWER_FILE_MESSAGE);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dropping a .kerfjob on the Jobs screen starts the same import; other files are refused', async () => {
    await renderJobs();
    const drop = async (file: File) => {
      const dataTransfer = { types: ['Files'], files: [file] };
      fireEvent(document, Object.assign(new Event('dragenter', { bubbles: true }), { dataTransfer }));
      expect(screen.getByText('Drop the .kerfjob file to import it')).toBeInTheDocument();
      fireEvent(document, Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }));
      await act(async () => {});
    };
    await drop(new File(['hello'], 'notes.txt'));
    expect(toastText()).toContain('Only KERFuffle job files (.kerfjob) can be imported.');
    expect(screen.queryByText('Drop the .kerfjob file to import it')).not.toBeInTheDocument();

    await drop(new File([await writeJobFile(OTHER_PC_JOB, HEADER)], 'Mudroom lockers (J-0021).kerfjob'));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Import job' })).toBeInTheDocument());
  });
});

describe('Export job file', () => {
  it('saves the job from the ⋯ menu as {name} (J-0014).kerfjob, and the file imports on another PC exactly', async () => {
    const user = await renderJobs();
    await user.click(screen.getByRole('button', { name: 'More actions for Kitchen remodel' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export job file…' }));
    await waitFor(() => expect(files.saved).toHaveLength(1));
    expect(files.saved[0]!.name).toBe('Kitchen remodel (J-0014).kerfjob');
    expect(toastText()).toContain('Saved “Kitchen remodel (J-0014).kerfjob” in KERFuffle.');

    const original: JobRecord = await db.getJob('k');
    const pcB = await useTestDatabase([]);
    await importFile(user, files.saved[0]!.contents);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(rowNames()).toEqual(['Kitchen remodel']));
    expect(await pcB.getJob('k')).toEqual(original);
  });

  it('the workspace header exports the open job, with edits not yet saved', async () => {
    window.location.hash = '#/jobs/k/workspace';
    const user = await renderJobs();
    await screen.findByRole('heading', { name: /Workspace: Kitchen remodel/ });
    jobSession.commit((job) => ({ ...job, notes: 'typed a moment ago' }));
    await user.click(screen.getByRole('button', { name: 'Export job file…' }));
    await waitFor(() => expect(files.saved).toHaveLength(1));
    expect(JSON.parse(files.saved[0]!.contents)).toMatchObject({ job: { id: 'k', notes: 'typed a moment ago' } });
  });
});
