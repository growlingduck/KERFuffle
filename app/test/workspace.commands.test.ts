import { DEFAULT_RULES, calculateParts, inches } from '@kerfuffle/engine';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { cabinetSpec } from '../src/data/jobSession';
import { jobSession } from '../src/data/storage';
import { jobsStore } from '../src/state/jobs';
import { nextLabel } from '../src/workspace/cabinets';
import { applyCommand } from '../src/workspace/commands';
import type { Command, JobContent } from '../src/workspace/commands';
import { HISTORY_LIMIT, historyStore, redo, runCommand, undo } from '../src/workspace/history';
import { diffParts, wasText } from '../src/workspace/revision';
import { selectCabinet, selectedCabinetId, workspaceUi } from '../src/workspace/ui';
import { testCabinet, testJob, useTestDatabase } from './storage';

const b1 = testCabinet('c-b1', 'B1', { height: inches(36), finishedEnds: 'left' });
const b2 = testCabinet('c-b2', 'B2', { width: inches(42) });
const w1 = testCabinet('c-w1', 'W1', { type: 'wall', height: inches(30), depth: inches(12), shelfCount: 2 });
const content = (): JobContent => ({ cabinets: [b1, b2, w1], status: 'draft', rules: DEFAULT_RULES });

describe('command reducers', () => {
  const cases: [string, Command, (c: JobContent) => void, string][] = [
    ['setDimension', { type: 'setDimension', cabinetId: 'c-b1', field: 'width', value: inches(32) }, (c) => expect(c.cabinets[0]?.width).toBe(inches(32)), 'Change width on B1'],
    ['setType', { type: 'setType', cabinetId: 'c-b1', value: 'wall' }, (c) => {
      expect(c.cabinets[0]?.type).toBe('wall');
      expect(c.cabinets[0]?.height).toBe(inches(36)); // keeps the user's height
    }, 'Make B1 a wall cabinet'],
    ['setShelves', { type: 'setShelves', cabinetId: 'c-b1', value: 3 }, (c) => expect(c.cabinets[0]?.shelfCount).toBe(3), 'Change shelves on B1'],
    ['setQuantity', { type: 'setQuantity', cabinetId: 'c-b2', value: 4 }, (c) => expect(c.cabinets[1]?.quantity).toBe(4), 'Change quantity on B2'],
    ['setFinishedEnds', { type: 'setFinishedEnds', cabinetId: 'c-w1', value: 'both' }, (c) => expect(c.cabinets[2]?.finishedEnds).toBe('both'), 'Change finished ends on W1'],
    ['renameCabinet', { type: 'renameCabinet', cabinetId: 'c-b2', label: ' Sink ' }, (c) => expect(c.cabinets[1]?.label).toBe('Sink'), 'Rename B2 to Sink'],
    ['addCabinet', { type: 'addCabinet', cabinet: testCabinet('c-new', 'B3') }, (c) => expect(c.cabinets.map((x) => x.label)).toEqual(['B1', 'B2', 'W1', 'B3']), 'Add B3'],
    ['duplicateCabinet', { type: 'duplicateCabinet', cabinetId: 'c-b1', newId: 'c-dup' }, (c) => {
      expect(c.cabinets.map((x) => x.label)).toEqual(['B1', 'B3', 'B2', 'W1']);
      expect(c.cabinets[1]).toMatchObject({ ...b1, id: 'c-dup', label: 'B3' });
    }, 'Duplicate B1 as B3'],
    ['removeCabinet', { type: 'removeCabinet', cabinetId: 'c-b2' }, (c) => expect(c.cabinets.map((x) => x.id)).toEqual(['c-b1', 'c-w1']), 'Remove B2'],
    ['reorderCabinet', { type: 'reorderCabinet', cabinetId: 'c-w1', toIndex: 0 }, (c) => expect(c.cabinets.map((x) => x.id)).toEqual(['c-w1', 'c-b1', 'c-b2']), 'Move W1'],
    ['setStatus', { type: 'setStatus', status: 'ready' }, (c) => expect(c.status).toBe('ready'), 'Mark job ready to cut'],
  ];

  it.each(cases)('%s changes the job and names the step', (_name, command, check, label) => {
    const before = content();
    const result = applyCommand(before, command);
    expect(result).not.toBeNull();
    check(result!.content);
    expect(result!.label).toBe(label);
    // Pure: the input is untouched.
    expect(before).toEqual(content());
  });

  it('returns null when nothing would change', () => {
    expect(applyCommand(content(), { type: 'setDimension', cabinetId: 'c-b1', field: 'width', value: b1.width })).toBeNull();
    expect(applyCommand(content(), { type: 'setStatus', status: 'draft' })).toBeNull();
    expect(applyCommand(content(), { type: 'reorderCabinet', cabinetId: 'c-b1', toIndex: 0 })).toBeNull();
    expect(applyCommand(content(), { type: 'setShelves', cabinetId: 'c-b1', value: -1 })).toBeNull();
    expect(applyCommand(content(), { type: 'setQuantity', cabinetId: 'c-b1', value: 0 })).toBeNull();
    expect(applyCommand(content(), { type: 'setShelves', cabinetId: 'missing', value: 2 })).toBeNull();
  });

  it('never removes the last cabinet', () => {
    expect(applyCommand({ cabinets: [b1], status: 'draft', rules: DEFAULT_RULES }, { type: 'removeCabinet', cabinetId: 'c-b1' })).toBeNull();
  });

  it('removing selects the next cabinet, or the previous at the end', () => {
    expect(applyCommand(content(), { type: 'removeCabinet', cabinetId: 'c-b2' })?.select).toBe('c-w1');
    expect(applyCommand(content(), { type: 'removeCabinet', cabinetId: 'c-w1' })?.select).toBe('c-b2');
  });

  it('new labels take the lowest free number for their type', () => {
    expect(nextLabel([b1, b2, w1], 'base')).toBe('B3');
    expect(nextLabel([b1, b2, w1], 'wall')).toBe('W2');
    expect(nextLabel([b2], 'base')).toBe('B1');
    expect(nextLabel([{ ...b1, label: 'b1' }], 'base')).toBe('B2');
  });
});

describe('undo and redo', () => {
  beforeEach(async () => {
    await useTestDatabase([testJob({ cabinets: [b1, b2, w1] })]);
    await act(() => jobSession.open('j-0014'));
  });

  const commands: Command[] = [
    { type: 'setDimension', cabinetId: 'c-b1', field: 'depth', value: inches(21) },
    { type: 'setType', cabinetId: 'c-b2', value: 'wall' },
    { type: 'setShelves', cabinetId: 'c-w1', value: 0 },
    { type: 'setQuantity', cabinetId: 'c-b1', value: 2 },
    { type: 'setFinishedEnds', cabinetId: 'c-b1', value: 'right' },
    { type: 'renameCabinet', cabinetId: 'c-w1', label: 'W9' },
    { type: 'addCabinet', cabinet: testCabinet('c-new', 'B3') },
    { type: 'duplicateCabinet', cabinetId: 'c-w1', newId: 'c-dup' },
    { type: 'removeCabinet', cabinetId: 'c-b1' },
    { type: 'reorderCabinet', cabinetId: 'c-w1', toIndex: 0 },
    { type: 'setStatus', status: 'completed' },
  ];

  it.each(commands.map((c) => [c.type, c] as const))('%s round-trips through undo and redo', (_type, command) => {
    const before = jobSession.getJob()!;
    const entry = act(() => runCommand(command));
    expect(entry).not.toBeNull();
    const after = jobSession.getJob()!;
    expect({ cabinets: after.cabinets, status: after.status }).not.toEqual({ cabinets: before.cabinets, status: before.status });

    act(() => void undo());
    expect(jobSession.getJob()!.cabinets).toEqual(before.cabinets);
    expect(jobSession.getJob()!.status).toBe(before.status);

    act(() => void redo());
    expect(jobSession.getJob()!.cabinets).toEqual(after.cabinets);
    expect(jobSession.getJob()!.status).toBe(after.status);
  });

  it('a status change also updates the header at once', () => {
    act(() => void runCommand({ type: 'setStatus', status: 'ready' }));
    expect(jobsStore.getState().jobs['j-0014']?.status).toBe('ready');
    act(() => void undo());
    expect(jobsStore.getState().jobs['j-0014']?.status).toBe('draft');
  });

  it('undoing a removal puts the cabinet back in place, with the same id and label, and selects it', () => {
    act(() => selectCabinet('c-b2'));
    act(() => void runCommand({ type: 'removeCabinet', cabinetId: 'c-b2' }));
    expect(selectedCabinetId()).toBe('c-w1');
    act(() => void undo());
    expect(jobSession.getJob()!.cabinets.map((c) => [c.id, c.label])).toEqual([
      ['c-b1', 'B1'],
      ['c-b2', 'B2'],
      ['c-w1', 'W1'],
    ]);
    expect(selectedCabinetId()).toBe('c-b2');
  });

  it('a new command clears redo', () => {
    act(() => void runCommand(commands[0]!));
    act(() => void undo());
    expect(historyStore.getState().future).toHaveLength(1);
    act(() => void runCommand(commands[3]!));
    expect(historyStore.getState().future).toHaveLength(0);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    act(() => {
      for (let n = 1; n <= HISTORY_LIMIT + 20; n++) runCommand({ type: 'setQuantity', cabinetId: 'c-b1', value: n + 1 });
    });
    const past = historyStore.getState().past;
    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[0]?.after.cabinets[0]?.quantity).toBe(22);
  });

  it('is cleared when the job is closed', async () => {
    act(() => void runCommand(commands[0]!));
    expect(historyStore.getState().past).toHaveLength(1);
    await act(() => jobSession.close());
    expect(historyStore.getState().past).toHaveLength(0);
  });

  it('records revision marks on commit, undo and redo, for the selected cabinet only', () => {
    act(() => selectCabinet('c-b1'));
    act(() => void runCommand({ type: 'setDimension', cabinetId: 'c-b1', field: 'width', value: inches(32) }));
    const first = workspaceUi.getState().marks;
    expect(first?.cabinetId).toBe('c-b1');
    expect(Object.keys(first!.changes).sort()).toEqual(['back', 'bottom', 'front', 'laminate-front', 'shelf', 'top']);

    act(() => void undo());
    const second = workspaceUi.getState().marks;
    expect(second!.rev).toBeGreaterThan(first!.rev);
    expect(second!.changes.back?.was?.width).toBe(inches(32));

    act(() => void redo());
    expect(workspaceUi.getState().marks!.changes.back?.was?.width).toBe(inches(30));

    // Selecting another cabinet clears them.
    act(() => selectCabinet('c-b2'));
    expect(workspaceUi.getState().marks).toBeNull();
  });
});

describe('revision diff', () => {
  const parts = (width: number) =>
    calculateParts(cabinetSpec(testCabinet('c-b1', 'B1', { width: inches(width), height: inches(36), finishedEnds: 'left' })), DEFAULT_RULES).parts;

  it('changing width from 30 to 32 marks back, bottom, top, front, shelf and front laminate, and nothing else', () => {
    const changes = diffParts(parts(30), parts(32));
    expect(Object.keys(changes).sort()).toEqual(['back', 'bottom', 'front', 'laminate-front', 'shelf', 'top']);
    expect(changes.back?.fields).toEqual(['W']);
    expect(changes.bottom?.fields).toEqual(['L']);
    expect(changes.shelf?.fields).toEqual(['L']);
    expect(changes['laminate-front']?.fields).toEqual(['W']);
  });

  it('says what the part was', () => {
    const changes = diffParts(parts(30), parts(32));
    expect(wasText(changes.shelf!)).toBe('Was 28 1/4 × 23 1/8 × 3/4, qty 1');
    expect(wasText(changes['laminate-front']!)).toBe('Was 32 1/2 × 32, qty 1');
  });

  it('crossing 36″ also marks the shelf thickness', () => {
    expect(diffParts(parts(35), parts(36)).shelf?.fields).toEqual(['L', 'T']);
  });

  it('a part that appears is marked new', () => {
    const none = calculateParts(cabinetSpec(testCabinet('c', 'B1', { height: inches(36) })), DEFAULT_RULES).parts;
    const left = calculateParts(cabinetSpec(testCabinet('c', 'B1', { height: inches(36), finishedEnds: 'left' })), DEFAULT_RULES).parts;
    const changes = diffParts(none, left);
    expect(Object.keys(changes)).toEqual(['laminate-side-left']);
    expect(wasText(changes['laminate-side-left']!)).toBe('New part');
  });
});
