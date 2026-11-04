import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, PointerEventHandler, ReactNode, Ref } from 'react';
import { ticks } from '@kerfuffle/engine';
import type { Ticks } from '@kerfuffle/engine';
import { exactInches, exactText, NUDGE_COARSE, NUDGE_FINE, parseTyped, sameTypedForm } from '../lib/dimensions';
import { cx } from '../lib/interaction';
import { FieldLabel } from './Field';
import { SymbolMark } from './InfoTip';
import styles from './Field.module.css';

export interface DimensionInputProps {
  label: ReactNode;
  /** An InfoTip beside the label. */
  info?: ReactNode;
  /** The committed value, in 1/64″ ticks. */
  value: Ticks;
  /** Blur or Enter, and only when the value differs from the last commit. Undo and autosave hang off this. */
  onCommit: (value: Ticks) => void;
  /** Every keystroke and nudge: the parsed value, or null while the text doesn't parse. */
  onLiveChange?: (value: Ticks | null) => void;
  /** Symbol chip in the label row: W, H, D… */
  symbol?: string;
  /** Unit suffix. Inches only for now. */
  unit?: string;
  /** A validation error from outside the field (e.g. the engine's "Too narrow…"). */
  error?: string | null | undefined;
  /** An implausible-size warning. Never blocks anything. */
  warning?: string | null | undefined;
  /** Id of a longer explanation elsewhere (e.g. beside the field), read after the message line. */
  describedBy?: string | undefined;
  /** Blue "linked" ring: this dimension is being traced from elsewhere (§5.5). */
  traced?: boolean;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  ref?: Ref<HTMLInputElement>;
  className?: string | undefined;
  onFocus?: () => void;
  onBlur?: () => void;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  'data-force'?: string;
}

type Tone = 'hint' | 'error' | 'warning';

/**
 * Mono dimension field (interaction-design §5.3).
 *
 * Typing parses live with the engine's parseDimension. ↑/↓ nudge 1/16″, Shift
 * 1″, written back exactly at 1/64″. Enter commits and blurs; Esc reverts to the
 * value the field had when it was focused. The message line has a fixed height,
 * so nothing moves while typing.
 */
export function DimensionInput({
  label,
  info,
  value,
  onCommit,
  onLiveChange,
  symbol,
  unit = 'in',
  error,
  warning,
  describedBy,
  traced = false,
  disabled = false,
  busy = false,
  id,
  ref,
  className,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  'data-force': force,
}: DimensionInputProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const msgId = `${inputId}-msg`;

  const [text, setText] = useState(() => exactText(value));
  const [focused, setFocused] = useState(false);
  const [prevValue, setPrevValue] = useState(value);
  /** Text when the field gained focus: what Esc goes back to. */
  const atFocus = useRef(text);
  /**
   * Last value handed to onCommit, or received from outside. Only a new value
   * prop resets it, so a parent that hasn't applied a commit yet never gets it twice.
   */
  const committed = useRef(value);
  useEffect(() => {
    committed.current = value;
  }, [value]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A new value from outside (undo, another control) replaces the text unless
  // the user is typing, or the text already reads as that value.
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) {
      const current = parseTyped(text);
      if (!current.ok || current.value !== value) setText(exactText(value));
    }
  }

  const parsed = parseTyped(text);

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const commit = () => {
    const result = parseTyped(text);
    if (!result.ok || result.value === committed.current) return;
    committed.current = result.value;
    onCommit(result.value);
  };

  const replaceText = (next: string, live: Ticks | null) => {
    setText(next);
    onLiveChange?.(live);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const result = parseTyped(next);
    replaceText(next, result.ok ? result.value : null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // Alt+↑/↓ changes cabinet (workspace shortcut); only plain and Shift arrows nudge.
      event.preventDefault();
      if (!parsed.ok) return;
      const step = event.shiftKey ? NUDGE_COARSE : NUDGE_FINE;
      const next = ticks(Math.max(0, parsed.value + (event.key === 'ArrowUp' ? 1 : -1) * step));
      if (next !== parsed.value || text !== exactText(next)) replaceText(exactText(next), next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      inputRef.current?.blur();
    } else if (event.key === 'Escape') {
      const back = atFocus.current;
      if (text === back) return; // nothing to revert: let Esc close a menu or dialog
      event.preventDefault();
      event.stopPropagation();
      const result = parseTyped(back);
      replaceText(back, result.ok ? result.value : null);
    }
  };

  let tone: Tone = 'hint';
  let message = '';
  if (!parsed.ok) {
    tone = 'error';
    message = parsed.message;
  } else if (error) {
    tone = 'error';
    message = error;
  } else if (warning) {
    tone = 'warning';
    message = warning;
  } else if (focused) {
    message = `Reads as ${exactInches(parsed.value)} · ↑↓ nudges 1/16″, Shift+↑↓ 1″`;
  } else if (!sameTypedForm(text, parsed.value)) {
    message = `Reads as ${exactInches(parsed.value)}`;
  }
  const invalid = tone === 'error';
  // Uncommitted typing: Ctrl+Z belongs to the field, not the app's undo (§9).
  const dirty = focused && !(parsed.ok && parsed.value === value && sameTypedForm(text, value));

  return (
    <div className={cx(styles.field, className)} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <FieldLabel htmlFor={inputId} symbol={symbol} symbolOn={traced} hiddenSuffix="(inches)" info={info}>
        {label}
      </FieldLabel>
      <div className={cx(styles.control, busy && styles.busy)}>
        <input
          ref={setRefs}
          id={inputId}
          className={cx(styles.input, styles.withUnit, traced && styles.traced)}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy ? `${msgId} ${describedBy}` : msgId}
          aria-busy={busy || undefined}
          data-force={force}
          data-dirty={dirty || undefined}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => {
            atFocus.current = text;
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            commit();
            onBlur?.();
          }}
        />
        <span className={styles.unit} aria-hidden="true">
          {unit}
        </span>
      </div>
      {/* While typing, an error is shown whole: it wraps over what's below rather than pushing it down. */}
      <div id={msgId} className={cx(styles.msg, tone === 'error' && styles.msgError, tone === 'warning' && styles.msgWarning, invalid && focused && styles.msgOpen)}>
        <span className={styles.msgText}>
          {tone === 'error' && message && (
            <>
              <SymbolMark symbol="needsFix" decorative /> <span className="visually-hidden">Error:</span>{' '}
            </>
          )}
          {tone === 'warning' && message && (
            <>
              <SymbolMark symbol="warning" decorative /> <span className="visually-hidden">Warning:</span>{' '}
            </>
          )}
          {message}
        </span>
      </div>
    </div>
  );
}
