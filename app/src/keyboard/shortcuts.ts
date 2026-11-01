import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Keyboard shortcut registry (interaction-design §9).
 *
 * - Each shortcut has an id, one or more key combos, a scope and a label.
 * - `global` is always active. Other scopes ('job', 'workspace', 'jobs', …) are
 *   active while a screen or component holds them via `useShortcutScope`. The
 *   most recently activated scope wins when two shortcuts share a combo.
 * - Shortcuts never fire while the user types in a text field unless they set
 *   `allowWhileTyping` (Ctrl+Z/Y in the workspace; Enter/Esc are owned by fields).
 * - A shortcut without `run` is documentation only: a component handles the keys
 *   itself (e.g. ↑/↓ in a dimension input) and the registry lists it in the popover.
 */

export type ShortcutScope = 'global' | 'job' | 'workspace' | 'jobs' | 'cutlist' | 'settings' | 'fields' | (string & {});

export interface ShortcutDef {
  id: string;
  /** Combos such as `Ctrl+1`, `Ctrl+Shift+Z`, `?`, `Alt+ArrowUp`, `Delete`. */
  keys: readonly string[];
  scope: ShortcutScope;
  label: string;
  run?: (event: KeyboardEvent) => void;
  allowWhileTyping?: boolean;
  /** Return false to let the key fall through, e.g. when there is nothing to undo. */
  enabled?: () => boolean;
  /** Keycaps to show instead of the combos, e.g. [['↑', '↓']] for a nudge. */
  display?: readonly (readonly string[])[];
}

export interface ShortcutListing {
  id: string;
  scope: ShortcutScope;
  label: string;
  /** One keycap row per alternative combo. */
  keycaps: readonly (readonly string[])[];
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift'] as const;

const KEY_ALIASES: Record<string, string> = {
  del: 'Delete',
  delete: 'Delete',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
};

const KEYCAP_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Delete: 'Del',
  Escape: 'Esc',
  ' ': 'Space',
};

function normalizeKey(key: string): string {
  const alias = KEY_ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** True for single printable keys that need Shift to type, where Shift is part of the key, not a modifier. */
function shiftIsImplicit(key: string): boolean {
  return key.length === 1 && key.toLowerCase() === key.toUpperCase() && key !== ' ';
}

/** Canonical form of a written combo: `ctrl+shift+z` → `Ctrl+Shift+Z`, `Shift+?` → `?`. */
export function normalizeCombo(combo: string): string {
  // Split on '+' but keep a literal '+' key (e.g. `Ctrl++`).
  const parts = combo.split(/\+(?!$)/).map((p) => p.trim()).filter((p) => p !== '');
  const mods = new Set<string>();
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'mod') mods.add('Ctrl');
    else if (lower === 'alt') mods.add('Alt');
    else if (lower === 'shift') mods.add('Shift');
    else key = normalizeKey(part);
  }
  if (shiftIsImplicit(key)) mods.delete('Shift');
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join('+');
}

/** Canonical combo for a key event, comparable with `normalizeCombo`. */
export function comboFromEvent(event: KeyboardEvent): string {
  const key = normalizeKey(event.key);
  const mods: string[] = [];
  if (event.ctrlKey || event.metaKey) mods.push('Ctrl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey && !shiftIsImplicit(key)) mods.push('Shift');
  return [...mods, key].join('+');
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);

/** Is the user typing into this element? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}

export function keycapsFor(combo: string): string[] {
  return normalizeCombo(combo)
    .split(/\+(?!$)/)
    .map((part) => KEYCAP_LABELS[part] ?? part);
}

interface Registered extends ShortcutDef {
  combos: readonly string[];
  order: number;
}

export class ShortcutRegistry {
  private defs = new Map<string, Registered>();
  private scopes: ShortcutScope[] = [];
  private listeners = new Set<() => void>();
  private listing: readonly ShortcutListing[] = [];
  private counter = 0;

  register(def: ShortcutDef): () => void {
    const entry: Registered = { ...def, combos: def.keys.map(normalizeCombo), order: this.counter++ };
    this.defs.set(def.id, entry);
    this.changed();
    return () => {
      if (this.defs.get(def.id) === entry) {
        this.defs.delete(def.id);
        this.changed();
      }
    };
  }

  /** Activate a scope until the returned function is called. Nested activations stack. */
  activateScope(scope: ShortcutScope): () => void {
    this.scopes.push(scope);
    this.changed();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = this.scopes.lastIndexOf(scope);
      if (index !== -1) this.scopes.splice(index, 1);
      this.changed();
    };
  }

  isScopeActive(scope: ShortcutScope): boolean {
    return scope === 'global' || this.scopes.includes(scope);
  }

  /** Run the matching shortcut, if any. Returns true when one ran. */
  handleKeyDown = (event: KeyboardEvent): boolean => {
    if (event.defaultPrevented || event.isComposing) return false;
    const combo = comboFromEvent(event);
    const typing = isTypingTarget(event.target);

    let best: Registered | undefined;
    let bestRank = -1;
    for (const def of this.defs.values()) {
      if (!def.run || !def.combos.includes(combo)) continue;
      if (typing && !def.allowWhileTyping) continue;
      const rank = def.scope === 'global' ? 0 : this.scopes.lastIndexOf(def.scope) + 1;
      if (rank === 0 && def.scope !== 'global') continue; // scope not active
      if (def.enabled && !def.enabled()) continue;
      if (rank > bestRank || (rank === bestRank && best && def.order > best.order)) {
        best = def;
        bestRank = rank;
      }
    }
    if (!best?.run) return false;
    event.preventDefault();
    best.run(event);
    return true;
  };

  attach(target: Window | HTMLElement = window): () => void {
    const handler = (event: Event) => {
      if (event instanceof KeyboardEvent) this.handleKeyDown(event);
    };
    target.addEventListener('keydown', handler);
    return () => target.removeEventListener('keydown', handler);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Shortcuts in active scopes, global first, then scopes in activation order. Stable between changes. */
  getListing = (): readonly ShortcutListing[] => this.listing;

  private changed(): void {
    const scopeRank = (scope: ShortcutScope) => (scope === 'global' ? -1 : this.scopes.indexOf(scope));
    this.listing = [...this.defs.values()]
      .filter((d) => this.isScopeActive(d.scope))
      .sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope) || a.order - b.order)
      .map((d) => ({
        id: d.id,
        scope: d.scope,
        label: d.label,
        keycaps: d.display ?? d.keys.map(keycapsFor),
      }));
    for (const listener of [...this.listeners]) listener();
  }
}

/** The app's registry. */
export const shortcuts = new ShortcutRegistry();

/** Register a shortcut for the lifetime of a component. `run` may change between renders. */
export function useShortcut(def: ShortcutDef, registry: ShortcutRegistry = shortcuts): void {
  const runRef = useRef(def.run);
  const enabledRef = useRef(def.enabled);
  useEffect(() => {
    runRef.current = def.run;
    enabledRef.current = def.enabled;
  });
  const { id, scope, label, allowWhileTyping, run } = def;
  const keys = def.keys.join('\u0000');
  const display = def.display ? JSON.stringify(def.display) : undefined;
  const hasRun = run !== undefined;
  useEffect(() => {
    const entry: ShortcutDef = {
      id,
      keys: keys.split('\u0000'),
      scope,
      label,
      enabled: () => enabledRef.current?.() ?? true,
      ...(hasRun ? { run: (e: KeyboardEvent) => runRef.current?.(e) } : {}),
      ...(allowWhileTyping ? { allowWhileTyping } : {}),
      ...(display ? { display: JSON.parse(display) as string[][] } : {}),
    };
    return registry.register(entry);
  }, [registry, id, keys, scope, label, allowWhileTyping, hasRun, display]);
}

/** Hold a scope active while the component is mounted. */
export function useShortcutScope(scope: ShortcutScope, registry: ShortcutRegistry = shortcuts): void {
  useEffect(() => registry.activateScope(scope), [registry, scope]);
}

export function useShortcutListing(registry: ShortcutRegistry = shortcuts): readonly ShortcutListing[] {
  return useSyncExternalStore(registry.subscribe, registry.getListing, registry.getListing);
}

export const SCOPE_TITLES: Record<string, string> = {
  global: 'Anywhere',
  fields: 'Dimension fields',
  job: 'Job',
  jobs: 'Jobs',
  workspace: 'Workspace',
  cutlist: 'Cut list',
  settings: 'Settings',
};
