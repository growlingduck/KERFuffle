/**
 * Units for the calculation engine.
 *
 * All lengths are stored as integer 1/64ths of an inch ("ticks"). That keeps
 * sheet-goods thicknesses such as 23/32" exact and avoids floating-point drift.
 * The core math in calculate.ts only ever adds and subtracts Ticks; parsing and
 * display live here so another unit (millimeters) can be added later without
 * touching the formulas.
 */

declare const ticksBrand: unique symbol;

/** A length in integer 1/64ths of an inch. */
export type Ticks = number & { readonly [ticksBrand]: true };

export const TICKS_PER_INCH = 64;

/** Display precision: 1/16". */
const DISPLAY_DENOMINATOR = 16;

/** Wrap an integer tick count. Throws if it is not a safe integer. */
export function ticks(count: number): Ticks {
  if (!Number.isSafeInteger(count)) {
    throw new RangeError(`Ticks must be an integer number of 1/64ths, got ${count}`);
  }
  return count as Ticks;
}

/**
 * Convert inches to Ticks. Throws if the value is not an exact multiple of 1/64".
 * Intended for constants and tests, e.g. `inches(23 / 32)`.
 */
export function inches(value: number): Ticks {
  const scaled = value * TICKS_PER_INCH;
  if (!Number.isFinite(scaled) || !Number.isInteger(scaled)) {
    throw new RangeError(`${value}" is not an exact multiple of 1/64"`);
  }
  return ticks(scaled);
}

/** Convert Ticks to a decimal inch value (for interop and debugging only). */
export function toInches(value: Ticks): number {
  return value / TICKS_PER_INCH;
}

export function addTicks(...values: Ticks[]): Ticks {
  let total = 0;
  for (const value of values) total += value;
  return total as Ticks;
}

export function subtractTicks(from: Ticks, ...values: Ticks[]): Ticks {
  let total: number = from;
  for (const value of values) total -= value;
  return total as Ticks;
}

export function multiplyTicks(value: Ticks, factor: number): Ticks {
  return ticks(value * factor);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; value: Ticks } | { ok: false; message: string };

/** Ends every parse error: the forms a size can be typed in. */
export const DIMENSION_EXAMPLES = 'Type inches, like 23 3/4, 23-3/4 or 23.75.';

const DECIMAL = /^(\d*)\.(\d+)$/;
const WHOLE = /^(\d+)$/;
const FRACTION = /^(\d+)\/(\d+)$/;
const MIXED = /^(\d+)(?:\s+|\s*-\s*)(\d+)\/(\d+)$/;

/**
 * Parse an imperial dimension typed by a person.
 *
 * Accepts `23`, `23.75`, `.75`, `23 3/4`, `23-3/4`, `3/4`, and any of those
 * followed by an inch mark (`"`), with surrounding whitespace. Zero is
 * accepted here; whether zero is allowed for a field is a validation concern.
 *
 * Every error ends with DIMENSION_EXAMPLES. Text that just isn't a size gets
 * the examples alone; a more specific problem (a zero denominator) goes first.
 */
export function parseDimension(input: string): ParseResult {
  let text = input.trim();
  if (text.endsWith('"')) text = text.slice(0, -1).trimEnd();

  if (text === '') return fail('Enter a size.');
  if (text.startsWith('-')) return fail('Dimensions cannot be negative.');

  let match = WHOLE.exec(text);
  if (match) return fromRational(BigInt(match[1] ?? '0'), 1n);

  match = DECIMAL.exec(text);
  if (match) {
    const whole = match[1] ?? '';
    const decimals = (match[2] ?? '').replace(/0+$/, '');
    const denominator = 10n ** BigInt(decimals.length);
    const numerator = BigInt(whole === '' ? '0' : whole) * denominator + BigInt(decimals === '' ? '0' : decimals);
    return fromRational(numerator, denominator);
  }

  match = FRACTION.exec(text);
  if (match) {
    const denominator = BigInt(match[2] ?? '0');
    if (denominator === 0n) return fail('The bottom of a fraction cannot be zero.');
    return fromRational(BigInt(match[1] ?? '0'), denominator);
  }

  match = MIXED.exec(text);
  if (match) {
    const whole = BigInt(match[1] ?? '0');
    const top = BigInt(match[2] ?? '0');
    const denominator = BigInt(match[3] ?? '0');
    if (denominator === 0n) return fail('The bottom of a fraction cannot be zero.');
    if (top >= denominator) {
      return fail('In a mixed number like 23 3/4, the fraction must be less than 1.');
    }
    return fromRational(whole * denominator + top, denominator);
  }

  return { ok: false, message: DIMENSION_EXAMPLES };
}

function fromRational(numerator: bigint, denominator: bigint): ParseResult {
  const scaled = numerator * BigInt(TICKS_PER_INCH);
  if (scaled % denominator !== 0n) {
    return fail('That is finer than 1/64". Round to the nearest 1/64" or coarser.');
  }
  const value = Number(scaled / denominator);
  if (!Number.isSafeInteger(value)) return fail('That dimension is too large.');
  return { ok: true, value: value as Ticks };
}

function fail(message: string): ParseResult {
  return { ok: false, message: `${message} ${DIMENSION_EXAMPLES}` };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export interface FormattedDimension {
  /** e.g. `23 3/4"`. Rounded to the nearest 1/16". */
  text: string;
  /** True when rounding changed the value; the UI should mark it (e.g. with ≈). */
  inexact: boolean;
}

export interface FormatOptions {
  /** Append an inch mark. Default true. */
  inchMark?: boolean;
  /** Finest fraction shown. Default 16 (the shop's display precision). */
  denominator?: 8 | 16 | 32 | 64;
}

/**
 * Format Ticks as a fractional inch string, by default at 1/16" precision.
 * Exact halves (e.g. odd 1/32nds at 1/16") round up, away from zero.
 */
export function formatDimension(value: Ticks, options: FormatOptions = {}): FormattedDimension {
  const denominator = options.denominator ?? DISPLAY_DENOMINATOR;
  const step = TICKS_PER_INCH / denominator;
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const steps = Math.floor((magnitude + step / 2) / step);
  const inexact = steps * step !== magnitude;

  const whole = Math.floor(steps / denominator);
  let top = steps % denominator;
  let bottom: number = denominator;
  while (top !== 0 && top % 2 === 0) {
    top /= 2;
    bottom /= 2;
  }

  let text: string;
  if (top === 0) text = String(whole);
  else if (whole === 0) text = `${top}/${bottom}`;
  else text = `${whole} ${top}/${bottom}`;

  if (negative && steps !== 0) text = `-${text}`;
  if (options.inchMark ?? true) text += '"';
  return { text, inexact };
}
