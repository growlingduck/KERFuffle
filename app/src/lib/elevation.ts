import { inches, ticks, TICKS_PER_INCH } from '@kerfuffle/engine';
import type { CabinetType, Ticks } from '@kerfuffle/engine';
import { exactText, INCH } from './dimensions';

/**
 * Display constant, not a construction rule: job elevations hang wall cabinets
 * with their bottoms this far above the floor (a 36″ counter plus 18″ clear).
 * Nothing is calculated from it.
 */
export const WALL_CABINET_BOTTOM: Ticks = inches(54);

/** Stand-in sizes for a placeholder whose own size can't be drawn (zero or negative). */
const PLACEHOLDER_WIDTH: Ticks = inches(24);
const PLACEHOLDER_HEIGHT: Record<CabinetType, Ticks> = { base: inches(34.5), tall: inches(84), wall: inches(30) };

/** Most boxes drawn. Past this a huge quantity would only freeze the drawing. */
export const MAX_DRAWN_BOXES = 200;

export interface ElevationCabinet {
  label: string;
  type: CabinetType;
  width: Ticks;
  height: Ticks;
  quantity: number;
  /** Has validation errors: drawn as a dashed placeholder. */
  invalid: boolean;
}

export interface ElevationBox {
  key: string;
  label: string;
  type: CabinetType;
  /** From the left end of the run. */
  x: Ticks;
  /** Bottom edge above the floor: 0 for base and tall cabinets, WALL_CABINET_BOTTOM for wall cabinets. */
  bottom: Ticks;
  width: Ticks;
  height: Ticks;
  invalid: boolean;
}

export interface ElevationLayout {
  boxes: ElevationBox[];
  /** Overall extents, for scaling. */
  width: Ticks;
  height: Ticks;
  baseCount: number;
  tallCount: number;
  wallCount: number;
  invalidCount: number;
  /**
   * Total width of the cabinets on the floor (base and tall), or null when there
   * are none or the drawn run isn't their true width (a placeholder had no usable width, or boxes were
   * left out past MAX_DRAWN_BOXES).
   */
  baseRun: Ticks | null;
  /** Some boxes were left out (MAX_DRAWN_BOXES). */
  truncated: boolean;
}

/**
 * Lay a job out as a front elevation in true proportions: base cabinets side by
 * side on the floor, wall cabinets side by side from the same left end, hung
 * with their bottoms at WALL_CABINET_BOTTOM. A tall cabinet fills both rows: it
 * stands on the floor past whichever row is further along, and the base and wall
 * cabinets after it line up past it. A cabinet with quantity n is drawn n times.
 * Sizes stay in ticks; the drawing scales them.
 */
export function layoutElevation(cabinets: readonly ElevationCabinet[]): ElevationLayout {
  const boxes: ElevationBox[] = [];
  /** Where the next base and the next wall cabinet go. A tall cabinet moves both. */
  const cursor = { base: 0, wall: 0 };
  /** Floor length taken by base and tall cabinets: the base run. */
  let floorRun = 0;
  let truncated = false;
  let runIsTrue = true;
  let invalidCount = 0;

  cabinets.forEach((cabinet, index) => {
    if (cabinet.invalid) invalidCount += 1;
    const usableWidth = cabinet.width > 0;
    if (cabinet.type !== 'wall' && !usableWidth) runIsTrue = false;
    const width = usableWidth ? cabinet.width : PLACEHOLDER_WIDTH;
    const height = cabinet.height > 0 ? cabinet.height : PLACEHOLDER_HEIGHT[cabinet.type];
    const copies = Number.isInteger(cabinet.quantity) && cabinet.quantity > 1 ? cabinet.quantity : 1;
    for (let n = 0; n < copies; n++) {
      if (boxes.length >= MAX_DRAWN_BOXES) {
        truncated = true;
        return;
      }
      const x = cabinet.type === 'tall' ? Math.max(cursor.base, cursor.wall) : cursor[cabinet.type];
      boxes.push({
        key: `${index}-${n}`,
        label: cabinet.label,
        type: cabinet.type,
        x: ticks(x),
        bottom: cabinet.type === 'wall' ? WALL_CABINET_BOTTOM : ticks(0),
        width,
        height,
        invalid: cabinet.invalid,
      });
      if (cabinet.type === 'tall') {
        cursor.base = x + width;
        cursor.wall = x + width;
      } else {
        cursor[cabinet.type] = x + width;
      }
      if (cabinet.type !== 'wall') floorRun += width;
    }
  });

  const count = (type: CabinetType) => boxes.filter((b) => b.type === type).length;
  const baseCount = count('base');
  const tallCount = count('tall');
  return {
    boxes,
    width: ticks(Math.max(cursor.base, cursor.wall)),
    height: ticks(Math.max(0, ...boxes.map((b) => b.bottom + b.height))),
    baseCount,
    tallCount,
    wallCount: count('wall'),
    invalidCount,
    baseRun: baseCount + tallCount > 0 && runIsTrue && !truncated ? ticks(floorRun) : null,
    truncated,
  };
}

/** "3 base · 1 tall · 4 wall": boxes drawn by type, leaving out types with none. */
export function typeCounts(layout: Pick<ElevationLayout, 'baseCount' | 'tallCount' | 'wallCount'>): string {
  const parts: [number, string][] = [
    [layout.baseCount, 'base'],
    [layout.tallCount, 'tall'],
    [layout.wallCount, 'wall'],
  ];
  return parts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`).join(' · ');
}

/** Architectural feet and inches, e.g. 108″ → `9′-0″`, 109 1/2″ → `9′-1 1/2″`. */
export function feetAndInches(value: Ticks): string {
  const foot = 12 * TICKS_PER_INCH;
  const feet = Math.floor(value / foot);
  return `${feet}′-${exactText(ticks(value - feet * foot))}${INCH}`;
}
