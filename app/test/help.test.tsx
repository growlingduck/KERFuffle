import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { GLOSSARY, SYMBOLS } from '../src/lib/glossary';
import { jobsStore } from '../src/state/jobs';
import { dismissToast, toastStore } from '../src/state/toast';
import { quietLayouts, useTestDatabase as seedDatabase } from './storage';

/** Prompt 18: Help in Settings and the header, the printed quick start, and Ctrl+N where it applies. */

const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function open(hash: string, { lastJob = true } = {}) {
  window.location.hash = hash;
  // Forget the job opened by an earlier test.
  if (!lastJob) jobsStore.dispatch({ type: 'jobs/loaded', jobs: [] });
  await seedDatabase();
  quietLayouts();
  if (lastJob) jobsStore.dispatch({ type: 'job/opened', id: 'j-0014' });
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const header = () => within(screen.getByRole('banner'));
const help = () => screen.getByRole('region', { name: 'Help' });

async function openHelp(options?: { lastJob?: boolean }) {
  const user = await open('#/settings/help', options);
  await screen.findByRole('heading', { name: 'Help' });
  return user;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  const toast = toastStore.getState();
  if (toast) dismissToast(toast.id);
});

describe('the header’s Help button', () => {
  it.each(['#/jobs', '#/jobs/j-0014/workspace', '#/jobs/j-0014/cut-list', '#/settings'])('is on %s, next to Keyboard shortcuts, and links to Settings → Help', async (hash) => {
    await open(hash);
    const link = header().getByRole('link', { name: 'Help' });
    expect(link).toHaveAttribute('href', '#/settings/help');
    const shortcuts = header().getByRole('button', { name: 'Keyboard shortcuts' });
    expect(link.parentElement!.contains(shortcuts)).toBe(true);
  });

  it('opens Settings at Help, its heading focused', async () => {
    await open('#/jobs');
    go(header().getByRole('link', { name: 'Help' }).getAttribute('href')!);
    await waitFor(() => expect(document.getElementById('set-help')).toHaveFocus());
    expect(screen.getByRole('navigation', { name: 'Settings sections' }).querySelector('[aria-current="true"]')).toHaveTextContent('Help');
  });

  it('is reached from the keyboard, and goes back to Help when Settings is already there', async () => {
    const user = await openHelp();
    await waitFor(() => expect(document.getElementById('set-help')).toHaveFocus());
    // Move away within Settings, then press Enter on Help.
    await user.click(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { name: /Construction/ }));
    expect(document.getElementById('set-help')).not.toHaveFocus();
    const link = header().getByRole('link', { name: 'Help' });
    link.focus();
    await user.keyboard('{Enter}');
    expect(document.getElementById('set-help')).toHaveFocus();
  });
});

describe('Settings → Help', () => {
  it('is numbered after About in the section nav', async () => {
    await openHelp();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const items = within(nav).getAllByRole('button').map((b) => b.textContent);
    expect(items.at(-2)).toBe('06About');
    expect(items.at(-1)).toBe('07Help');
  });

  it('has your first job in six steps, each linking to its place', async () => {
    await openHelp();
    const steps = within(help()).getAllByRole('listitem').filter((li) => li.closest('ol'));
    expect(steps).toHaveLength(6);
    const links = steps.map((step) => within(step).getByRole('link'));
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Settings → Construction', '#/settings/construction'],
      ['Jobs → New job', '#/jobs/new'],
      ['Workspace', '#/jobs/j-0014/workspace'],
      ['Workspace', '#/jobs/j-0014/workspace'],
      ['Output', '#/jobs/j-0014/cut-list'],
      ['Output', '#/jobs/j-0014/cut-list'],
    ]);
    // Step 3 gives the accepted formats.
    expect(steps[2]).toHaveTextContent('23 3/4, 23-3/4 or 23.75');
  });

  it('with no job opened yet, the job steps link to Jobs', async () => {
    await openHelp({ lastJob: false });
    const steps = within(help()).getAllByRole('listitem').filter((li) => li.closest('ol'));
    for (const step of steps.slice(2)) {
      expect(within(step).getByRole('link', { name: 'Jobs: open a job first' })).toHaveAttribute('href', '#/jobs');
    }
  });

  it('“Settings → Construction” goes to Construction', async () => {
    await openHelp();
    go(within(help()).getByRole('link', { name: 'Settings → Construction' }).getAttribute('href')!);
    await waitFor(() => expect(document.getElementById('set-construction')).toHaveFocus());
  });

  it('“Jobs → New job” opens Jobs with New job open, and the address goes back to #/jobs', async () => {
    await openHelp();
    go(within(help()).getByRole('link', { name: 'Jobs → New job' }).getAttribute('href')!);
    expect(await screen.findByRole('dialog', { name: 'New job' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/jobs');
    expect(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { current: 'page' })).toHaveTextContent('Jobs');
  });

  it('“Workspace” and “Output” land on the last job’s screens', async () => {
    await openHelp();
    go(within(help()).getAllByRole('link', { name: 'Workspace' })[0]!.getAttribute('href')!);
    expect(await screen.findByRole('heading', { name: /^Parts · / })).toBeInTheDocument();
    go('#/settings/help');
    await screen.findByRole('heading', { name: 'Help' });
    go(within(help()).getAllByRole('link', { name: 'Output' })[0]!.getAttribute('href')!);
    expect(await screen.findByRole('toolbar', { name: 'Cut list options' })).toBeInTheDocument();
  });

  it('shows every glossary entry and symbol, read from glossary.ts', async () => {
    await openHelp();
    const words = help();
    for (const entry of Object.values(GLOSSARY)) {
      expect(within(words).getAllByText(entry.term, { selector: 'dt' }), entry.term).toHaveLength(1);
      expect(within(words).getAllByText(entry.text, { selector: 'dd' }), entry.term).toHaveLength(1);
    }
    for (const symbol of Object.values(SYMBOLS)) {
      expect(within(words).getByText(symbol.text, { selector: 'dd' })).toBeInTheDocument();
      expect(within(words).getByText(symbol.label, { exact: false, selector: 'dt' })).toBeInTheDocument();
    }
  });

  it('has no second copy of the glossary text anywhere in the app source', () => {
    const texts = [...Object.values(GLOSSARY).map((e) => e.text), ...Object.values(SYMBOLS).map((s) => s.text)];
    const copies = sourceFiles(SRC)
      .filter((file) => !file.endsWith('glossary.ts'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return texts.filter((text) => source.includes(text)).map((text) => `${file}: ${text.slice(0, 40)}…`);
      });
    expect(copies).toEqual([]);
  });

  it('opens the keyboard shortcuts popover', async () => {
    const user = await openHelp();
    const button = within(help()).getByRole('button', { name: 'Show keyboard shortcuts' });
    await user.click(button);
    const popover = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(popover).getByText('Show shortcuts')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('has Add the example job (moved from About)', async () => {
    await openHelp();
    expect(within(help()).getByRole('button', { name: 'Add the example job' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'About' })).queryByRole('button', { name: 'Add the example job' })).toBeNull();
  });
});

describe('Print quick start', () => {
  it('prints through the print path; only the quick start sheet prints from Settings', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = await openHelp();
    await user.click(within(help()).getByRole('button', { name: 'Print quick start' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();

    const sheets = document.querySelectorAll('[data-sheet]');
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0]!;
    // Never on screen, and outside everything Settings marks screen-only.
    expect(sheet.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(sheet.closest('[data-screen-only]')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Settings sections' }).closest('[data-screen-only]')).not.toBeNull();
    // Steps and words, with no links on paper.
    expect(sheet.querySelectorAll('ol > li')).toHaveLength(6);
    expect(sheet.querySelector('a')).toBeNull();
    expect(sheet).toHaveTextContent('Where: Settings → Construction');
    for (const entry of Object.values(GLOSSARY)) expect(sheet.textContent).toContain(entry.text);
    // No SVG pattern fills in anything that prints.
    expect(sheet.querySelector('pattern')).toBeNull();
  });
});

describe('Settings nav: Advanced', () => {
  it('tags Saw profiles and Display, without hiding or moving anything', async () => {
    await openHelp();
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const items = within(nav).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual([
      '01Construction',
      '02Materials',
      '03Saw profilesAdvanced',
      '04DisplayAdvanced',
      '05Backups',
      '06About',
      '07Help',
    ]);
  });
});

describe('Ctrl+N says what it does where it applies', () => {
  it('Jobs: New job shows Ctrl+N, and the popover lists it under Jobs', async () => {
    const user = await open('#/jobs');
    const button = await screen.findByRole('button', { name: 'New job' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+N');
    await user.click(header().getByRole('button', { name: 'Keyboard shortcuts' }));
    const popover = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const jobs = within(popover).getByRole('region', { name: 'Jobs' });
    expect(within(jobs).getByText('New job').closest('div')).toHaveTextContent(/New job\s*Ctrl\s*N/);
    expect(within(popover).queryByText('Add cabinet')).toBeNull();
  });

  it('Workspace: Add cabinet has the tooltip “Add cabinet Ctrl+N”, and the popover lists it under Workspace', async () => {
    const user = await open('#/jobs/j-0014/workspace');
    await screen.findByRole('heading', { name: /^Parts · / });
    const add = screen.getByRole('button', { name: 'Add cabinet' });
    expect(add).toHaveAttribute('aria-keyshortcuts', 'Control+N');
    await user.hover(add);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Add cabinet\s+Ctrl\+N$/);
    await user.click(header().getByRole('button', { name: 'Keyboard shortcuts' }));
    const popover = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const workspace = within(popover).getByRole('region', { name: 'Workspace' });
    expect(within(workspace).getByText('Add cabinet').closest('div')).toHaveTextContent(/Add cabinet\s*Ctrl\s*N/);
    expect(within(popover).queryByText('New job')).toBeNull();
  });
});
