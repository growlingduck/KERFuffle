import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './Sheet.module.css';

export interface SheetProps extends HTMLAttributes<HTMLElement> {
  /** Defaults to <section>. */
  as?: ElementType;
  /** Blue registration ticks: the selected item. */
  selected?: boolean;
  /** Inner padding preset. */
  padding?: 'none' | 'sm' | 'md';
  children: ReactNode;
}

/**
 * A drawing sheet: white panel, 1 px ink border, L-shaped registration ticks at
 * the top-left and bottom-right corners.
 */
export function Sheet({ as: Tag = 'section', selected = false, padding = 'md', className, children, ...rest }: SheetProps) {
  return (
    <Tag className={cx(styles.sheet, selected && styles.selected, styles[padding], className)} {...rest}>
      {children}
    </Tag>
  );
}
