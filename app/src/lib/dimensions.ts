import { formatDimension, parseDimension, ticks } from '@kerfuffle/engine';
import type { ParseResult, Ticks } from '@kerfuffle/engine';
import { displayRoundTo } from '../state/display';

/** The typographic inch mark used everywhere on screen. */
export const INCH = '″';

/** 1/16″ and 1″ in ticks: the ↑/↓ and Shift+↑/↓ nudge steps. */
export const NUDGE_FINE = ticks(4);
export const NUDGE_COARSE = ticks(64);

/**
 * Parse what a person typed. The engine's parseDimension is the only parser; the
 * one thing done here is accepting the typographic inch mark ″ as well as ", which
 * the spec allows (interaction-design §5.3) and the engine does not know about.
 */
export function parseTyped(input: string): ParseResult {
  return parseDimension(input.replaceAll(INCH, '"'));
}

/** Exact text for a value, at 1/64″, without an inch mark: what an input shows. */
export function exactText(value: Ticks): string {
  return formatDimension(value, { denominator: 64, inchMark: false }).text;
}

/** Exact display with the ″ mark, e.g. `23 3/4″`. */
export function exactInches(value: Ticks): string {
  return exactText(value) + INCH;
}

/**
 * Shop display, rounded to the Settings "round shown sizes to" value (1/16″
 * unless the shop changed it), with ″ and a leading ≈ when rounding changed the value.
 */
export function displayInches(value: Ticks, denominator: 8 | 16 | 32 | 64 = displayRoundTo()): string {
  const { text, inexact } = formatDimension(value, { denominator, inchMark: false });
  return `${inexact ? '≈' : ''}${text}${INCH}`;
}

/** Collapse whitespace so `23  3/4` and `23 3/4` count as the same typed form. */
export function sameTypedForm(typed: string, value: Ticks): boolean {
  return typed.trim().replace(/\s+/g, ' ') === exactText(value);
}
