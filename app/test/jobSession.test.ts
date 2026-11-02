import { buildCutList, calculateParts, DEFAULT_METHOD, DEFAULT_RULES, inches, ticks, upgradeVersion1Rules, validate } from '@kerfuffle/engine';
import type { ConstructionRules } from '@kerfuffle/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import defaultRulesJson from '../src-tauri/src/db/default_rules.json';
import sampleJobsJson from '../src-tauri/src/db/sample_jobs.json';
import { installCloseGuard } from '../src/data/closeGuard';
import { StorageError, toStorageError } from '../src/data/errors';
import { cabinetSpec, createJobSession } from '../src/data/jobSession';
import type { JobSession } from '../src/data/jobSession';
import { createMemoryClient } from '../src/data/memoryClient';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { recoverPendingEdits } from '../src/data/recovery';
import { parseRules, parseShopRules, RULES_VERSION } from '../src/data/rules';
import type { JobRecord } from '../src/data/types';
import { RULES_SETTING } from '../src/data/types';
import { testCabinet, testJob } from './storage';

let db: MemoryStorageClient;
let sessions: JobSession[] = [];

function session(options: Partial<Parameters<typeof createJobSession>[0]> = {}): JobSession {
  const s = createJobSession({ client: db, ...options });
  sessions.push(s);
  return s;
}

async function openJob(s: JobSession, id = 'j-0014'): Promise<JobRecord> {
  await s.open(id);
  const job = s.getJob();
  if (!job) throw new Error('job did not load');
  return job;
}

/** A promise the test resolves by hand, to hold a save in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  db = createMemoryClient();
  db.seed([testJob()]);
});

afterEach(() => {
  for (const s of sessions) s.dispose();
  sessions = [];
  vi.useRealTimers();
});

describe('job session: reads and autosave', () => {
  it('loads a job and reads it synchronously', async () => {
    const s = session();
    const job = await openJob(s);
    expect(job.name).toBe('Kitchen remodel');
    expect(s.getState()).toMatchObject({ status: 'ready', save: { kind: 'saved', at: job.updatedAt } });
    s.commit((j) => ({ ...j, name: 'Kitchen' }));
    expect(s.getJob()?.name).toBe('Kitchen'); // immediately, before any save
  });

  it('reports a missing job', async () => {
    const s = session();
    await s.open('nope');
    expect(s.getState().status).toBe('missing');
  });

  it('coalesces rapid commits into one write and one revision', async () => {
    const s = session();
    const saveJob = vi.spyOn(db, 'saveJob');
    await openJob(s);
    s.commit((j) => ({ ...j, notes: 'one' }));
    await vi.advanceTimersByTimeAsync(200);
    s.commit((j) => ({ ...j, cabinets: [...j.cabinets, testCabinet('c-b2', 'B2')] }));
    await vi.advanceTimersByTimeAsync(200);
    s.commit((j) => ({ ...j, customer: 'Pat' }));
    await vi.advanceTimersByTimeAsync(399);
    expect(saveJob).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveJob).toHaveBeenCalledTimes(1);
    const stored = await db.getJob('j-0014');
    expect(stored).toMatchObject({ notes: 'one', customer: 'Pat', revision: 4 });
    expect(stored.cabinets.map((c) => c.label)).toEqual(['B1', 'B2']);
    expect(s.getJob()?.revision).toBe(4);
    expect(s.hasUnsavedChanges()).toBe(false);
  });

  it('never lets an edit change the fields the database owns', async () => {
    const s = session();
    const job = await openJob(s);
    s.commit({ ...job, id: 'other', number: 99, revision: 0, rules: { ...job.rules, panelThickness: ticks(46) }, notes: 'x' });
    expect(s.getJob()).toMatchObject({ id: 'j-0014', number: 14, revision: 3, rules: job.rules, notes: 'x' });
  });

  it('a commit that returns the same job does nothing', async () => {
    const s = session();
    const writePendingEdit = vi.spyOn(db, 'writePendingEdit');
    await openJob(s);
    s.commit((j) => j);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writePendingEdit).not.toHaveBeenCalled();
  });

  it('a commit made while a save is in flight is saved next, not lost', async () => {
    const s = session();
    await openJob(s);
    const gate = deferred<void>();
    const realSave = db.saveJob.bind(db);
    const saveJob = vi.spyOn(db, 'saveJob').mockImplementationOnce(async (snapshot) => {
      await gate.promise;
      return realSave(snapshot);
    });
    s.commit((j) => ({ ...j, notes: 'first' }));
    await vi.advanceTimersByTimeAsync(400);
    s.commit((j) => ({ ...j, customer: 'second' }));
    gate.resolve();
    await vi.advanceTimersByTimeAsync(400);
    expect(saveJob).toHaveBeenCalledTimes(2);
    expect(await db.getJob('j-0014')).toMatchObject({ notes: 'first', customer: 'second', revision: 5 });
  });
});

describe('job session: save state', () => {
  it('never shows "saving" for a write under 300 ms', async () => {
    const s = session();
    const states: string[] = [];
    s.store.subscribe(() => states.push(s.getState().save?.kind ?? 'none'));
    await openJob(s);
    vi.setSystemTime(new Date('2026-10-31T10:00:00Z'));
    s.commit((j) => ({ ...j, notes: 'quick' }));
    await vi.advanceTimersByTimeAsync(400);
    expect(states).not.toContain('saving');
    expect(s.getState().save).toEqual({ kind: 'saved', at: '2026-10-31T10:00:00.400Z' });
  });

  it('goes saved → saving (after 300 ms) → saved for a slow write', async () => {
    const s = session();
    await openJob(s);
    const gate = deferred<void>();
    const realSave = db.saveJob.bind(db);
    vi.spyOn(db, 'saveJob').mockImplementationOnce(async (snapshot) => {
      await gate.promise;
      return realSave(snapshot);
    });
    s.commit((j) => ({ ...j, notes: 'slow' }));
    await vi.advanceTimersByTimeAsync(400 + 299);
    expect(s.getState().save?.kind).toBe('saved');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.getState().save).toEqual({ kind: 'saving' });
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getState().save?.kind).toBe('saved');
  });

  it('shows an error with a plain message, and retry saves the same changes', async () => {
    const s = session();
    await openJob(s);
    vi.spyOn(db, 'saveJob').mockRejectedValueOnce({
      kind: 'diskFull',
      message: 'The disk is full, so changes can’t be saved. Free up some space and try again.',
    });
    s.commit((j) => ({ ...j, notes: 'keep me' }));
    await vi.advanceTimersByTimeAsync(400);
    const state = s.getState().save;
    if (state?.kind !== 'error') throw new Error(`expected an error, got ${state?.kind}`);
    expect(state.message).toMatch(/^The disk is full/);
    expect(s.hasUnsavedChanges()).toBe(true);
    expect(s.getJob()?.notes).toBe('keep me'); // the edit stays on screen

    state.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getState().save?.kind).toBe('saved');
    expect((await db.getJob('j-0014')).notes).toBe('keep me');
  });

  it('the next commit after an error saves everything still pending', async () => {
    const s = session();
    await openJob(s);
    vi.spyOn(db, 'saveJob').mockRejectedValueOnce({ kind: 'busy', message: 'busy' });
    s.commit((j) => ({ ...j, notes: 'a' }));
    await vi.advanceTimersByTimeAsync(400);
    s.commit((j) => ({ ...j, customer: 'b' }));
    await vi.advanceTimersByTimeAsync(400);
    expect(await db.getJob('j-0014')).toMatchObject({ notes: 'a', customer: 'b' });
    expect(s.getState().save?.kind).toBe('saved');
  });
});

describe('job session: validation at the boundary', () => {
  it('flags invalid cabinets but still saves them', async () => {
    const s = session();
    await openJob(s);
    s.commit((j) => ({ ...j, cabinets: [...j.cabinets, testCabinet('c-bad', 'B2', { width: ticks(0) })] }));
    expect(Object.keys(s.getState().issues)).toEqual(['c-bad']);
    expect(s.getState().issues['c-bad']?.[0]).toMatchObject({ field: 'width', severity: 'error' });
    await s.flush();
    expect((await db.getJob('j-0014')).cabinets.map((c) => c.id)).toEqual(['c-b1', 'c-bad']);
  });

  it('the database refuses impossible data with a plain message', async () => {
    const job = await db.getJob('j-0014');
    for (const bad of [{ width: ticks(-1) }, { shelfCount: -1 }, { quantity: 1.5 }, { type: 'tall' as never }]) {
      const error = await db.saveJob({ ...job, cabinets: [testCabinet('c', 'B1', bad)] }).catch(toStorageError);
      expect(error).toBeInstanceOf(StorageError);
      expect(error).toMatchObject({ kind: 'invalid' });
    }
  });
});

describe('flush on close', () => {
  it('the close handler waits for pending writes', async () => {
    const s = session();
    await openJob(s);
    let handler: (() => Promise<void>) | undefined;
    await installCloseGuard({ onCloseRequested: (h) => ((handler = h), Promise.resolve(() => {})) }, s);

    s.commit((j) => ({ ...j, notes: 'closing' }));
    const closing = handler!();
    let closed = false;
    void closing.then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toBe(true); // no 400 ms wait: flush saved at once
    expect((await db.getJob('j-0014')).notes).toBe('closing');
  });

  it('a hung write cannot keep the window open; the journal still has the edit', async () => {
    const s = session();
    await openJob(s);
    let handler: (() => Promise<void>) | undefined;
    await installCloseGuard({ onCloseRequested: (h) => ((handler = h), Promise.resolve(() => {})) }, s, 5000);
    vi.spyOn(db, 'saveJob').mockReturnValue(new Promise(() => {}));
    s.commit((j) => ({ ...j, notes: 'hung' }));
    let closed = false;
    void handler!().then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(4999);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(closed).toBe(true);
    expect(db.pendingJobIds()).toEqual(['j-0014']);
  });
});

describe('crash recovery', () => {
  it('journals each commit before the save, and a save clears it', async () => {
    const s = session();
    await openJob(s);
    s.commit((j) => ({ ...j, notes: 'edit' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(db.pendingJobIds()).toEqual(['j-0014']);
    await vi.advanceTimersByTimeAsync(400);
    expect(db.pendingJobIds()).toEqual([]);
  });

  it('killing the process mid-edit loses no committed change, and recovery applies once', async () => {
    const before = session();
    await openJob(before);
    before.commit((j) => ({ ...j, notes: 'committed just before the crash' }));
    before.commit((j) => ({ ...j, cabinets: [testCabinet('c-b1', 'B1', { width: inches(33) })] }));
    await vi.advanceTimersByTimeAsync(0); // the journal write lands…
    before.dispose(); // …then the process dies before the debounced save
    await vi.advanceTimersByTimeAsync(1000);
    expect((await db.getJob('j-0014')).notes).toBeNull();

    // Next start.
    const toasts: string[] = [];
    const recovered = await recoverPendingEdits(db, (m) => toasts.push(m));
    expect(recovered.map((r) => r.jobId)).toEqual(['j-0014']);
    expect(toasts).toEqual(['Recovered your last changes to Kitchen remodel.']);

    const after = session();
    const job = await openJob(after);
    expect(job.notes).toBe('committed just before the crash');
    expect(job.cabinets[0]?.width).toBe(inches(33));
    expect(job.revision).toBe(4);

    // Exactly once: a second pass finds nothing and says nothing.
    expect(await recoverPendingEdits(db, (m) => toasts.push(m))).toEqual([]);
    expect(toasts).toHaveLength(1);
    expect((await db.getJob('j-0014')).revision).toBe(4);
  });

  it('names several recovered jobs in one toast', async () => {
    db.seed([testJob({ id: 'j-2', number: 2, name: 'Laundry', cabinets: [testCabinet('c-l1', 'B1')] })]);
    await db.writePendingEdit({ ...(await db.getJob('j-0014')), notes: 'a' }, 3);
    await db.writePendingEdit({ ...(await db.getJob('j-2')), notes: 'b' }, 3);
    const toasts: string[] = [];
    await recoverPendingEdits(db, (m) => toasts.push(m));
    expect(toasts).toEqual(['Recovered your last changes to Kitchen remodel and 1 other job.']);
  });
});

describe('rules snapshots', () => {
  const partsFor = (job: JobRecord) => job.cabinets.map((c) => calculateParts(cabinetSpec(c), job.rules));

  it('changing shop defaults after creating a job leaves its calculated parts unchanged', async () => {
    const created = await db.createJob({ name: 'Before the change' });
    const s = session();
    await openJob(s, created.id);
    s.commit((j) => ({
      ...j,
      cabinets: [testCabinet('a', 'B1'), testCabinet('b', 'W1', { type: 'wall', height: inches(30), depth: inches(12) })],
    }));
    await s.flush();
    const partsBefore = partsFor(await db.getJob(created.id));
    expect(partsBefore.every((r) => r.parts.length > 0)).toBe(true);

    const thinner: ConstructionRules = { ...DEFAULT_RULES, panelThickness: inches(23 / 32), laminateOversizePerEdge: inches(1 / 2) };
    await db.setShopSetting(RULES_SETTING, thinner);
    expect((await db.getShopSettings()).rules).toEqual(thinner);

    // The existing job, reopened fresh, calculates exactly as before.
    const reopened = session();
    const job = await openJob(reopened, created.id);
    expect(job.rules).toEqual(DEFAULT_RULES);
    expect(partsFor(job)).toEqual(partsBefore);

    // A job created now picks up the new defaults, so its parts differ.
    const newer = await db.createJob({ name: 'After the change' });
    expect(newer.rules).toEqual(thinner);
    expect(partsFor({ ...newer, cabinets: job.cabinets })).not.toEqual(partsBefore);
  });

  it('a duplicate keeps its source job’s rules, not the shop defaults', async () => {
    await db.setShopSetting(RULES_SETTING, { ...DEFAULT_RULES, panelThickness: inches(23 / 32) });
    const copy = await db.duplicateJob('j-0014');
    expect(copy).toMatchObject({ name: 'Kitchen remodel (copy)', status: 'draft', number: 15, rules: upgradeVersion1Rules(DEFAULT_RULES) });
    expect(copy.cabinets[0]?.id).not.toBe('c-b1');
  });

  it('parseRules reads version 1 and refuses damaged or newer snapshots', () => {
    const version1 = version1Of(DEFAULT_RULES);
    // Version 1 had no method: it becomes method A1 with the base left off, so its parts don't change.
    expect(parseRules(version1, 1)).toEqual({ ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, listBase: false } });
    expect(parseRules({ ...version1, panelThickness: inches(23 / 32) }, 1).method.backThickness).toBeNull();
    expect(() => parseRules({ ...DEFAULT_RULES, panelThickness: 0.75 }, 1)).toThrow(/couldn’t be read/);
    expect(() => parseRules({ ...DEFAULT_RULES, shelfThickComparison: 'gteq' }, 1)).toThrow(StorageError);
    expect(() => parseRules({ ...DEFAULT_RULES }, RULES_VERSION + 1)).toThrow(/newer version/);
  });

  it('parseRules reads version 2 with its construction method, and refuses a damaged one', () => {
    expect(RULES_VERSION).toBe(2);
    const b = { ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, id: 'B', backThickness: inches(1 / 4) } };
    expect(parseRules(structuredClone(b), 2)).toEqual(b);
    expect(() => parseRules(version1Of(DEFAULT_RULES), 2)).toThrow(/couldn’t be read/);
    expect(() => parseRules({ ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, id: 'C' } }, 2)).toThrow(StorageError);
    expect(() => parseRules({ ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, kickDepth: '3' } }, 2)).toThrow(/couldn’t be read/);
    expect(() => parseRules({ ...DEFAULT_RULES, method: { ...DEFAULT_METHOD, listBase: 1 } }, 2)).toThrow(/couldn’t be read/);
  });

  it('reads shop defaults saved before construction methods with the default method, base listed', () => {
    expect(parseShopRules(version1Of({ ...DEFAULT_RULES, panelThickness: inches(23 / 32) }))).toEqual({
      ...DEFAULT_RULES,
      panelThickness: inches(23 / 32),
      method: DEFAULT_METHOD,
    });
    expect(parseShopRules(structuredClone(DEFAULT_RULES))).toEqual(DEFAULT_RULES);
  });
});

function version1Of(rules: ConstructionRules): Omit<ConstructionRules, 'method'> {
  const v1: Partial<ConstructionRules> = { ...rules };
  delete v1.method;
  return v1 as Omit<ConstructionRules, 'method'>;
}

describe('shared data files', () => {
  it('the Rust built-in default rules match the engine DEFAULT_RULES', () => {
    expect(defaultRulesJson).toEqual({ ...DEFAULT_RULES });
  });

  it('the dev sample jobs, saved as version 1, keep exactly their old cut lists', async () => {
    const jobs = await createMemoryClient().devLoadSampleJobs();
    const v1 = parseRules(version1Of(DEFAULT_RULES), 1);
    for (const job of jobs) {
      const specs = job.cabinets.map(cabinetSpec);
      // Same cabinet parts as the version 1 formulas (the golden fixtures pin those), and no base.
      for (const spec of specs) expect(calculateParts(spec, v1), `${job.name} ${spec.id}`).toEqual(calculateParts(spec, DEFAULT_RULES));
      const list = buildCutList(specs, v1);
      expect(list.lines.flatMap((l) => l.roles).filter((r) => r.startsWith('base-') || r === 'kick-skin' || r === 'kick-board'), job.name).toEqual([]);
      expect(list.jobIssues, job.name).toEqual([]);
    }
  });

  it('the dev sample jobs are valid cabinets', async () => {
    expect(sampleJobsJson.map((j) => j.number)).toEqual([14, 13, 12, 11, 9, 15, 16]);
    const empty = createMemoryClient();
    const jobs = await empty.devLoadSampleJobs();
    for (const job of jobs) {
      for (const cabinet of job.cabinets) {
        const errors = validate(cabinetSpec(cabinet), job.rules).filter((i) => i.severity === 'error');
        expect(errors, `${job.name} ${cabinet.label}`).toEqual([]);
      }
    }
  });

  it('a new database is empty', async () => {
    expect(await createMemoryClient().listJobs()).toEqual([]);
  });
});

describe('storage errors', () => {
  it('keeps the Rust error kind and message', () => {
    expect(toStorageError({ kind: 'notFound', message: 'That job no longer exists.' })).toMatchObject({
      kind: 'notFound',
      message: 'That job no longer exists.',
    });
  });

  it('turns Tauri argument errors into a plain message, keeping the detail', () => {
    const error = toStorageError('invalid args `job` for command `save_job`: unknown variant `tall`');
    expect(error.kind).toBe('storage');
    expect(error.message).not.toMatch(/variant/);
    expect(error.detail).toMatch(/unknown variant/);
  });
});
