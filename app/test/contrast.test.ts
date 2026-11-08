import { describe, expect, it } from 'vitest';
import { contrast, hex } from './themeTokens';

/**
 * Text contrast >= 4.5:1, including small labels (interaction-design §10), in
 * both themes. axe can't measure contrast in jsdom, so the token pairs the
 * components use are checked here straight from tokens.css.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['--ink', '--white'],
  ['--ink', '--paper'],
  ['--ink', '--vellum'],
  ['--ink', '--paper-hover'],
  ['--muted', '--white'],
  ['--muted', '--paper'],
  ['--muted-2', '--white'],
  ['--muted-2', '--vellum'],
  ['--disabled-text', '--white'],
  ['--blue', '--white'],
  ['--blue', '--blue-tint'],
  ['--blue-hover', '--blue-tint'],
  ['--blue-hover', '--blue-tint-row'],
  ['--ink', '--blue-tint-row'],
  ['--ink', '--blue-tint-strong'],
  // Text on solid blue: primary buttons, pinned chips, symbol chips.
  ['--on-blue', '--blue'],
  ['--on-blue', '--blue-hover'],
  // Inverted surfaces: toast, tooltip, segmented thumb, current settings section.
  ['--white', '--ink'],
  ['--red', '--white'],
  ['--red', '--red-tint'],
  ['--red-hover', '--red-tint'],
  ['--amber', '--white'],
  ['--amber', '--highlighter'],
  ['--ink', '--highlighter'],
  ['--ink', '--amber-tint'],
  ['--green', '--white'],
  ['--green-deep', '--green-tint'],
  ['--green-deep', '--green-tint-strong'],
  // The construction picker's chosen card.
  ['--blue', '--blue-tint-faint'],
  ['--ink', '--blue-tint-faint'],
  ['--muted', '--blue-tint-faint'],
];

describe.each(['light', 'dark'] as const)('token contrast, %s theme', (theme) => {
  it.each(PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted text at 7:1 and captions at 5.5:1 as the spec states', () => {
    expect(contrast(hex(theme, '--muted'), hex(theme, '--white'))).toBeGreaterThanOrEqual(7);
    expect(contrast(hex(theme, '--muted-2'), hex(theme, '--white'))).toBeGreaterThanOrEqual(5.5);
  });
});

describe('dark theme ratios against its paper and vellum', () => {
  it.each([
    ['--muted', 7],
    ['--muted-2', 5.5],
    ['--disabled-text', 4.5],
  ] as const)('%s is at least %s:1 on the dark paper, vellum and sheet', (token, min) => {
    for (const ground of ['--paper', '--vellum', '--white']) {
      expect(contrast(hex('dark', token), hex('dark', ground)), `${token} on ${ground}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('keeps the selection blue apart from the blueprint ground', () => {
    // Selected rows must read as selected, not as more paper.
    expect(contrast(hex('dark', '--blue-tint-row'), hex('dark', '--white'))).toBeGreaterThanOrEqual(1.3);
    expect(contrast(hex('dark', '--blue'), hex('dark', '--blue-tint-strong'))).toBeGreaterThanOrEqual(3);
  });
});
