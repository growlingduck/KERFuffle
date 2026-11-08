import { DEFAULT_RULES, defaultFixedShelfCount, inches } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, FinishedEnds, Ticks } from '@kerfuffle/engine';
import type { CabinetRecord } from '../data/types';

/** Label prefix per type: B1, B2… for base cabinets, T1, T2… for tall, W1, W2… for wall. */
export const LABEL_PREFIX: Record<CabinetType, string> = { base: 'B', tall: 'T', wall: 'W' };

/** Same label, ignoring case and outer spaces: "b1 " and "B1" collide on the cut list. */
export function labelKey(label: string): string {
  return label.trim().toUpperCase();
}

/** The lowest free label for a type, e.g. B4 when B1–B3 exist. */
export function nextLabel(cabinets: readonly CabinetRecord[], type: CabinetType): string {
  const used = new Set(cabinets.map((c) => labelKey(c.label)));
  const prefix = LABEL_PREFIX[type];
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Labels used by more than one cabinet (normalized). Blank labels don't count. */
export function duplicateLabels(cabinets: readonly Pick<CabinetRecord, 'label'>[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of cabinets) {
    const key = labelKey(c.label);
    if (key === '') continue;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return dupes;
}

export function isDuplicateLabel(label: string, dupes: ReadonlySet<string>): boolean {
  return dupes.has(labelKey(label));
}

/** Starting sizes for a new cabinet of each type (the prototype's presets). */
export const NEW_CABINET: Record<CabinetType, { width: Ticks; height: Ticks; depth: Ticks; shelfCount: number }> = {
  base: { width: inches(24), height: inches(36), depth: inches(24), shelfCount: 1 },
  tall: { width: inches(18), height: inches(84), depth: inches(24), shelfCount: 4 },
  wall: { width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 },
};

/** Widths offered in the Add cabinet ▾ preset menu. */
export const PRESET_WIDTHS: readonly number[] = [12, 15, 18, 24, 30, 36];

/**
 * A new cabinet with the starting sizes for its type. A tall one starts with
 * the fixed shelves the job's rule gives its height, and the mid nailer on
 * (it only applies with an inset back).
 */
export function newCabinet(
  cabinets: readonly CabinetRecord[],
  type: CabinetType,
  width?: Ticks,
  rules: ConstructionRules = DEFAULT_RULES,
): CabinetRecord {
  const size = NEW_CABINET[type];
  const tall = type === 'tall' ? { fixedShelfCount: defaultFixedShelfCount(size.height, rules), midNailer: true } : {};
  return {
    id: crypto.randomUUID(),
    label: nextLabel(cabinets, type),
    type,
    width: width ?? size.width,
    height: size.height,
    depth: size.depth,
    shelfCount: size.shelfCount,
    finishedEnds: 'none',
    quantity: 1,
    room: null,
    ...tall,
  };
}

export const ENDS_TEXT: Record<FinishedEnds, string> = {
  none: 'No finished ends',
  left: 'Left end finished',
  right: 'Right end finished',
  both: 'Both ends finished',
};

export const TYPE_LABEL: Record<CabinetType, string> = { base: 'Base', tall: 'Tall', wall: 'Wall' };

/** The types in the order the app offers them: base, tall, wall. */
export const CABINET_TYPE_ORDER: readonly CabinetType[] = ['base', 'tall', 'wall'];
