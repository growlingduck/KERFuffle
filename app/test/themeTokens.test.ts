import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorTokens, tokenBlock, tokensCss } from './themeTokens';

describe('theme token sets', () => {
  it('the dark set redefines every light color token, and adds none of its own', () => {
    expect([...colorTokens('dark').keys()].sort()).toEqual([...colorTokens('light').keys()].sort());
  });

  it('the System copy of the dark set is identical to the explicit one', () => {
    expect(tokenBlock('system')).toEqual(tokenBlock('dark'));
  });

  it('print forces exactly the light colors', () => {
    expect(colorTokens('print')).toEqual(colorTokens('light'));
    expect(tokenBlock('print').get('color-scheme')).toBe('light');
  });

  it('each set names its color-scheme, so scrollbars and native controls follow', () => {
    expect(tokenBlock('light').get('color-scheme')).toBe('light');
    expect(tokenBlock('dark').get('color-scheme')).toBe('dark');
  });

  it('the print block comes last, so it wins over both dark blocks', () => {
    const print = tokensCss.indexOf('@media print');
    expect(print).toBeGreaterThan(tokensCss.indexOf(":root[data-theme='dark']"));
    expect(print).toBeGreaterThan(tokensCss.indexOf('@media (prefers-color-scheme: dark)'));
  });
});

/**
 * Every color lives in tokens.css, so both themes and print can recolor it.
 * The dev gallery is exempt.
 */
describe('no hard-coded colors outside tokens.css', () => {
  const src = join(process.cwd(), 'src');
  const files = (function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  })(src)
    .map((path) => relative(src, path).split(sep).join('/'))
    .filter((path) => /\.(css|tsx?)$/.test(path) && path !== 'styles/tokens.css' && !path.startsWith('dev/'));

  // Hex colors, rgb()/hsl() literals, and named black/white as a CSS or SVG value.
  const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|(?:color|fill|stroke|background)\s*[:=]\s*['"{]?\s*['"]?(?:white|black)\b/gi;

  it.each(files)('%s', (path) => {
    const text = readFileSync(join(src, path), 'utf8');
    const hits = text.split('\n').flatMap((line, i) => (line.match(COLOR) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(hits, `use a token from tokens.css instead`).toEqual([]);
  });
});
