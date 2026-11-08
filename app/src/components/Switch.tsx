import type { ReactNode } from 'react';
import { cx } from '../lib/interaction';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label; clicking it toggles the switch. */
  children: ReactNode;
  disabled?: boolean;
  className?: string | undefined;
  id?: string;
  /** A message line under the switch. */
  'aria-describedby'?: string;
  'data-force'?: string;
}

/** role="switch". The knob slides 16 px and the track fills blue when on. */
export function Switch({ checked, onChange, children, disabled = false, className, id, 'aria-describedby': describedBy, 'data-force': force }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-describedby={describedBy}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={cx(styles.switch, className)}
      data-force={force}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      <span>{children}</span>
    </button>
  );
}
