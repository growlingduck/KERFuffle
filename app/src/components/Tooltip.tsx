import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/interaction';
import styles from './Tooltip.module.css';

export const TOOLTIP_DELAY_MS = 400;

export interface TooltipProps {
  /** Short text. Never the only way to get information needed to finish a task. */
  content: ReactNode;
  /** A single focusable element. */
  children: ReactElement<{ 'aria-describedby'?: string | undefined }>;
  placement?: 'top' | 'bottom';
  /**
   * Link the tooltip with aria-describedby. Leave off when the tooltip repeats the
   * trigger's accessible name (icon buttons), so it isn't read twice.
   */
  describe?: boolean;
  /** Show immediately and keep shown (gallery and tests). */
  forceOpen?: boolean;
}

interface Position {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

function focusIsVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * Dark 12 px tooltip. Waits 400 ms of hover intent, then fades in; also shows on
 * keyboard focus. Esc or a press hides it.
 */
export function Tooltip({ content, children, placement = 'top', describe = false, forceOpen = false }: TooltipProps) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const visible = forceOpen || open;

  const clear = () => window.clearTimeout(timer.current);
  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), TOOLTIP_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || forceOpen || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const roomAbove = rect.top > 44;
    const side = placement === 'top' && !roomAbove ? 'bottom' : placement;
    setPos({
      left: rect.left + rect.width / 2,
      top: side === 'top' ? rect.top - 8 : rect.bottom + 8,
      placement: side,
    });
  }, [open, forceOpen, placement]);

  // Esc dismisses (WCAG 1.4.13); scrolling hides it rather than leaving it stranded.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open, hide]);

  const tipId = `${id}-tip`;
  const child = describe
    ? cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], visible ? tipId : undefined].filter(Boolean).join(' ') || undefined,
      })
    : children;

  return (
    <span
      ref={wrapRef}
      className={styles.wrap}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') show();
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if (focusIsVisible(e.target)) show();
      }}
      onBlur={() => {
        clear();
        setOpen(false);
      }}
    >
      {child}
      {forceOpen && (
        <span role="tooltip" id={tipId} className={cx(styles.tip, styles.inline)} data-placement={placement}>
          {content}
        </span>
      )}
      {open &&
        !forceOpen &&
        createPortal(
          <span
            role="tooltip"
            id={tipId}
            className={styles.tip}
            data-placement={pos?.placement ?? placement}
            style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
