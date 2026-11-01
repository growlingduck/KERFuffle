import { describe, expect, it, vi } from 'vitest';
import { comboFromEvent, isTypingTarget, keycapsFor, normalizeCombo, ShortcutRegistry } from '../src/keyboard/shortcuts';

function key(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('combos', () => {
  it('normalizes written combos', () => {
    expect(normalizeCombo('ctrl+shift+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeCombo('Shift+Ctrl+Z')).toBe('Ctrl+Shift+Z');
    expect(normalizeCombo('Alt+Up')).toBe('Alt+ArrowUp');
    expect(normalizeCombo('Del')).toBe('Delete');
    expect(normalizeCombo('?')).toBe('?');
    expect(normalizeCombo('Shift+?')).toBe('?');
    expect(normalizeCombo('Ctrl++')).toBe('Ctrl++');
  });

  it('reads combos from events', () => {
    expect(comboFromEvent(key({ key: '1', ctrlKey: true }))).toBe('Ctrl+1');
    expect(comboFromEvent(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z');
    expect(comboFromEvent(key({ key: '?', shiftKey: true }))).toBe('?');
    expect(comboFromEvent(key({ key: 'ArrowUp', altKey: true }))).toBe('Alt+ArrowUp');
  });

  it('turns combos into keycaps', () => {
    expect(keycapsFor('Ctrl+Shift+Z')).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(keycapsFor('Alt+ArrowDown')).toEqual(['Alt', '↓']);
    expect(keycapsFor('Delete')).toEqual(['Del']);
  });

  it('knows when the user is typing', () => {
    const text = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});

describe('ShortcutRegistry', () => {
  it('runs a global shortcut and prevents the default action', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: 'nav.jobs', keys: ['Ctrl+1'], scope: 'global', label: 'Jobs', run });
    const event = key({ key: '1', ctrlKey: true });
    expect(registry.handleKeyDown(event)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores keys while typing unless allowed', () => {
    const registry = new ShortcutRegistry();
    const help = vi.fn();
    const undo = vi.fn();
    registry.register({ id: 'help', keys: ['?'], scope: 'global', label: 'Help', run: help });
    registry.register({ id: 'undo', keys: ['Ctrl+Z'], scope: 'global', label: 'Undo', run: undo, allowWhileTyping: true });
    const input = document.createElement('input');
    registry.handleKeyDown(key({ key: '?', shiftKey: true }, input));
    registry.handleKeyDown(key({ key: 'z', ctrlKey: true }, input));
    expect(help).not.toHaveBeenCalled();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('only runs scoped shortcuts while their scope is active, and the newest scope wins', () => {
    const registry = new ShortcutRegistry();
    const home = vi.fn();
    const workspace = vi.fn();
    registry.register({ id: 'job.new', keys: ['Ctrl+N'], scope: 'jobs', label: 'New job', run: home });
    registry.register({ id: 'cab.add', keys: ['Ctrl+N'], scope: 'workspace', label: 'Add cabinet', run: workspace });

    registry.handleKeyDown(key({ key: 'n', ctrlKey: true }));
    expect(home).not.toHaveBeenCalled();

    const offJobs = registry.activateScope('jobs');
    registry.handleKeyDown(key({ key: 'n', ctrlKey: true }));
    expect(home).toHaveBeenCalledOnce();

    const offWorkspace = registry.activateScope('workspace');
    registry.handleKeyDown(key({ key: 'n', ctrlKey: true }));
    expect(workspace).toHaveBeenCalledOnce();
    expect(home).toHaveBeenCalledOnce();

    offWorkspace();
    offJobs();
    expect(registry.handleKeyDown(key({ key: 'n', ctrlKey: true }))).toBe(false);
  });

  it('skips a disabled shortcut so the key falls through', () => {
    const registry = new ShortcutRegistry();
    const run = vi.fn();
    registry.register({ id: 'undo', keys: ['Ctrl+Z'], scope: 'global', label: 'Undo', run, enabled: () => false });
    const event = key({ key: 'z', ctrlKey: true });
    expect(registry.handleKeyDown(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('lists active shortcuts, including documentation-only ones, and updates on change', () => {
    const registry = new ShortcutRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.register({ id: 'help', keys: ['?'], scope: 'global', label: 'Show shortcuts', run: () => undefined });
    const off = registry.register({ id: 'nudge', keys: ['ArrowUp'], display: [['↑', '↓']], scope: 'fields', label: 'Nudge' });
    expect(registry.getListing().map((l) => l.id)).toEqual(['help']);

    const deactivate = registry.activateScope('fields');
    expect(registry.getListing()).toEqual([
      { id: 'help', scope: 'global', label: 'Show shortcuts', keycaps: [['?']] },
      { id: 'nudge', scope: 'fields', label: 'Nudge', keycaps: [['↑', '↓']] },
    ]);
    // Documentation-only entries never swallow keys.
    expect(registry.handleKeyDown(key({ key: 'ArrowUp' }))).toBe(false);

    off();
    deactivate();
    expect(registry.getListing().map((l) => l.id)).toEqual(['help']);
    expect(listener).toHaveBeenCalled();
  });

  it('keeps a stable listing reference between changes', () => {
    const registry = new ShortcutRegistry();
    registry.register({ id: 'a', keys: ['A'], scope: 'global', label: 'A' });
    expect(registry.getListing()).toBe(registry.getListing());
  });
});
