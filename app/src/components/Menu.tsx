import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { cx, useDismiss } from '../lib/interaction';
import styles from './Menu.module.css';

export interface MenuItem {
  type?: 'item';
  id: string;
  label: ReactNode;
  onSelect: () => void;
  /** Defined → the item is a menuitemradio with aria-checked. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  hint?: ReactNode;
  /** A line under the label saying what choosing it does ("Locks construction"). Read as its description. */
  note?: string | undefined;
}

export type MenuEntry =
  | MenuItem
  | { type: 'separator'; id: string }
  /** A labelled section, e.g. "Base cabinets" in the preset menu. */
  | { type: 'group'; id: string; label: string; items: readonly MenuItem[] };

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export interface MenuProps {
  /** Accessible name of the menu, e.g. "Job status". */
  label: string;
  items: readonly MenuEntry[];
  /** Render the trigger. Spread `props` on the button that opens the menu. */
  trigger: (props: MenuTriggerProps, open: boolean) => ReactNode;
  align?: 'start' | 'end';
  /** Make the popover as wide as the trigger area (split buttons). */
  matchWidth?: boolean;
  width?: number;
  className?: string | undefined;
  /** Open on mount (gallery). */
  defaultOpen?: boolean;
}

function flatten(entries: readonly MenuEntry[]): MenuItem[] {
  return entries.flatMap((e) => (e.type === 'separator' ? [] : e.type === 'group' ? [...e.items] : [e]));
}

/** Gap between trigger and menu, and the least room kept to the window edge. */
const GAP = 6;
const EDGE = 8;

const px = (n: number | undefined) => (n === undefined ? '' : `${n}px`);

/**
 * Put the menu by its trigger, in window coordinates. It's position: fixed, so no
 * scroll container or overflow clips it. Below the trigger unless there's more room
 * above; aligned to the trigger's start or end edge, and kept inside the window.
 */
function place(trigger: DOMRect, menu: HTMLElement, align: 'start' | 'end', matchWidth: boolean): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = vh - trigger.bottom - GAP - EDGE;
  const above = trigger.top - GAP - EDGE;
  const up = menu.scrollHeight > below && above > below;
  let left = trigger.left;
  if (!matchWidth) {
    const width = menu.offsetWidth;
    const ideal = align === 'end' ? trigger.right - width : trigger.left;
    left = Math.max(EDGE, Math.min(ideal, vw - EDGE - width));
  }
  const s = menu.style;
  s.top = px(up ? undefined : trigger.bottom + GAP);
  s.bottom = px(up ? vh - trigger.top + GAP : undefined);
  s.maxHeight = px(up ? above : below);
  s.left = px(left);
  if (matchWidth) s.width = px(trigger.width);
  menu.dataset.side = up ? 'above' : 'below';
}

/**
 * Trigger + popover menu. Opens under its trigger (over it when there's more room
 * above) with a 4 px drop and fade.
 * ↑/↓/Home/End move between items, Enter/Space choose, Esc, Tab or a click
 * outside close it, and focus returns to the trigger.
 */
export function Menu({ label, items, trigger, align = 'start', matchWidth = false, width, className, defaultOpen = false }: MenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuId = useId();

  const flat = flatten(items);
  const enabled = flat.map((e, i) => (e.disabled ? -1 : i)).filter((i) => i !== -1);

  const close = useCallback((restore = true) => {
    setOpen(false);
    setActive(-1);
    if (restore) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useDismiss(open, [wrapRef], () => close(true));

  // Placed before paint, and again as the page scrolls or the window resizes, so it stays on its trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = wrapRef.current;
      const menu = menuRef.current;
      if (trigger && menu) place(trigger.getBoundingClientRect(), menu, align, matchWidth);
    };
    update();
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) update();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [open, align, matchWidth]);

  const openWith = (which: 'first' | 'last' | 'checked') => {
    const checked = flat.findIndex((e) => e.checked && !e.disabled);
    const first = enabled[0] ?? -1;
    const last = enabled[enabled.length - 1] ?? -1;
    setActive(which === 'last' ? last : which === 'checked' && checked !== -1 ? checked : first);
    setOpen(true);
  };

  const activeId = flat[active]?.id;
  useEffect(() => {
    if (open && activeId) itemRefs.current.get(activeId)?.focus({ preventScroll: true });
  }, [open, activeId]);

  const move = (delta: 1 | -1) => {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(active);
    const next = pos === -1 ? (delta === 1 ? 0 : enabled.length - 1) : (pos + delta + enabled.length) % enabled.length;
    setActive(enabled[next] ?? -1);
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActive(enabled[0] ?? -1);
        break;
      case 'End':
        event.preventDefault();
        setActive(enabled[enabled.length - 1] ?? -1);
        break;
      case 'Tab':
        close(true);
        break;
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close(true) : openWith('checked')),
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openWith('first');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openWith('last');
      }
    },
  };

  const renderItem = (entry: MenuItem) => {
    const index = flat.indexOf(entry);
    const radio = entry.checked !== undefined;
    const noteId = entry.note ? `${menuId}-${entry.id}-note` : undefined;
    return (
      <button
        key={entry.id}
        ref={(el) => {
          if (el) itemRefs.current.set(entry.id, el);
          else itemRefs.current.delete(entry.id);
        }}
        type="button"
        role={radio ? 'menuitemradio' : 'menuitem'}
        aria-checked={radio ? entry.checked : undefined}
        aria-disabled={entry.disabled || undefined}
        aria-labelledby={noteId ? `${menuId}-${entry.id}-label` : undefined}
        aria-describedby={noteId}
        tabIndex={index === active ? 0 : -1}
        className={cx(styles.item, entry.danger && styles.danger)}
        onMouseEnter={() => !entry.disabled && setActive(index)}
        onClick={() => {
          if (entry.disabled) return;
          close(true);
          entry.onSelect();
        }}
      >
        {noteId ? (
          <span className={styles.stack}>
            <span id={`${menuId}-${entry.id}-label`}>{entry.label}</span>
            <span id={noteId} className={styles.note}>
              {entry.note}
            </span>
          </span>
        ) : (
          entry.label
        )}
        {entry.hint !== undefined && <span className={styles.hint}>{entry.hint}</span>}
      </button>
    );
  };

  return (
    <div ref={wrapRef} className={cx(styles.wrap, className)}>
      {trigger(triggerProps, open)}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(styles.menu, matchWidth && styles.match)}
          style={width ? { width } : undefined}
          onKeyDown={onMenuKey}
        >
          {items.map((entry) => {
            if (entry.type === 'separator') return <div key={entry.id} role="separator" className={styles.sep} />;
            if (entry.type === 'group')
              return (
                <div key={entry.id} role="group" aria-label={entry.label}>
                  <div aria-hidden="true" className={cx('cap', styles.heading)}>
                    {entry.label}
                  </div>
                  {entry.items.map(renderItem)}
                </div>
              );
            return renderItem(entry);
          })}
        </div>
      )}
    </div>
  );
}
