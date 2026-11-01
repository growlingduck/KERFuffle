import { cx } from '../../lib/interaction';
import styles from './drawing.module.css';
import { interactionAttrs } from './types';
import type { DrawingInteractionProps } from './types';

export interface BalloonProps extends DrawingInteractionProps {
  cx: number;
  cy: number;
  /** Part number on this cabinet. */
  label: string | number;
  r?: number;
}

/** A circled part number. Fills blue when its part is traced. */
export function Balloon({ cx: x, cy: y, label, r = 10, className, ...interaction }: BalloonProps) {
  return (
    <g className={cx(styles.group, className)} {...interactionAttrs(interaction)}>
      <circle className={styles.balloonCircle} cx={x} cy={y} r={r} />
      <text className={styles.balloonText} x={x} y={y}>
        {label}
      </text>
    </g>
  );
}
