import { cx } from '../../lib/interaction';
import styles from './drawing.module.css';
import { interactionAttrs } from './types';
import type { DrawingInteractionProps } from './types';

export interface CenterlineProps extends DrawingInteractionProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Show the ℄ symbol past the start of the line. Default true. */
  symbol?: boolean;
}

/** Long-short dashed centerline with a ℄ symbol at its start. */
export function Centerline({ x1, y1, x2, y2, symbol = true, className, ...interaction }: CenterlineProps) {
  const vertical = x1 === x2;
  // Put ℄ just beyond the start, beside the line.
  const sx = vertical ? x1 + 4 : x1 - 14;
  const sy = vertical ? y1 - 4 : y1 - 4;
  return (
    <g className={cx(styles.group, className)} {...interactionAttrs(interaction)}>
      <line className={styles.centerline} x1={x1} y1={y1} x2={x2} y2={y2} />
      {symbol && (
        <text className={styles.centerSymbol} x={sx} y={sy}>
          ℄
        </text>
      )}
    </g>
  );
}
