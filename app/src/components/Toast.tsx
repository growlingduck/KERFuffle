import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useReducedMotion } from '../motion';
import { dismissToast, useToast } from '../state/toast';
import type { ToastAction } from '../state/toast';
import styles from './Toast.module.css';

export const TOAST_DURATION_MS = 6000;

export interface ToastProps {
  message: string;
  action?: ToastAction | undefined;
  onDismiss: () => void;
  duration?: number;
  /** Keep it up indefinitely (gallery). */
  persistent?: boolean;
}

/**
 * Dark toast at the bottom center. A 3 px bar drains over 6 s; hovering or
 * focusing it pauses the timer. At most one action (Undo, Open).
 */
export function Toast({ message, action, onDismiss, duration = TOAST_DURATION_MS, persistent = false }: ToastProps) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const hover = useRef(false);
  const focus = useRef(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (persistent || paused) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, persistent]);

  const sync = () => setPaused(hover.current || focus.current);

  return (
    <div
      className={styles.toast}
      onPointerEnter={() => {
        hover.current = true;
        sync();
      }}
      onPointerLeave={() => {
        hover.current = false;
        sync();
      }}
      onFocus={() => {
        focus.current = true;
        sync();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        focus.current = false;
        sync();
      }}
    >
      <span>{message}</span>
      {action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            action.run();
            onDismiss();
          }}
        >
          {action.label}
        </button>
      )}
      {!reduced && !persistent && (
        <span
          className={styles.drain}
          aria-hidden="true"
          data-paused={paused || undefined}
          style={{ '--toast-duration': `${duration}ms` } as CSSProperties}
        />
      )}
    </div>
  );
}

/**
 * Renders the current toast from the toast store. Mount once in the shell. The
 * host is the role="status" live region, so it exists before a message arrives.
 */
export function ToastHost() {
  const toast = useToast();
  return (
    <div className={styles.host} role="status" data-screen-only>
      {toast && <Toast key={toast.id} message={toast.message} action={toast.action} onDismiss={() => dismissToast(toast.id)} />}
    </div>
  );
}
