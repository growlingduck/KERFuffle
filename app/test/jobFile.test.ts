import { DEFAULT_RULES, inches, upgradeVersion1Rules } from '@kerfuffle/engine';
import type { ConstructionRules } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  CHANGED_FILE_MESSAGE,
  jobFileName,
  NEWER_FILE_MESSAGE,
  NOT_A_JOB_FILE_MESSAGE,
  readJobFile,
  sha256Hex,
  writeJobFile,
} from '../src/data/jobFile';
import { createMemoryClient } from '../src/data/memoryClient';
import { RULES_VERSION } from '../src/data/rules';
import type { JobRecord } from '../src/data/types';
import { testCabinet, testJob } from './storage';

const HEADER = { appVersion: '0.1.0', exportedAt: '2026-11-01T14:00:00.000Z' };

/** A job with its own (non-default) rules, a customer, notes and an unfinished cabinet. */
function richJob(): JobRecord {
  return testJob({
    id: 'job-a',
    number: 14,
    customer: 'Smith',
    notes: 'Island deferred.\nUse “maple” ply — 23/32″.',
    status: 'ready',
    rules: upgradeVersion1Rules({ ...DEFAULT_RULES, panelThickness: inches(23 / 32), shelfSetback: inches(0) }),
    revision: 7,
    cabinets: [
      testCabinet('c-1', 'B1', { finishedEnds: 'both', room: 'Kitchen' }),
      testCabinet('c-2', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 }),
      testCabinet('c-3', 'B2', { width: inches(0), quantity: 0 }),
    ],
  });
}

/** Rewrite the file and give it a correct checksum, as a newer KERFuffle (or a careful editor) would. */
async function reseal(text: string, change: (doc: Record<string, unknown>) => void): Promise<string> {
  const doc = JSON.parse(text) as Record<string, unknown>;
  delete doc.checksum;
  change(doc);
  return JSON.stringify({ ...doc, checksum: await sha256Hex(canonicalJson(doc)) });
}

describe('.kerfjob files', () => {
  it('round-trips a job losslessly, through the file and into another database', async () => {
    const job = richJob();
    const text = await writeJobFile(job, HEADER);
    const doc = JSON.parse(text) as Record<string, unknown>;
    expect(doc).toMatchObject({ format: 'kerfuffle-job', formatVersion: 1, appVersion: '0.1.0', exportedAt: HEADER.exportedAt, rulesVersion: 1 });
    expect(doc.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect((doc.cabinets as { width: number }[])[0]!.width).toBe(inches(30)); // integer ticks

    const reading = await readJobFile(text);
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job).toEqual(job);
    expect(reading.header).toEqual(HEADER);

    const pcB = createMemoryClient();
    await pcB.importJob(reading.job, 'new');
    expect(await pcB.getJob('job-a')).toEqual(job);
  });

  it('checksums canonical JSON, so key order and indentation don’t matter', async () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }] })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
    const text = await writeJobFile(richJob(), HEADER);
    const doc = JSON.parse(text) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(doc).reverse());
    expect((await readJobFile(JSON.stringify(reordered))).ok).toBe(true);
    expect((await readJobFile(`FEFF${text}`)).ok).toBe(true);
  });

  it('refuses a file changed after export', async () => {
    const text = await writeJobFile(richJob(), HEADER);
    const tampered = text.replace(`"width": ${inches(30)}`, `"width": ${inches(31)}`);
    expect(tampered).not.toBe(text);
    expect(await readJobFile(tampered)).toEqual({ ok: false, message: CHANGED_FILE_MESSAGE });

    const doc = JSON.parse(text) as Record<string, unknown>;
    expect(await readJobFile(JSON.stringify({ ...doc, checksum: undefined }))).toEqual({ ok: false, message: CHANGED_FILE_MESSAGE });
  });

  it('refuses a file from a newer KERFuffle', async () => {
    const text = await writeJobFile(richJob(), HEADER);
    const newerFormat = await reseal(text, (doc) => (doc.formatVersion = 2));
    expect(await readJobFile(newerFormat)).toEqual({ ok: false, message: NEWER_FILE_MESSAGE });
    expect(NEWER_FILE_MESSAGE).toBe('This job was made by a newer KERFuffle. Update this PC first.');
    // Even when the newer format checks itself some other way.
    expect(await readJobFile(JSON.stringify({ ...JSON.parse(text), formatVersion: 2, checksum: 'other' }))).toEqual({
      ok: false,
      message: NEWER_FILE_MESSAGE,
    });
    const newerRules = await reseal(text, (doc) => (doc.rulesVersion = RULES_VERSION + 1));
    expect(await readJobFile(newerRules)).toEqual({ ok: false, message: NEWER_FILE_MESSAGE });
  });

  it('refuses other files and impossible values', async () => {
    for (const other of ['', 'hello', '[]', '{"format":"something-else","formatVersion":1}', '{"format":"kerfuffle-job"}']) {
      expect(await readJobFile(other)).toEqual({ ok: false, message: NOT_A_JOB_FILE_MESSAGE });
    }
    const text = await writeJobFile(richJob(), HEADER);
    const cabinet = (doc: Record<string, unknown>) => (doc.cabinets as Record<string, unknown>[])[0]!;
    const bad: [string, (doc: Record<string, unknown>) => void][] = [
      ['unknown type', (doc) => (cabinet(doc).type = 'tall')],
      ['unknown finishedEnds', (doc) => (cabinet(doc).finishedEnds = 'front')],
      ['impossible width', (doc) => (cabinet(doc).width = -64)],
      ['impossible width', (doc) => (cabinet(doc).width = 30.5)],
      ['unknown status', (doc) => ((doc.job as Record<string, unknown>).status = 'lost')],
      ['construction settings', (doc) => ((doc.rules as Record<string, unknown>).shelfThickComparison = 'about')],
      ['appears twice', (doc) => (cabinet(doc).id = 'c-2')],
    ];
    for (const [expected, change] of bad) {
      const reading = await readJobFile(await reseal(text, change));
      expect(reading.ok, expected).toBe(false);
      if (!reading.ok) expect(reading.message, expected).toContain(expected);
    }
  });

  it('carries each cabinet’s run, and reads older files that have none', async () => {
    const job = richJob();
    job.cabinets[0]!.run = 'Sink wall';
    const text = await writeJobFile(job, HEADER);
    const cabinets = (JSON.parse(text) as { cabinets: Record<string, unknown>[] }).cabinets;
    expect(cabinets.map((c) => c.run)).toEqual(['Sink wall', undefined, undefined]);
    const reading = await readJobFile(text);
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job).toEqual(job);
  });

  it('upgrades a version 1 file to method A1 with the base left off, and keeps a version 2 file’s method', async () => {
    const version1: Partial<ConstructionRules> = { ...DEFAULT_RULES };
    delete version1.method;
    const old = await reseal(await writeJobFile(richJob(), HEADER), (doc) => (doc.rules = version1));
    const reading = await readJobFile(old);
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job.rules).toEqual(upgradeVersion1Rules(DEFAULT_RULES));

    const b = testJob({ rulesVersion: RULES_VERSION, rules: { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, id: 'B' } } });
    const newer = await readJobFile(await writeJobFile(b, HEADER));
    if (!newer.ok) throw new Error(newer.message);
    expect(newer.job.rules.method.id).toBe('B');
    expect(newer.job.rulesVersion).toBe(2);
  });

  it('lets cabinets the engine flags through, and lists them', async () => {
    const reading = await readJobFile(await writeJobFile(richJob(), HEADER));
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job.cabinets.map((c) => c.label)).toEqual(['B1', 'W1', 'B2']);
    expect(reading.flagged).toHaveLength(1);
    expect(reading.flagged[0]!.label).toBe('B2');
    expect(reading.flagged[0]!.messages.join(' ')).toMatch(/Width must be greater than zero/);
  });

  it('names the file after the job and its number, safely for Windows', () => {
    expect(jobFileName({ name: 'Kitchen remodel', number: 14 })).toBe('Kitchen remodel (J-0014).kerfjob');
    expect(jobFileName({ name: 'Smith: "upper" cabinets / phase 2?', number: 7 })).toBe('Smith- -upper- cabinets - phase 2- (J-0007).kerfjob');
    expect(jobFileName({ name: 'Garage...', number: 3 })).toBe('Garage (J-0003).kerfjob');
    expect(jobFileName({ name: '   ', number: 3 })).toBe('Job (J-0003).kerfjob');
  });
});
