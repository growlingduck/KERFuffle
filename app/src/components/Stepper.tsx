import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEventHandler, ReactNode } from 'react';
import { cx } from '../lib/interaction';
import { FieldLabel } from './Field';
import styles from './Field.module.css';
import { MinusIcon, PlusSmallIcon } from './icons';
import { Tooltip } from './Tooltip';

export interface StepperProps {
  label: ReactNode;
  /** An InfoTip beside the label. */
  info?: ReactNode;
  value: number;
  /** Called once per click, arrow key or committed edit: each is one undo step. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  symbol?: string;
  /** Accessible names of the buttons, e.g. "One fewer shelf" / "One more shelf". */
  decrementLabel: string;
  incrementLabel: string;
  /** Tooltip on − at the minimum, e.g. "A cabinet needs at least one". */
  minReason?: string;
  maxReason?: string;
  traced?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string | undefined;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  'data-force'?: string;
}

/** − / input / +. − is disabled at the minimum. ↑/↓ in the input step by one. */
export function Stepper({
  label,
  info,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  symbol,
  decrementLabel,
  incrementLabel,
  minReason,
  maxReason,
  traced = false,
  disabled = false,
  id,
  className,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  'data-force': force,
}: StepperProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const [draft, setDraft] = useState<string | null>(null);

  const atMin = value <= min;
  const atMax = value >= max;
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) onChange(clamped);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n)) set(n);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setDraft(null);
      set(value + (event.key === 'ArrowUp' ? 1 : -1));
    } else if (event.key === 'Enter') {
      commitDraft();
    } else if (event.key === 'Escape' && draft !== null) {
      event.stopPropagation();
      setDraft(null);
    }
  };

  const stepButton = (dir: -1 | 1) => {
    const blocked = disabled || (dir === -1 ? atMin : atMax);
    const reason = dir === -1 ? minReason : maxReason;
    const button = (
      <button
        type="button"
        className={cx(styles.stepBtn, dir === -1 ? styles.stepDown : styles.stepUp)}
        aria-label={dir === -1 ? decrementLabel : incrementLabel}
        aria-controls={inputId}
        aria-disabled={blocked || undefined}
        data-force={dir === -1 ? force : undefined}
        onClick={() => {
          if (!blocked) set(value + dir);
        }}
      >
        {dir === -1 ? <MinusIcon /> : <PlusSmallIcon />}
      </button>
    );
    return blocked && reason && !disabled ? (
      <Tooltip content={reason} describe>
        {button}
      </Tooltip>
    ) : (
      button
    );
  };

  return (
    <div className={cx(styles.field, className)} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <FieldLabel htmlFor={inputId} symbol={symbol} symbolOn={traced} info={info}>
        {label}
      </FieldLabel>
      <div className={styles.stepper}>
        {stepButton(-1)}
        <input
          id={inputId}
          className={cx(styles.input, traced && styles.traced)}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
          autoComplete="off"
          disabled={disabled}
          data-force={force}
          data-dirty={draft !== null || undefined}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => {
            commitDraft();
            onBlur?.();
          }}
        />
        {stepButton(1)}
      </div>
    </div>
  );
}
