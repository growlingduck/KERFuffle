import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { initTheme, nextThemeChoice, readThemeChoice, resolvedTheme, setThemeChoice, THEME_KEY, themeChoice } from '../src/theme';
import { setMediaQuery } from './setup';
import { useTestDatabase } from './storage';
import { hex } from './themeTokens';

const root = document.documentElement;
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  setThemeChoice('system');
});

describe('theme choice', () => {
  it('defaults to System, with no data-theme so the OS decides', () => {
    expect(readThemeChoice()).toBe('system');
    initTheme();
    expect(themeChoice()).toBe('system');
    expect(root.dataset.theme).toBeUndefined();
  });

  it('stores Light and Dark per PC, and System as nothing', () => {
    setThemeChoice('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    setThemeChoice('light');
    expect(root.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
    setThemeChoice('system');
    expect(root.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('ignores a stored value it does not know', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia');
    expect(readThemeChoice()).toBe('system');
  });

  it('still switches when storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readThemeChoice()).toBe('system');
    expect(() => setThemeChoice('dark')).not.toThrow();
    expect(root.dataset.theme).toBe('dark');
  });

  it('cycles Light → Dark → System → Light', () => {
    expect(nextThemeChoice('light')).toBe('dark');
    expect(nextThemeChoice('dark')).toBe('system');
    expect(nextThemeChoice('system')).toBe('light');
  });

  it('follows the OS live under System', () => {
    initTheme();
    expect(resolvedTheme()).toBe('light');
    act(() => setMediaQuery('(prefers-color-scheme: dark)', true));
    expect(resolvedTheme()).toBe('dark');
    setThemeChoice('light');
    expect(resolvedTheme()).toBe('light');
  });
});

describe('before first paint (index.html)', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
  /** Run it with only what a page has before any module loads. */
  const runScript = (): void => {
    runInNewContext(script, { localStorage: window.localStorage, document });
  };

  it('has an inline script that reads the same key as src/theme.ts', () => {
    expect(script).toContain(`'${THEME_KEY}'`);
  });

  it.each(['light', 'dark'] as const)('sets data-theme="%s" from storage', (choice) => {
    window.localStorage.setItem(THEME_KEY, choice);
    delete root.dataset.theme;
    runScript();
    expect(root.dataset.theme).toBe(choice);
  });

  it('leaves System to the media query, and survives storage failing', () => {
    delete root.dataset.theme;
    runScript();
    expect(root.dataset.theme).toBeUndefined();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => runScript()).not.toThrow();
  });

  it('paints the --paper of each theme until the stylesheets load', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? '';
    expect(style).toContain(`html { background: ${hex('light', '--paper')};`);
    expect(style).toContain(`html[data-theme='dark'] { background: ${hex('dark', '--paper')};`);
    expect(style).toContain(`html:not([data-theme='light']) { background: ${hex('dark', '--paper')};`);
  });

  it('keeps that paint off printouts', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(indexHtml)?.[1] ?? '';
    // Every rule sits in a screen-only block; outside them there is nothing.
    const outside = style.replace(/@media screen[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').trim();
    expect(outside).toBe('');
  });
});

describe('the switches', () => {
  beforeEach(async () => {
    await useTestDatabase();
  });

  it('the header button cycles the theme and names the current one', async () => {
    window.location.hash = '#/jobs';
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    await user.click(screen.getByRole('button', { name: 'Theme: System' }));
    expect(root.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'Theme: Light' }));
    expect(root.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Theme: Dark' }));
    expect(root.dataset.theme).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Theme: System' })).toBeInTheDocument();
  });

  it('Settings has Light · Dark · System, System pressed by default, applied at once without Save', async () => {
    window.location.hash = '#/settings';
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(within(group).getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Dark' }));
    expect(root.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    // A viewing preference: the settings draft stays clean.
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    // The header button shows the same choice.
    expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument();
  });
});
