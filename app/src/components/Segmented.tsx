import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  /** Accessible name of the group, e.g. "Cabinet type". */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string | undefined;
  'data-force'?: string;
}

/**
 * A dark thumb slides under the selected option (200 ms). Each option is a toggle
 * button with aria-pressed, inside a labelled group.
 */
export function Segmented<T extends string>({ label, options, value, onChange, className, 'data-force': force }: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const thumb = { '--count': options.length, '--index': index } as CSSProperties;
  return (
    <div role="group" aria-label={label} className={cx(styles.seg, className)} style={thumb}>
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={option.value === value}
          aria-disabled={option.disabled || undefined}
          data-force={i === 0 ? force : undefined}
          onClick={() => {
            if (!option.disabled && option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
