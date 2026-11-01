import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { cx } from '../lib/interaction';
import styles from './Button.module.css';
import { Spinner } from './icons';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'default' | 'primary';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  variant?: ButtonVariant;
  /** `lg` (44 px) is for primary actions; `md` (40 px) for the rest. */
  size?: 'md' | 'lg';
  icon?: ReactNode;
  /**
   * Disabled buttons stay focusable (aria-disabled) so the reason can be read in a
   * tooltip, e.g. "Nothing to undo".
   */
  disabled?: boolean;
  disabledReason?: string;
  /** Work in flight. Callers show it only after 300 ms (see useDelayedFlag). */
  busy?: boolean;
  tooltip?: string;
  tooltipPlacement?: 'top' | 'bottom';
  /** Link the tooltip with aria-describedby (off when it repeats the accessible name). */
  describeTooltip?: boolean;
  ref?: Ref<HTMLButtonElement>;
  'data-force'?: string;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  disabled = false,
  disabledReason,
  busy = false,
  tooltip,
  tooltipPlacement = 'top',
  describeTooltip = true,
  className,
  children,
  onClick,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const inert = disabled || busy;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const button = (
    <button
      ref={ref}
      type={type}
      className={cx(styles.btn, styles[variant], styles[size], className)}
      aria-disabled={disabled || undefined}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );

  const tip = disabled && disabledReason ? disabledReason : tooltip;
  if (!tip) return button;
  return (
    <Tooltip content={tip} placement={tooltipPlacement} describe={describeTooltip}>
      {button}
    </Tooltip>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

/** A link that looks like a Button: navigation (Open job, Cut list) stays a real <a>. */
export function ButtonLink({ variant = 'default', size = 'md', icon, className, children, ref, ...rest }: ButtonLinkProps) {
  return (
    <a ref={ref} className={cx(styles.btn, styles[variant], styles[size], className)} {...rest}>
      {icon}
      {children}
    </a>
  );
}
