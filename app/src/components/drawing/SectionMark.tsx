import { cx } from '../../lib/interaction';
import styles from './drawing.module.css';
import { interactionAttrs } from './types';
import type { DrawingInteractionProps } from './types';

export type SectionDirection = 'right' | 'left' | 'up' | 'down';

export interface SectionMarkProps extends DrawingInteractionProps {
  /** Tip of the arrow. */
  x: number;
  y: number;
  /** The way the section looks. */
  direction?: SectionDirection;
  /** Section letter, e.g. "B". */
  letter: string;
}

const ANGLE: Record<SectionDirection, number> = { right: 0, down: 90, left: 180, up: 270 };
const TAIL = 16;
const HEAD = 8;

/** Section-cut arrow with its letter: says where a section view is taken. */
export function SectionMark({ x, y, direction = 'right', letter, className, ...interaction }: SectionMarkProps) {
  const rad = (ANGLE[direction] * Math.PI) / 180;
  // Letter sits behind the tail, along the arrow's axis.
  const back = TAIL + HEAD + 10;
  const lx = x - Math.cos(rad) * back;
  const ly = y - Math.sin(rad) * back;
  return (
    <g className={cx(styles.group, className)} {...interactionAttrs(interaction)}>
      <g transform={`translate(${x} ${y}) rotate(${ANGLE[direction]})`}>
        <path className={styles.cutTail} d={`M${-(TAIL + HEAD)} 0H${-HEAD}`} />
        <path className={styles.cutHead} d={`M${-HEAD} -4L0 0L${-HEAD} 4Z`} />
      </g>
      <text className={styles.cutLetter} x={lx} y={ly}>
        {letter}
      </text>
    </g>
  );
}
