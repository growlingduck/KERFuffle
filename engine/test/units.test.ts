import { describe, expect, it } from 'vitest';
import { DIMENSION_EXAMPLES, formatDimension, inches, parseDimension, ticks, type Ticks } from '../src/index';

function parsed(text: string): Ticks {
  const result = parseDimension(text);
  if (!result.ok) throw new Error(`expected "${text}" to parse: ${result.message}`);
  return result.value;
}

function rejected(text: string): string {
  const result = parseDimension(text);
  if (result.ok) throw new Error(`expected "${text}" to be rejected, got ${result.value}`);
  return result.message;
}

describe('parseDimension', () => {
  it.each([
    ['23', 23 * 64],
    ['23.75', 23 * 64 + 48],
    ['.75', 48],
    ['0.015625', 1],
    ['23.500000', 23 * 64 + 32],
    ['23 3/4', 23 * 64 + 48],
    ['23-3/4', 23 * 64 + 48],
    ['23 - 3/4', 23 * 64 + 48],
    ['3/4', 48],
    ['23/32', 46],
    ['1/64', 1],
    ['3/2', 96],
    ['23 3/4"', 23 * 64 + 48],
    ['  23 3/4 "  ', 23 * 64 + 48],
    ['\t30\n', 30 * 64],
    ['0', 0],
  ])('accepts %j', (text, expected) => {
    expect(parsed(text)).toBe(expected);
  });

  it('rejects empty input', () => {
    expect(rejected('')).toBe(`Enter a size. ${DIMENSION_EXAMPLES}`);
    expect(rejected('   ')).toMatch(/enter a size/i);
    expect(rejected('"')).toMatch(/enter a size/i);
  });

  it('rejects negatives', () => {
    expect(rejected('-3')).toMatch(/negative/i);
    expect(rejected('-3/4')).toMatch(/negative/i);
  });

  it.each(['abc', '23 3/4 1/2', '3/', '1..5', '23 3', '1e3', '23 3/4 in', '23,5'])(
    'rejects non-numeric %j',
    (text) => {
      expect(rejected(text)).toBe('Type inches, like 23 3/4, 23-3/4 or 23.75.');
    },
  );

  it('rejects a zero denominator', () => {
    expect(rejected('3/0')).toMatch(/cannot be zero/i);
    expect(rejected('23 3/0')).toMatch(/cannot be zero/i);
  });

  it('rejects anything finer than 1/64"', () => {
    expect(rejected('1/128')).toMatch(/finer than 1\/64/);
    expect(rejected('23.1')).toMatch(/finer than 1\/64/);
    expect(rejected('1/3')).toMatch(/finer than 1\/64/);
    expect(rejected('0.0078125')).toMatch(/finer than 1\/64/);
  });

  it('rejects a mixed number whose fraction is 1 or more', () => {
    expect(rejected('23 5/4')).toMatch(/less than 1/);
  });

  it('ends every error with the forms a size can be typed in, after anything more specific', () => {
    expect(rejected('23 3/')).toBe(DIMENSION_EXAMPLES);
    expect(rejected('23 3/0')).toBe(`The bottom of a fraction cannot be zero. ${DIMENSION_EXAMPLES}`);
    for (const text of ['', '-3', '23 3/0', '23 5/4', '1/128', 'abc']) expect(rejected(text).endsWith(DIMENSION_EXAMPLES)).toBe(true);
  });
});

describe('formatDimension', () => {
  it.each([
    [inches(0), '0"'],
    [inches(3 / 4), '3/4"'],
    [inches(1 / 16), '1/16"'],
    [inches(23.75), '23 3/4"'],
    [inches(30), '30"'],
    [inches(28 + 7 / 16), '28 7/16"'],
  ])('formats %d ticks exactly as %s', (value, text) => {
    expect(formatDimension(value)).toEqual({ text, inexact: false });
  });

  it('rounds to the nearest 1/16" and flags it as inexact', () => {
    // 23/32 is exactly halfway between 11/16 and 3/4; halves round up.
    expect(formatDimension(inches(23 / 32))).toEqual({ text: '3/4"', inexact: true });
    // 1/64 rounds down to 0; 3/64 rounds up to 1/16.
    expect(formatDimension(ticks(1))).toEqual({ text: '0"', inexact: true });
    expect(formatDimension(ticks(3))).toEqual({ text: '1/16"', inexact: true });
    // 63/64 rounds up into the next whole inch.
    expect(formatDimension(inches(23 + 63 / 64))).toEqual({ text: '24"', inexact: true });
  });

  it('can show finer fractions when asked (used in validation messages)', () => {
    expect(formatDimension(inches(23 / 32), { denominator: 64 })).toEqual({ text: '23/32"', inexact: false });
    expect(formatDimension(inches(23 + 9 / 32), { denominator: 32 })).toEqual({ text: '23 9/32"', inexact: false });
    expect(formatDimension(ticks(1), { denominator: 32 })).toEqual({ text: '1/32"', inexact: true });
  });

  it('can show coarser fractions (the 1/8" display setting)', () => {
    expect(formatDimension(inches(28 + 7 / 16), { denominator: 8 })).toEqual({ text: '28 1/2"', inexact: true });
    expect(formatDimension(inches(28 + 3 / 8), { denominator: 8 })).toEqual({ text: '28 3/8"', inexact: false });
    expect(formatDimension(inches(23 / 32), { denominator: 8 })).toEqual({ text: '3/4"', inexact: true });
  });

  it('can leave off the inch mark', () => {
    expect(formatDimension(inches(23.75), { inchMark: false }).text).toBe('23 3/4');
  });

  it('formats negatives with a sign (for messages only; parts are never negative)', () => {
    expect(formatDimension(inches(-1.5)).text).toBe('-1 1/2"');
  });

  it('round-trips everything it prints exactly', () => {
    for (let value = 0; value <= 64 * 40; value += 4) {
      const { text, inexact } = formatDimension(ticks(value));
      expect(inexact).toBe(false);
      expect(parsed(text)).toBe(value);
    }
  });
});

describe('inches / ticks helpers', () => {
  it('converts exact inch values', () => {
    expect(inches(23 / 32)).toBe(46);
  });

  it('refuses values that are not whole 1/64ths', () => {
    expect(() => inches(0.1)).toThrow(RangeError);
    expect(() => ticks(1.5)).toThrow(RangeError);
  });
});
