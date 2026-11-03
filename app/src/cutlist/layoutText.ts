import type { Cut, CutNode, LayoutMode, LayoutStats, MaterialLayout, SheetPattern, Ticks } from '@kerfuffle/engine';
import { exactText } from '../lib/dimensions';

/**
 * Words and page plans for the sheet layouts, shared by the Layouts tab and
 * its printout so the two always say the same thing.
 */

export const MODE_NAMES: Readonly<Record<LayoutMode, string>> = { cost: 'Cost', grain: 'Grain', time: 'Time' };

export const MODE_HELP: Readonly<Record<LayoutMode, string>> = {
  cost: 'Fewest sheets',
  grain: 'Grain right on every piece, nothing turned',
  time: 'Fewest fence settings and patterns',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const sheetsText = (n: number) => plural(n, 'sheet');

/** "97 × 49" (the sheet as cut, length first). */
export function sheetSizeText(m: Pick<MaterialLayout, 'sheetLength' | 'sheetWidth'>): string {
  return `${exactText(m.sheetLength)} × ${exactText(m.sheetWidth)}`;
}

/** "3 sheets · 81.2% yield · 4 fence settings · 2 patterns · 38 cuts". */
export function statsText(stats: LayoutStats): string {
  return [
    sheetsText(stats.sheets),
    `${stats.yieldPercent.toFixed(1)}% yield`,
    plural(stats.fenceSettings, 'fence setting'),
    plural(stats.patterns, 'pattern'),
    plural(stats.cuts, 'cut'),
  ].join(' · ');
}

/**
 * The strip (1-based, in cut order) each cut belongs to: the first cuts
 * divide the sheet into strips; every later cut is inside one of them. First
 * cuts themselves get 0.
 */
export function stripOfCuts(pattern: Pick<SheetPattern, 'cutTree'>): Map<number, number> {
  const strips = new Map<number, number>();
  const root = pattern.cutTree;
  if (root.kind !== 'split') return strips;
  for (const c of root.cuts) strips.set(c, 0);
  const mark = (node: CutNode, strip: number) => {
    if (node.kind !== 'split') return;
    for (const c of node.cuts) strips.set(c, strip);
    node.children.forEach((child) => mark(child, strip));
  };
  let strip = 0;
  for (const child of root.children) {
    if (child.kind === 'offcut') continue;
    strip += 1;
    mark(child, strip);
  }
  return strips;
}

/** A strip on the sheet: the first cuts' pieces, in cut order. */
export interface Strip {
  n: number;
  /** Along this axis the strips lie side by side; `from`…`from + size` is this one. */
  axis: 'x' | 'y';
  from: Ticks;
  size: Ticks;
}

/** The strips the first cuts make, for dimensioning the rips in cut order. */
export function stripsOf(pattern: Pick<SheetPattern, 'cutTree'>): Strip[] {
  const root = pattern.cutTree;
  if (root.kind !== 'split') return [];
  let n = 0;
  return root.children.flatMap((child): Strip[] => {
    if (child.kind === 'offcut') return [];
    n += 1;
    const axis = root.axis;
    return [{ n, axis, from: (axis === 'y' ? child.y : child.x), size: (axis === 'y' ? child.width : child.length) }];
  });
}

export interface SequenceStep {
  /** 1-based step on the printout. */
  n: number;
  /** "Rip 23 1/8 ×2", "Strip 1: crosscut 30 ×3", "Strip 2: trim 11 3/4". */
  text: string;
  /** The pattern's cuts this step makes (indexes into `cuts`). */
  cuts: number[];
}

const STAGE_WORDS: Readonly<Record<Cut['stage'], string>> = { rip: 'rip', crosscut: 'crosscut', trim: 'trim' };

/**
 * The cut sequence in saw order, with repeats of one setting run together:
 * "1. Rip 23 1/8 ×2", "2. Rip 11 3/4", "3. Strip 1: crosscut 30 ×3". Sizes
 * are exact (to 1/64″), the way the fence is set.
 */
export function cutSequence(pattern: Pick<SheetPattern, 'cuts' | 'cutTree'>): SequenceStep[] {
  const strips = stripOfCuts(pattern);
  const steps: { strip: number; stage: Cut['stage']; setting: Ticks; cuts: number[] }[] = [];
  pattern.cuts.forEach((cut, i) => {
    const strip = cut.depth === 1 ? 0 : (strips.get(i) ?? 0);
    const last = steps.at(-1);
    if (last && last.strip === strip && last.stage === cut.stage && last.setting === cut.setting) last.cuts.push(i);
    else steps.push({ strip, stage: cut.stage, setting: cut.setting, cuts: [i] });
  });
  return steps.map((s, i) => {
    const what = `${STAGE_WORDS[s.stage]} ${exactText(s.setting)}${s.cuts.length > 1 ? ` ×${s.cuts.length}` : ''}`;
    const text = s.strip === 0 ? what.charAt(0).toUpperCase() + what.slice(1) : `Strip ${s.strip}: ${what}`;
    return { n: i + 1, text, cuts: s.cuts };
  });
}

/** One printed page of layouts: one pattern, or two small ones of the same material. */
export interface LayoutPage {
  material: number;
  patterns: number[];
  /** The material's last page: pieces that didn't fit are listed on it. */
  lastOfMaterial: boolean;
}

/** Two patterns share a page when both cut sequences are at most this long. */
export const SMALL_PATTERN_STEPS = 12;

/**
 * Pages for the printout, in material order then sheet order. Pure, so the
 * screen, the printer and the PDF get the same pages.
 */
export function layoutPages(materials: readonly Pick<MaterialLayout, 'patterns' | 'unplaced'>[]): LayoutPage[] {
  const pages: LayoutPage[] = [];
  materials.forEach((m, material) => {
    const start = pages.length;
    let i = 0;
    while (i < m.patterns.length) {
      const here = m.patterns[i]!;
      const next = m.patterns[i + 1];
      const small = (p: SheetPattern) => cutSequence(p).length <= SMALL_PATTERN_STEPS;
      if (next && small(here) && small(next)) {
        pages.push({ material, patterns: [i, i + 1], lastOfMaterial: false });
        i += 2;
      } else {
        pages.push({ material, patterns: [i], lastOfMaterial: false });
        i += 1;
      }
    }
    // Nothing fitted at all: still a page saying so.
    if (pages.length === start && m.unplaced.length > 0) pages.push({ material, patterns: [], lastOfMaterial: false });
    if (pages.length > start) pages[pages.length - 1]!.lastOfMaterial = true;
  });
  return pages;
}

/** The sheet numbers a pattern is cut on: "Sheets 1–3", "Sheet 4". */
export function sheetNumbersText(pattern: Pick<SheetPattern, 'sheets'>): string {
  const numbers = pattern.sheets.map((s) => s.number);
  if (numbers.length === 1) return `Sheet ${numbers[0]}`;
  const consecutive = numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1);
  return consecutive ? `Sheets ${numbers[0]}–${numbers.at(-1)}` : `Sheets ${numbers.join(', ')}`;
}
