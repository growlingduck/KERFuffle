import type { ReactNode } from 'react';
import { cx } from '../lib/interaction';
import { Button } from './Button';
import type { ButtonProps } from './Button';
import styles from './Button.module.css';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'tooltip' | 'size' | 'aria-label'> {
  /** Accessible name and tooltip text. Required: an icon alone never names a control. */
  label: string;
  /** Tooltip text when it should differ from the name, e.g. "Undo: Change width on B1". */
  tooltip?: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

/** Square icon-only button with an aria-label and a matching tooltip. */
export function IconButton({ label, tooltip, children, size = 'md', className, disabled, disabledReason, ...rest }: IconButtonProps) {
  const tip = disabled && disabledReason ? disabledReason : (tooltip ?? label);
  return (
    <Button
      {...rest}
      aria-label={disabled && disabledReason ? `${label} (${disabledReason})` : label}
      className={cx(styles.icon, size === 'sm' && styles.sm, className)}
      icon={children}
      disabled={disabled ?? false}
      tooltip={tip}
      describeTooltip={false}
    />
  );
}
