import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The token blocks of tokens.css, parsed: the light set on :root, the explicit
 * dark set, the System dark copy and the print (light) copy.
 */
export const tokensCss = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8').replace(/\r\n/g, '\n');

const SELECTORS = {
  light: ':root {',
  dark: ":root[data-theme='dark'] {",
  system: ":root:not([data-theme='light']) {",
  print: ':root:is([data-theme], :not([data-theme])) {',
} as const;

export type TokenBlock = keyof typeof SELECTORS;

function body(selector: string): string {
  const start = tokensCss.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css has no block ${selector}`);
  const from = start + selector.length;
  // Token blocks hold declarations only, so the first closing brace ends them.
  return tokensCss.slice(from, tokensCss.indexOf('}', from));
}

/** Declarations of one block, comments stripped, values whitespace-collapsed. */
export function tokenBlock(block: TokenBlock): Map<string, string> {
  const text = body(SELECTORS[block]).replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const declaration of text.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    map.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim().replace(/\s+/g, ' '));
  }
  return map;
}

/** Tokens whose value is a literal color (hex or rgb), as opposed to fonts, sizes or var() aliases. */
export function colorTokens(block: TokenBlock): Map<string, string> {
  return new Map([...tokenBlock(block)].filter(([name, value]) => name.startsWith('--') && /#[0-9a-f]{3,8}\b|rgb\(/i.test(value)));
}

export function hex(block: TokenBlock, name: string): string {
  const value = tokenBlock(block).get(name);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`No hex token ${name} in the ${block} set`);
  return value;
}

function luminance(color: string): number {
  const channel = (i: number) => {
    const c = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio of two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
