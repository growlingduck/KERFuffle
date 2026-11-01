import type { ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './Field.module.css';

/** Label row shared by DimensionInput and Stepper: label text plus an optional symbol chip. */
export function FieldLabel({
  htmlFor,
  id,
  children,
  symbol,
  symbolOn = false,
  hiddenSuffix,
}: {
  htmlFor: string;
  id?: string;
  children: ReactNode;
  symbol?: string | undefined;
  symbolOn?: boolean;
  /** Read by screen readers only, e.g. "(inches)". */
  hiddenSuffix?: string;
}) {
  return (
    <div className={styles.labelRow}>
      <label htmlFor={htmlFor} id={id}>
        {children}
        {hiddenSuffix && <span className="visually-hidden"> {hiddenSuffix}</span>}
      </label>
      {symbol && <SymbolChip on={symbolOn}>{symbol}</SymbolChip>}
    </div>
  );
}

/** Symbol chip (W, H, D, n, ×). Solid blue while its dimension is traced. */
export function SymbolChip({ children, on = false, className }: { children: ReactNode; on?: boolean; className?: string }) {
  return (
    <span className={cx(styles.sym, on && styles.symOn, className)} aria-hidden="true">
      {children}
    </span>
  );
}
