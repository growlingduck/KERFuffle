import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Toast } from '../src/components/Toast';
import { initMotion, prefersReducedMotion } from '../src/motion';
import { setMediaQuery } from './setup';

const QUERY = '(prefers-reduced-motion: reduce)';
let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
});

function css(name: string): string {
  // Tests run from the app workspace directory.
  return readFileSync(join(process.cwd(), 'src', 'styles', name), 'utf8');
}

describe('reduced motion', () => {
  it('follows the media query as it is toggled', () => {
    stop = initMotion();
    expect(document.documentElement.dataset.motion).toBe('full');
    expect(prefersReducedMotion()).toBe(false);

    act(() => setMediaQuery(QUERY, true));
    expect(document.documentElement.dataset.motion).toBe('reduce');
    expect(prefersReducedMotion()).toBe(true);

    act(() => setMediaQuery(QUERY, false));
    expect(document.documentElement.dataset.motion).toBe('full');
  });

  it('drops the toast drain animation but keeps the toast and its timer', () => {
    stop = initMotion();
    const { container } = render(<Toast message="Saved" onDismiss={() => undefined} />);
    expect(container.querySelector('[class*="drain"]')).not.toBeNull();

    act(() => setMediaQuery(QUERY, true));
    expect(container.querySelector('[class*="drain"]')).toBeNull();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('zeroes every motion token and stops animations under the reduce flag', () => {
    const tokens = css('tokens.css');
    const reduceBlock = /:root\[data-motion='reduce'\]\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? '';
    const declared = [...tokens.matchAll(/(--dur-[a-z]+):/g)].map((m) => m[1]);
    expect(new Set(declared).size).toBeGreaterThanOrEqual(6);
    for (const token of new Set(declared)) expect(reduceBlock).toContain(`${token}: 0ms`);

    const base = css('base.css');
    expect(base).toMatch(/:root\[data-motion='reduce'\] \*[\s\S]*?animation-duration: 1ms !important[\s\S]*?transition-duration: 0ms !important/);
    expect(base).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
