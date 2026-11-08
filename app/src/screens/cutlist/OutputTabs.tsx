import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { OUTPUT_VIEWS } from '../../cutlist/outputTabs';
import type { OutputView } from '../../cutlist/outputTabs';
import styles from './CutList.module.css';

export const outputTabId = (view: OutputView) => `output-tab-${view}`;
export const OUTPUT_PANEL_ID = 'output-panel';

/**
 * Cut list · Layouts · Estimate as sheet tabs: three pages of the same job, not
 * settings or steps. Each tab's name is the page; the line under it (its
 * description) says what's on it. ←/→/Home/End move and show (WAI-ARIA tabs).
 */
export function OutputTabs({ value, onChange, summaries }: { value: OutputView; onChange: (view: OutputView) => void; summaries: Record<OutputView, string> }) {
  const refs = useRef(new Map<OutputView, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = OUTPUT_VIEWS.findIndex((v) => v.value === value);
    const last = OUTPUT_VIEWS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index + 1) % OUTPUT_VIEWS.length
      : event.key === 'ArrowLeft' ? (index - 1 + OUTPUT_VIEWS.length) % OUTPUT_VIEWS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    const view = OUTPUT_VIEWS[next]?.value;
    if (!view) return;
    event.preventDefault();
    onChange(view);
    refs.current.get(view)?.focus();
  };
  return (
    <div role="tablist" aria-label="Output" className={styles.tabs} onKeyDown={onKeyDown}>
      {OUTPUT_VIEWS.map(({ value: view, label }) => {
        const selected = view === value;
        return (
          <button
            key={view}
            ref={(el) => {
              if (el) refs.current.set(view, el);
              else refs.current.delete(view);
            }}
            id={outputTabId(view)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={OUTPUT_PANEL_ID}
            aria-labelledby={`${outputTabId(view)}-name`}
            aria-describedby={`${outputTabId(view)}-sum`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(view)}
          >
            <span id={`${outputTabId(view)}-name`} className={styles.tabName}>
              {label}
            </span>
            <span id={`${outputTabId(view)}-sum`} className={styles.tabSum}>
              {summaries[view]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
