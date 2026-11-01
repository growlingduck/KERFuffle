import { cx } from '../../lib/interaction';
import styles from './drawing.module.css';
import { interactionAttrs } from './types';
import type { DrawingInteractionProps } from './types';

/** Half-length of a 45° slash tick. */
const TICK = 4.5;
/** Mono 11 px advance plus box padding: an estimate that keeps layout synchronous. */
const CHAR_W = 6.7;
const BOX_PAD = 10;
const BOX_H = 16;

export function labelWidth(text: string): number {
  return text.length * CHAR_W + BOX_PAD;
}

/** Does the label fit on a segment of this length, or does it move beside the line? */
export function labelFits(text: string, length: number): boolean {
  return length >= labelWidth(text) + 10;
}

export interface DimensionLineProps extends DrawingInteractionProps {
  /** Ends of the dimension line. Equal y → horizontal; equal x → vertical. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The measurement, already formatted, e.g. `23 3/4″`. */
  label: string;
  /**
   * Where the extension lines start: the edge of the object, on the axis across the
   * line (y for a horizontal line, x for a vertical one). One value for both ends or
   * a pair. Omit for no extension lines.
   */
  extendFrom?: number | readonly [number, number] | undefined;
  /** Gap between the object and the start of an extension line. */
  gap?: number;
  /** How far extension lines run past the dimension line. */
  overshoot?: number;
}

/**
 * A dimension: line with 45° slash ticks, extension lines that stop short of the
 * object, and the value on a white box centered on the line. When the segment is
 * too short for the label, the label moves beside the line.
 */
export function DimensionLine({ x1, y1, x2, y2, label, extendFrom, gap = 4, overshoot = 5, className, ...interaction }: DimensionLineProps) {
  const vertical = x1 === x2 && y1 !== y2;
  const length = vertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  const fits = labelFits(label, length);
  const bw = labelWidth(label);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const ticks = `M${x1 - TICK} ${y1 + TICK}L${x1 + TICK} ${y1 - TICK}M${x2 - TICK} ${y2 + TICK}L${x2 + TICK} ${y2 - TICK}`;

  let ext = '';
  if (extendFrom !== undefined) {
    const [fromA, fromB] = typeof extendFrom === 'number' ? [extendFrom, extendFrom] : extendFrom;
    const segment = (edge: number, line: number, along: number) => {
      const dir = line >= edge ? 1 : -1;
      const start = edge + gap * dir;
      const end = line + overshoot * dir;
      return vertical ? `M${start} ${along}H${end}` : `M${along} ${start}V${end}`;
    };
    ext = vertical ? segment(fromA, x1, y1) + segment(fromB, x1, y2) : segment(fromA, y1, x1) + segment(fromB, y1, x2);
  }

  // Label placement: centered on the line, rotated for vertical lines; beside the line when it doesn't fit.
  let tx = mx;
  const ty = my;
  let transform: string | undefined;
  if (!fits) {
    if (vertical) tx = x1 + 9 + bw / 2;
    else tx = Math.max(x1, x2) + 8 + bw / 2;
  } else if (vertical) {
    transform = `rotate(-90 ${mx} ${my})`;
  }

  // Hit area: the line ± 9 px, plus the label when it sits beside.
  const hit = vertical
    ? { x: x1 - 9, y: Math.min(y1, y2), width: 18 + (fits ? 0 : bw + 10), height: length }
    : { x: Math.min(x1, x2), y: y1 - 9, width: length + (fits ? 0 : bw + 10), height: 18 };

  return (
    <g className={cx(styles.group, className)} {...interactionAttrs(interaction)}>
      {ext && <path className={styles.extLine} d={ext} />}
      <line className={styles.dimLine} x1={x1} y1={y1} x2={x2} y2={y2} />
      <path className={styles.dimLine} d={ticks} />
      <g transform={transform}>
        <rect className={styles.labelBox} x={tx - bw / 2} y={ty - BOX_H / 2} width={bw} height={BOX_H} rx={2} />
        <text className={styles.labelText} x={tx} y={ty}>
          {label}
        </text>
      </g>
      <rect className={styles.hit} {...hit} />
    </g>
  );
}
