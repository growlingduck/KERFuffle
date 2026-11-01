import { DEFAULT_RULES, inches, ticks } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import type { CabinetRecord } from '../src/data/types';
import { layoutDrawing } from '../src/screens/workspace/CabinetDrawing';
import { evaluateCabinet } from '../src/workspace/calc';
import { diffParts } from '../src/workspace/revision';
import { testCabinet } from './storage';

/** One frame at 60 Hz. */
const FRAME_MS = 16;

function job40(): CabinetRecord[] {
  return Array.from({ length: 40 }, (_, i) =>
    testCabinet(`c-${i}`, `${i % 3 === 0 ? 'W' : 'B'}${i + 1}`, {
      type: i % 3 === 0 ? 'wall' : 'base',
      width: inches(12 + (i % 9) * 3),
      height: inches(i % 3 === 0 ? 30 : 36),
      depth: inches(i % 3 === 0 ? 12 : 24),
      shelfCount: 1 + (i % 3),
      finishedEnds: (['none', 'left', 'right', 'both'] as const)[i % 4] ?? 'none',
      quantity: 1 + (i % 2),
    }),
  );
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe('typing benchmark (40-cabinet job)', () => {
  it('recalculates the whole job for one keystroke in under a frame', () => {
    const cabinets = job40();
    // Fresh rules object per run: nothing is cached from earlier runs.
    const samples: number[] = [];
    for (let run = 0; run < 15; run++) {
      const rules = { ...DEFAULT_RULES };
      const typed = cabinets[7]!;
      const start = performance.now();
      // What a keystroke costs: every cabinet's list row and totals, plus the
      // edited cabinet's drawing and revision diff, from a cold cache.
      const all = cabinets.map((c) => evaluateCabinet(c, rules, { cabinetId: typed.id, field: 'width', value: ticks(typed.width + run + 1) }));
      const live = all[7]!;
      layoutDrawing(live, rules);
      diffParts(evaluateCabinet(typed, rules).parts, live.parts);
      samples.push(performance.now() - start);
    }
    expect(median(samples)).toBeLessThan(FRAME_MS);
  });

  it('reuses results: only the cabinet being typed in is recalculated', () => {
    const cabinets = job40();
    const rules = { ...DEFAULT_RULES };
    const first = cabinets.map((c) => evaluateCabinet(c, rules));
    const typed = cabinets[7]!;
    const second = cabinets.map((c) => evaluateCabinet(c, rules, { cabinetId: typed.id, field: 'width', value: ticks(typed.width + 4) }));
    second.forEach((e, i) => {
      if (i === 7) expect(e.parts).not.toBe(first[i]!.parts);
      else expect(e.parts).toBe(first[i]!.parts);
    });
  });
});
