import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx, focusableIn } from '../lib/interaction';
import styles from './Dialog.module.css';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import { ViewTitle } from './ViewTitle';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** View-title bubble, e.g. "+" for New job. */
  mark?: string | undefined;
  /** Mono sub-line under the title. */
  sub?: ReactNode;
  children: ReactNode;
  /** Action row at the bottom, right-aligned. */
  footer?: ReactNode;
  /** Element to focus on open. Default: first [data-autofocus], else the first focusable field. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  width?: number;
  className?: string | undefined;
}

/**
 * Modal dialog over a scrim. Focus moves in on open, Tab is trapped inside, the
 * rest of the page is inert, Esc closes, and focus returns to whatever had it
 * before. Kept for the few bulk-replace confirmations and the New job sheet; routine
 * deletes use Undo instead (interaction-design §1).
 */
export function Dialog({ open, onClose, title, mark, sub, children, footer, initialFocusRef, width = 640, className }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Capture the opener before focus moves, and give focus back on close.
  useLayoutEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = returnTo.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
    };
  }, [open]);

  // Initial focus.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>('[data-autofocus]') ??
      focusableIn(panel).find((el) => el.matches('input, select, textarea')) ??
      panel;
    target.focus({ preventScroll: true });
  }, [open, initialFocusRef]);

  // Everything outside the dialog is inert while it is open.
  useEffect(() => {
    if (!open || !hostRef.current) return;
    const host = hostRef.current;
    const made: Element[] = [];
    for (const el of document.body.children) {
      if (el !== host && !el.contains(host) && !el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        made.push(el);
      }
    }
    return () => made.forEach((el) => el.removeAttribute('inert'));
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = focusableIn(panelRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div ref={hostRef} className={styles.scrim} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(styles.panel, className)}
        style={{ width }}
        onKeyDown={onKeyDown}
      >
        <div className={styles.header}>
          <ViewTitle mark={mark} title={title} sub={sub} id={titleId} />
          <IconButton label="Close" onClick={onClose} size="sm">
            <CloseIcon />
          </IconButton>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
