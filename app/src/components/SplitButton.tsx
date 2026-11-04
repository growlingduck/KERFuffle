import type { ReactNode } from 'react';
import { cx } from '../lib/interaction';
import { Button } from './Button';
import type { ButtonVariant } from './Button';
import { IconButton } from './IconButton';
import { ChevronDownIcon } from './icons';
import { Menu } from './Menu';
import type { MenuEntry } from './Menu';
import styles from './SplitButton.module.css';

export interface SplitButtonProps {
  children: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  /** Accessible name of the ▾ part, e.g. "Add from a preset size". */
  menuLabel: string;
  /** Tooltip on the main action, e.g. its shortcut: "Add cabinet  Ctrl+N". */
  tooltip?: string;
  /** The main action's shortcut for screen readers, e.g. "Control+N". */
  keyShortcuts?: string;
  items: readonly MenuEntry[];
  variant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
  className?: string | undefined;
  defaultOpen?: boolean;
  'data-force'?: string;
}

/** Main action plus a ▾ that opens a menu of variants (e.g. Add cabinet / presets). */
export function SplitButton({
  children,
  icon,
  onClick,
  menuLabel,
  tooltip,
  keyShortcuts,
  items,
  variant = 'primary',
  disabled = false,
  disabledReason,
  className,
  defaultOpen = false,
  'data-force': force,
}: SplitButtonProps) {
  const reason = disabledReason ? { disabledReason } : {};
  return (
    <Menu
      label={menuLabel}
      items={items}
      matchWidth
      defaultOpen={defaultOpen}
      className={cx(styles.split, className)}
      trigger={(props, open) => (
        <>
          <Button
            variant={variant}
            size="lg"
            icon={icon}
            className={styles.main}
            onClick={onClick}
            disabled={disabled}
            {...reason}
            {...(tooltip ? { tooltip, describeTooltip: false } : {})}
            {...(keyShortcuts ? { 'aria-keyshortcuts': keyShortcuts } : {})}
            {...(force ? { 'data-force': force } : {})}
          >
            {children}
          </Button>
          <IconButton
            {...props}
            variant={variant}
            label={menuLabel}
            className={cx(styles.chevron, variant === 'primary' && styles.chevronPrimary)}
            disabled={disabled}
            {...reason}
          >
            <ChevronDownIcon className={cx(styles.chev, open && styles.chevOpen)} />
          </IconButton>
        </>
      )}
    />
  );
}
