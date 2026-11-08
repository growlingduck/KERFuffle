import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { parseHash, routeHref } from '../src/routes';
import { jobSession } from '../src/data/storage';
import { jobsStore } from '../src/state/jobs';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { testJob, useTestDatabase } from './storage';

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function currentTab() {
  return within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { current: 'page' });
}

let db: MemoryStorageClient;

beforeEach(async () => {
  window.location.hash = '#/jobs';
  db = await useTestDatabase();
  // As if the job had been opened earlier, so Ctrl+2 / Ctrl+3 have somewhere to go.
  jobsStore.dispatch({ type: 'job/opened', id: 'j-0014' });
});

describe('routes', () => {
  it('parses and builds hashes for the four screens', () => {
    expect(parseHash('')).toEqual({ name: 'jobs' });
    expect(parseHash('#/jobs')).toEqual({ name: 'jobs' });
    expect(parseHash('#/jobs/j-0014/workspace')).toEqual({ name: 'workspace', jobId: 'j-0014' });
    expect(parseHash('#/jobs/j-0014/cut-list')).toEqual({ name: 'cutlist', jobId: 'j-0014' });
    expect(parseHash('#/settings')).toEqual({ name: 'settings' });
    expect(parseHash('#/nonsense')).toEqual({ name: 'jobs' });
    for (const route of [
      { name: 'jobs' as const },
      { name: 'workspace' as const, jobId: 'a b' },
      { name: 'cutlist' as const, jobId: 'x' },
      { name: 'settings' as const },
    ]) {
      expect(parseHash(routeHref(route))).toEqual(route);
    }
  });
});

describe('App shell', () => {
  it('navigates between the four screens with the tabs', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(currentTab()).toHaveTextContent('Jobs');
    expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();

    for (const [tab, heading] of [
      ['Workspace', 'Workspace: Kitchen remodel'],
      ['Output', 'Output: Kitchen remodel'],
      ['Settings', 'Settings'],
      ['Jobs', 'Jobs'],
    ] as const) {
      await user.click(screen.getByRole('link', { name: tab }));
      await waitFor(() => expect(currentTab()).toHaveTextContent(tab));
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
  });

  it('switches screens with Ctrl+1…4', () => {
    render(<App />);
    const press = (key: string) => {
      fireEvent.keyDown(document.body, { key, ctrlKey: true });
      // jsdom fires hashchange asynchronously; deliver it now.
      act(() => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    };
    press('4');
    expect(currentTab()).toHaveTextContent('Settings');
    press('2');
    expect(currentTab()).toHaveTextContent('Workspace');
    press('3');
    expect(currentTab()).toHaveTextContent('Output');
    press('1');
    expect(currentTab()).toHaveTextContent('Jobs');
  });

  it('grays out Workspace and Output until a job has been opened', async () => {
    // Forget the opened job: loading no jobs clears it, then the list comes back.
    const jobs = Object.values(jobsStore.getState().jobs);
    jobsStore.dispatch({ type: 'jobs/loaded', jobs: [] });
    jobsStore.dispatch({ type: 'jobs/loaded', jobs });
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    for (const tab of ['Workspace', 'Output']) {
      const link = within(nav).getByRole('link', { name: tab });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).not.toHaveAttribute('href');
    }
    expect(within(nav).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-disabled');

    act(() => jobsStore.dispatch({ type: 'job/opened', id: 'j-0014' }));
    expect(within(nav).getByRole('link', { name: 'Workspace' })).toHaveAttribute('href', '#/jobs/j-0014/workspace');
  });

  it('does not switch screens while typing', () => {
    go('#/settings');
    render(<App />);
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: '1', ctrlKey: true });
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(currentTab()).toHaveTextContent('Settings');
    input.remove();
  });

  it('shows the job title-block cells only on job screens', () => {
    render(<App />);
    // The Jobs screen's preview has its own title block; only the header's matters here.
    const header = () => within(screen.getByRole('banner'));
    expect(header().queryByText('Customer')).toBeNull();
    go('#/jobs/j-0014/workspace');
    expect(header().getByText('Customer')).toBeInTheDocument();
    expect(header().getByText('Kitchen remodel', { selector: 'button' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Undo/ })).toHaveAttribute('aria-disabled', 'true');
    go('#/settings');
    expect(header().queryByText('Customer')).toBeNull();
  });

  it('titles the window after the open job', () => {
    render(<App />);
    expect(document.title).toBe('KERFuffle');
    go('#/jobs/j-0014/cut-list');
    expect(document.title).toBe('KERFuffle — Kitchen remodel');
  });

  it('opens the shortcuts popover with ? and closes it with Esc', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('?');
    const popover = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(popover).getByText('Settings')).toBeInTheDocument();
    expect(within(popover).getByText('Show shortcuts')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('lists the dimension-field keys on screens that have fields', async () => {
    go('#/jobs/j-0014/workspace');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const popover = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(popover).getByText('Nudge a dimension 1/16″')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('changes job status from the stamp menu and confirms with a toast', async () => {
    go('#/jobs/j-0014/workspace');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Job status: .*Draft/ }));
    await user.click(screen.getByRole('menuitemradio', { name: /Ready to cut/ }));
    expect(screen.getByRole('button', { name: /Job status: .*Ready to cut/ })).toBeInTheDocument();
    expect(screen.getByText('Marked ready to cut. Construction is locked.')).toBeInTheDocument();

    // The open job saves the change through its session.
    await act(() => jobSession.flush());
    expect((await db.getJob('j-0014')).status).toBe('ready');
    expect(screen.getByText(/^Saved \d/)).toBeInTheDocument();
  });

  it('edits the open job’s details from the header, as one step with Undo', async () => {
    go('#/jobs/j-0014/workspace');
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(jobSession.getState().status).toBe('ready'));
    await user.click(screen.getByRole('button', { name: /Edit job details: Kitchen remodel/ }));
    const dialog = screen.getByRole('dialog', { name: 'Job details' });
    const name = within(dialog).getByLabelText('Job name');
    expect(name).toHaveFocus();
    await user.clear(name);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Give the job a name')).toBeInTheDocument();

    await user.type(name, 'Pantry wall');
    const customer = within(dialog).getByLabelText(/Customer or project/);
    await user.clear(customer);
    await user.type(customer, 'Lee');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'ready');
    expect(within(dialog).getByText(/construction/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Notes/), 'Call first');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog', { name: 'Job details' })).toBeNull();
    expect(screen.getByRole('button', { name: /Edit job details: Pantry wall/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Customer: Lee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Job status: .*Ready to cut/ })).toBeInTheDocument();
    expect(document.querySelector('.toast')).toHaveTextContent('Edit job details');
    await act(() => jobSession.flush());
    expect(await db.getJob('j-0014')).toMatchObject({ name: 'Pantry wall', customer: 'Lee', notes: 'Call first', status: 'ready' });

    await user.click(within(document.querySelector<HTMLElement>('.toast')!).getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /Edit job details: Kitchen remodel/ })).toBeInTheDocument();
    await act(() => jobSession.flush());
    expect(await db.getJob('j-0014')).toMatchObject({ name: 'Kitchen remodel', status: 'draft' });
  });

  it('Cancel leaves the job as it was, and an empty customer offers to add one', async () => {
    db = await useTestDatabase([testJob({ customer: null })]);
    go('#/jobs/j-0014/workspace');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Customer: Add customer/ }));
    const dialog = screen.getByRole('dialog', { name: 'Job details' });
    await user.type(within(dialog).getByLabelText('Job name'), ' changed');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Job details' })).toBeNull();
    expect(screen.getByRole('button', { name: /Edit job details: Kitchen remodel$/ })).toBeInTheDocument();
  });

  it('shows a save failure with a Retry that saves again', async () => {
    go('#/jobs/j-0014/workspace');
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(jobSession.getState().status).toBe('ready'));
    const saveJob = vi.spyOn(db, 'saveJob').mockRejectedValueOnce({ kind: 'diskFull', message: 'The disk is full.' });
    act(() => jobSession.commit((job) => ({ ...job, notes: 'edited' })));
    await act(() => jobSession.flush());
    expect(screen.getByText('Not saved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await act(() => jobSession.flush());
    expect(saveJob).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Not saved')).toBeNull();
    expect((await db.getJob('j-0014')).notes).toBe('edited');
  });

  it('shows a not-found sheet for an unknown job', () => {
    go('#/jobs/nope/workspace');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Job not found' })).toBeInTheDocument();
  });
});
