import type { ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './ViewTitle.module.css';

export interface ViewTitleProps {
  /** Bubble mark: 1–4 for workspace panels, A, B… for drawing views and details. */
  mark?: string | undefined;
  title: ReactNode;
  /** Mono sub-line, e.g. "5 cabinets · 9′-0″ run". */
  sub?: ReactNode;
  /** Heading level of the title. */
  level?: 1 | 2 | 3;
  /** Smaller variant for drawing view captions. */
  size?: 'md' | 'sm';
  id?: string;
  className?: string | undefined;
}

/** Circled bubble + condensed caps title with a 2 px underline + mono sub-line. */
export function ViewTitle({ mark, title, sub, level = 2, size = 'md', id, className }: ViewTitleProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cx(styles.vt, size === 'sm' && styles.sm, className)}>
      {mark && (
        <span className={styles.bubble} aria-hidden="true">
          {mark}
        </span>
      )}
      <div className={styles.text}>
        <Heading id={id} className={styles.title}>
          {title}
        </Heading>
        {sub !== undefined && <div className={styles.sub}>{sub}</div>}
      </div>
    </div>
  );
}
