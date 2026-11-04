import { useId } from 'react';
import { GLOSSARY, SYMBOLS } from '../lib/glossary';
import type { GlossaryKey, SymbolKey } from '../lib/glossary';
import { cx } from '../lib/interaction';
import styles from './InfoTip.module.css';
import { Tooltip } from './Tooltip';

/**
 * A small ? beside a shop term. Hover or keyboard focus shows the glossary
 * entry in the tooltip. It's announced as "About {term}", with the entry as
 * its description, so a screen reader gets the text without opening anything.
 * Screen only: hidden in print.
 */
export function InfoTip({ term, className }: { term: GlossaryKey; className?: string | undefined }) {
  const entry = GLOSSARY[term];
  const textId = useId();
  return (
    <span className={cx(styles.info, className)} data-glossary={term}>
      <Tooltip content={entry.text} multiline>
        <button type="button" className={styles.button} aria-label={`About ${entry.term}`} aria-describedby={textId}>
          <span aria-hidden="true">?</span>
        </button>
      </Tooltip>
      <span id={textId} hidden>
        {entry.text}
      </span>
    </span>
  );
}

/**
 * △ ◆ or ⚠ on its own: named for screen readers ("Warning") and in a tooltip.
 * Where words beside it already say what it means (a hidden "Warning:", or
 * "Needs a fix"), pass `decorative` so it isn't read twice; it still shows
 * its tooltip on hover.
 */
export function SymbolMark({ symbol, decorative = false, className }: { symbol: SymbolKey; decorative?: boolean; className?: string | undefined }) {
  const { glyph, label } = SYMBOLS[symbol];
  return (
    <Tooltip content={label}>
      <span
        className={cx(styles.symbol, className)}
        data-symbol={symbol}
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      >
        {glyph}
      </span>
    </Tooltip>
  );
}
