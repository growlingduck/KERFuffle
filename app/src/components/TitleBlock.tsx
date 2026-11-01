import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './TitleBlock.module.css';

export interface TitleBlockCell {
  label: string;
  value: ReactNode;
  /** Columns this cell spans. */
  span?: number;
}

export interface TitleBlockProps {
  cells: readonly TitleBlockCell[];
  columns?: number;
  /** `compact` is the printed cut-list footer size. */
  density?: 'default' | 'compact';
  className?: string | undefined;
}

/** A ruled grid of small-caps labels over values, the way a drawing sheet has it. */
export function TitleBlock({ cells, columns = 6, density = 'default', className }: TitleBlockProps) {
  return (
    <dl className={cx(styles.tb, density === 'compact' && styles.compact, className)} style={{ '--cols': columns } as CSSProperties}>
      {cells.map((cell) => (
        <div key={cell.label} className={styles.cell} style={cell.span ? { gridColumn: `span ${cell.span}` } : undefined}>
          <dt className={styles.label}>{cell.label}</dt>
          <dd className={styles.value}>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
