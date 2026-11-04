import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { KeyCombo } from '../components/Kbd';
import { cx, useDismiss } from '../lib/interaction';
import { SCOPE_TITLES, useShortcutListing } from './shortcuts';
import type { ShortcutListing } from './shortcuts';
import styles from './ShortcutsPopover.module.css';

export interface ShortcutsPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The button that toggles the popover; clicks on it don't count as "outside". */
  anchorRef?: RefObject<HTMLElement | null>;
  className?: string | undefined;
}

/** Whether the popover is open: the header button, `?` and Settings → Help all open it. */
let shown = false;
const listeners = new Set<() => void>();

function setShown(next: boolean): void {
  if (shown === next) return;
  shown = next;
  for (const listener of [...listeners]) listener();
}

export const openShortcuts = (): void => setShown(true);
export const closeShortcuts = (): void => setShown(false);
export const toggleShortcuts = (): void => setShown(!shown);

export function useShortcutsOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => shown,
    () => shown,
  );
}

function group(listing: readonly ShortcutListing[]): [string, ShortcutListing[]][] {
  const groups = new Map<string, ShortcutListing[]>();
  for (const item of listing) {
    const list = groups.get(item.scope) ?? [];
    list.push(item);
    groups.set(item.scope, list);
  }
  return [...groups.entries()];
}

/**
 * Lists every shortcut in the active scopes with keycaps. Opens from the header
 * button or `?`; Esc or a click outside closes it and focus goes back.
 */
export function ShortcutsPopover({ open, onClose, anchorRef, className }: ShortcutsPopoverProps) {
  const listing = useShortcutListing();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useDismiss(open, anchorRef ? [panelRef, anchorRef] : [panelRef], onClose);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      const el = returnTo.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div ref={panelRef} role="dialog" aria-label="Keyboard shortcuts" tabIndex={-1} className={cx(styles.panel, className)}>
      {group(listing).map(([scope, items]) => (
        <section key={scope} className={styles.group} aria-label={SCOPE_TITLES[scope] ?? scope}>
          <h2 className={cx('cap', styles.heading)}>{SCOPE_TITLES[scope] ?? scope}</h2>
          <dl className={styles.list}>
            {items.map((item) => (
              <div key={item.id} className={styles.row}>
                <dt>{item.label}</dt>
                <dd className={styles.keys}>
                  {item.keycaps.map((combo, i) => (
                    <span key={i} className={styles.alt}>
                      {i > 0 && <span className={styles.or}>or</span>}
                      <KeyCombo keys={combo} />
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
