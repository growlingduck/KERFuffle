import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Text contrast >= 4.5:1, including small labels (interaction-design §10).
 * axe can't measure contrast in jsdom, so the token pairs the components use
 * are checked here straight from tokens.css.
 */
const tokens = new Map(
  [...readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8').matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(
    (m) => [m[1]!, m[2]!] as const,
  ),
);

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function token(name: string): string {
  const value = tokens.get(name);
  if (!value) throw new Error(`No token ${name}`);
  return value;
}

describe('token contrast', () => {
  it.each([
    ['--ink', '--white'],
    ['--ink', '--paper'],
    ['--muted', '--white'],
    ['--muted', '--paper'],
    ['--muted-2', '--white'],
    ['--muted-2', '--vellum'],
    ['--disabled-text', '--white'],
    ['--blue', '--white'],
    ['--blue', '--blue-tint'],
    ['--blue-hover', '--blue-tint-row'],
    ['--white', '--blue'],
    ['--white', '--ink'],
    ['--red', '--white'],
    ['--red', '--red-tint'],
    ['--amber', '--white'],
    ['--amber', '--highlighter'],
    ['--green', '--white'],
    // The construction picker's chosen card.
    ['--blue', '--blue-tint-faint'],
    ['--ink', '--blue-tint-faint'],
    ['--muted', '--blue-tint-faint'],
  ])('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted text at 7:1 and captions at 5.5:1 as the spec states', () => {
    expect(contrast(token('--muted'), token('--white'))).toBeGreaterThanOrEqual(7);
    expect(contrast(token('--muted-2'), token('--white'))).toBeGreaterThanOrEqual(5.5);
  });
});
