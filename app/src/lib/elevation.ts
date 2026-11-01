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
const PLACEHOLDER_HEIGHT: Record<CabinetType, Ticks> = { base: inches(34.5), wall: inches(30) };

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
  /** Bottom edge above the floor: 0 for base cabinets, WALL_CABINET_BOTTOM for wall cabinets. */
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
  wallCount: number;
  invalidCount: number;
  /**
   * Total width of the base cabinets, or null when there are none or the drawn
   * run isn't their true width (a placeholder had no usable width, or boxes were
   * left out past MAX_DRAWN_BOXES).
   */
  baseRun: Ticks | null;
  /** Some boxes were left out (MAX_DRAWN_BOXES). */
  truncated: boolean;
}

/**
 * Lay a job out as a front elevation in true proportions: base cabinets side by
 * side on the floor, wall cabinets side by side from the same left end, hung
 * with their bottoms at WALL_CABINET_BOTTOM. A cabinet with quantity n is drawn n
 * times. Sizes stay in ticks; the drawing scales them.
 */
export function layoutElevation(cabinets: readonly ElevationCabinet[]): ElevationLayout {
  const boxes: ElevationBox[] = [];
  const cursor: Record<CabinetType, number> = { base: 0, wall: 0 };
  let truncated = false;
  let runIsTrue = true;
  let invalidCount = 0;

  cabinets.forEach((cabinet, index) => {
    if (cabinet.invalid) invalidCount += 1;
    const usableWidth = cabinet.width > 0;
    if (cabinet.type === 'base' && !usableWidth) runIsTrue = false;
    const width = usableWidth ? cabinet.width : PLACEHOLDER_WIDTH;
    const height = cabinet.height > 0 ? cabinet.height : PLACEHOLDER_HEIGHT[cabinet.type];
    const copies = Number.isInteger(cabinet.quantity) && cabinet.quantity > 1 ? cabinet.quantity : 1;
    for (let n = 0; n < copies; n++) {
      if (boxes.length >= MAX_DRAWN_BOXES) {
        truncated = true;
        return;
      }
      boxes.push({
        key: `${index}-${n}`,
        label: cabinet.label,
        type: cabinet.type,
        x: ticks(cursor[cabinet.type]),
        bottom: cabinet.type === 'wall' ? WALL_CABINET_BOTTOM : ticks(0),
        width,
        height,
        invalid: cabinet.invalid,
      });
      cursor[cabinet.type] += width;
    }
  });

  const baseCount = boxes.filter((b) => b.type === 'base').length;
  return {
    boxes,
    width: ticks(Math.max(cursor.base, cursor.wall)),
    height: ticks(Math.max(0, ...boxes.map((b) => b.bottom + b.height))),
    baseCount,
    wallCount: boxes.length - baseCount,
    invalidCount,
    baseRun: baseCount > 0 && runIsTrue && !truncated ? ticks(cursor.base) : null,
    truncated,
  };
}

/** Architectural feet and inches, e.g. 108″ → `9′-0″`, 109 1/2″ → `9′-1 1/2″`. */
export function feetAndInches(value: Ticks): string {
  const foot = 12 * TICKS_PER_INCH;
  const feet = Math.floor(value / foot);
  return `${feet}′-${exactText(ticks(value - feet * foot))}${INCH}`;
}
