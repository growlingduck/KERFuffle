import { DEFAULT_RULES, calculateParts, inches } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import { canonicalJson, JOB_FILE_VERSION, NEWER_FILE_MESSAGE, readJobFile, sha256Hex, writeJobFile } from '../src/data/jobFile';
import { cabinetSpec } from '../src/data/jobSession';
import { layoutElevation, typeCounts } from '../src/lib/elevation';
import type { ElevationCabinet } from '../src/lib/elevation';
import { elevationLabel } from '../src/screens/jobs/Elevation';
import { LABEL_PREFIX, newCabinet, nextLabel, TYPE_LABEL } from '../src/workspace/cabinets';
import { applyCommand } from '../src/workspace/commands';
import type { JobContent } from '../src/workspace/commands';
import { testCabinet, testJob } from './storage';

const HEADER = { appVersion: '0.2.0', exportedAt: '2026-11-07T14:00:00.000Z' };

const box = (label: string, type: ElevationCabinet['type'], width: number, height: number, quantity = 1): ElevationCabinet => ({
  label,
  type,
  width: inches(width),
  height: inches(height),
  quantity,
  invalid: false,
});

describe('tall cabinets in the elevation', () => {
  it('stands a tall cabinet on the floor past both rows, and lines up what comes after it', () => {
    // Base run 30, wall run 15 + 30 = 45: the tall cabinet starts at 45, and both rows carry on from 45 + 18 = 63.
    const layout = layoutElevation([
      box('B1', 'base', 30, 34.5),
      box('W1', 'wall', 15, 30),
      box('W2', 'wall', 30, 30),
      box('T1', 'tall', 18, 84),
      box('B2', 'base', 24, 34.5),
      box('W3', 'wall', 24, 30),
    ]);
    expect(layout.boxes.map((b) => [b.label, b.x, b.bottom])).toEqual([
      ['B1', 0, 0],
      ['W1', 0, inches(54)],
      ['W2', inches(15), inches(54)],
      ['T1', inches(45), 0],
      ['B2', inches(63), 0],
      ['W3', inches(63), inches(54)],
    ]);
    expect([layout.baseCount, layout.tallCount, layout.wallCount]).toEqual([2, 1, 3]);
    expect(typeCounts(layout)).toBe('2 base · 1 tall · 3 wall');
    // Tall widths take up floor length: 30 + 18 + 24.
    expect(layout.baseRun).toBe(inches(72));
    expect(layout.width).toBe(inches(87));
    expect(layout.height).toBe(inches(84));
    expect(elevationLabel('Pantry', layout)).toBe('Pantry elevation: 2 base cabinets, 1 tall cabinet and 3 wall cabinets, base run 6′-0″.');
  });

  it('counts each box of a tall cabinet with a quantity, and leaves out types with none', () => {
    const layout = layoutElevation([box('T1', 'tall', 24, 84, 2), box('B1', 'base', 30, 34.5)]);
    expect(layout.boxes.map((b) => b.x)).toEqual([0, inches(24), inches(48)]);
    expect(typeCounts(layout)).toBe('1 base · 2 tall');
    expect(elevationLabel('Utility', layout)).toBe('Utility elevation: 1 base cabinet, 2 tall cabinets and 0 wall cabinets, base run 6′-6″.');
  });
});

describe('new tall cabinets', () => {
  it('start 18 × 84 × 24 with 4 shelves, labeled T1, T2…, with a fixed shelf from the rule', () => {
    expect(LABEL_PREFIX.tall).toBe('T');
    expect(TYPE_LABEL.tall).toBe('Tall');
    const first = newCabinet([], 'tall', undefined, DEFAULT_RULES);
    expect(first).toMatchObject({ label: 'T1', type: 'tall', width: inches(18), height: inches(84), depth: inches(24), shelfCount: 4 });
    // 84 − 4 = 80, over the 72″ rule.
    expect(first.fixedShelfCount).toBe(1);
    expect(first.midNailer).toBe(true);
    expect(nextLabel([first], 'tall')).toBe('T2');
    expect(newCabinet([], 'tall', undefined, { ...DEFAULT_RULES, tallFixedShelfAbove: inches(80) }).fixedShelfCount).toBe(0);
    // Base and wall cabinets get none of the tall fields.
    expect(newCabinet([], 'base')).not.toHaveProperty('fixedShelfCount');
  });
});

describe('tall cabinet commands', () => {
  const tall = testCabinet('c-t1', 'T1', { type: 'tall', width: inches(18), height: inches(84), shelfCount: 4, fixedShelfCount: 2, midNailer: true, splitBack: true });
  const content = (): JobContent => ({ cabinets: [tall], status: 'draft', rules: DEFAULT_RULES, name: 'Pantry', customer: null, notes: null });

  it('sets the fixed shelves, mid nailer and split back as undoable steps', () => {
    const fixed = applyCommand(content(), { type: 'setFixedShelves', cabinetId: 'c-t1', value: 1 });
    expect(fixed?.content.cabinets[0]?.fixedShelfCount).toBe(1);
    expect(fixed?.label).toBe('Change fixed shelves on T1');
    expect(applyCommand(content(), { type: 'setFixedShelves', cabinetId: 'c-t1', value: 2 })).toBeNull();
    expect(applyCommand(content(), { type: 'setFixedShelves', cabinetId: 'c-t1', value: -1 })).toBeNull();
    expect(applyCommand(content(), { type: 'setMidNailer', cabinetId: 'c-t1', value: false })?.label).toBe('Remove the mid nailer on T1');
    expect(applyCommand(content(), { type: 'setSplitBack', cabinetId: 'c-t1', value: false })?.label).toBe('Join the back on T1');
    expect(applyCommand(content(), { type: 'setSplitBack', cabinetId: 'c-t1', value: true })).toBeNull();
  });

  it('keeps the tall-only values when switched to base and back, ignoring them meanwhile', () => {
    const asBase = applyCommand(content(), { type: 'setType', cabinetId: 'c-t1', value: 'base' })!.content;
    expect(asBase.cabinets[0]).toMatchObject({ type: 'base', fixedShelfCount: 2, midNailer: true, splitBack: true });
    const baseParts = calculateParts(cabinetSpec({ ...asBase.cabinets[0]!, height: inches(36) }), DEFAULT_RULES).parts;
    expect(baseParts.some((p) => p.role === 'fixed-shelf')).toBe(false);
    const back = applyCommand(asBase, { type: 'setType', cabinetId: 'c-t1', value: 'tall' })!.content;
    expect(back.cabinets[0]).toEqual(tall);
    expect(calculateParts(cabinetSpec(back.cabinets[0]!), DEFAULT_RULES).parts.filter((p) => p.role === 'fixed-shelf')[0]?.quantity).toBe(2);
  });
});

describe('.kerfjob with tall cabinets', () => {
  const job = () =>
    testJob({
      id: 'job-t',
      number: 20,
      cabinets: [
        testCabinet('c-b1', 'B1'),
        testCabinet('c-t1', 'T1', { type: 'tall', width: inches(18), height: inches(84), shelfCount: 4, fixedShelfCount: 1, midNailer: true, splitBack: true }),
        testCabinet('c-t2', 'T2', { type: 'tall', width: inches(24), height: inches(84), shelfCount: 2, fixedShelfCount: 0 }),
      ],
    });

  it('round-trips a tall cabinet and its options, and is format version 5', async () => {
    const text = await writeJobFile(job(), HEADER);
    const doc = JSON.parse(text) as { formatVersion: number; cabinets: Record<string, unknown>[] };
    expect(JOB_FILE_VERSION).toBe(5);
    expect(doc.formatVersion).toBe(5);
    expect(doc.cabinets[1]).toMatchObject({ type: 'tall', fixedShelfCount: 1, midNailer: true, splitBack: true });
    // Defaults are left out, so a base cabinet reads exactly as before.
    expect(doc.cabinets[0]).not.toHaveProperty('fixedShelfCount');
    expect(doc.cabinets[2]).not.toHaveProperty('fixedShelfCount');
    const reading = await readJobFile(text);
    if (!reading.ok) throw new Error(reading.message);
    expect(reading.job.cabinets[1]).toMatchObject({ type: 'tall', fixedShelfCount: 1, midNailer: true, splitBack: true });
    expect(reading.job.cabinets[2]).toMatchObject({ type: 'tall' });
    expect(reading.job.cabinets[2]).not.toHaveProperty('fixedShelfCount');
    expect(reading.flagged).toEqual([]);
  });

  it('imports an older file without the new fields with the defaults', async () => {
    const text = await writeJobFile(testJob({ cabinets: [testCabinet('c-b1', 'B1')] }), HEADER);
    const doc = JSON.parse(text) as Record<string, unknown>;
    delete doc.checksum;
    doc.formatVersion = 4;
    const older = JSON.stringify({ ...doc, checksum: await sha256Hex(canonicalJson(doc)) });
    const reading = await readJobFile(older);
    if (!reading.ok) throw new Error(reading.message);
    const [c] = reading.job.cabinets;
    expect(c).toMatchObject({ type: 'base' });
    expect(c?.fixedShelfCount ?? 0).toBe(0);
    expect(c?.midNailer ?? false).toBe(false);
    expect(c?.splitBack ?? false).toBe(false);
  });

  it('is refused as newer, not as unreadable, by a reader of the previous format', async () => {
    // A version 4 reader refuses anything past 4 before reading a cabinet; the same check, one version on.
    const text = await writeJobFile(job(), HEADER);
    const doc = JSON.parse(text) as Record<string, unknown>;
    delete doc.checksum;
    doc.formatVersion = JOB_FILE_VERSION + 1;
    const newer = JSON.stringify({ ...doc, checksum: await sha256Hex(canonicalJson(doc)) });
    expect(await readJobFile(newer)).toEqual({ ok: false, message: NEWER_FILE_MESSAGE });
  });

  it('refuses an impossible fixed-shelf count or option', async () => {
    for (const change of [
      (c: Record<string, unknown>) => (c.fixedShelfCount = -1),
      (c: Record<string, unknown>) => (c.fixedShelfCount = 1.5),
      (c: Record<string, unknown>) => (c.splitBack = 'yes'),
    ]) {
      const doc = JSON.parse(await writeJobFile(job(), HEADER)) as { cabinets: Record<string, unknown>[] } & Record<string, unknown>;
      delete doc.checksum;
      change(doc.cabinets[1]!);
      const bad = JSON.stringify({ ...doc, checksum: await sha256Hex(canonicalJson(doc)) });
      const reading = await readJobFile(bad);
      expect(reading.ok).toBe(false);
    }
  });
});
