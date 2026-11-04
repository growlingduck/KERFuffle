import { useId } from 'react';
import { SLOT_INFO } from '@kerfuffle/engine';
import type { JobSlot, MaterialIssue } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { changedMaterialCount, choicesFor, formatMoney, priceUnit } from '../../data/materials';
import type { PriceChange } from '../../data/materials';
import type { JobMaterialsRecord, MaterialRecord } from '../../data/types';
import { routeHref } from '../../routes';
import styles from './CutList.module.css';
import { SymbolMark } from '../../components/InfoTip';

export interface MaterialsPanelProps {
  jobId: string;
  /** The job's materials (or the shop defaults it's using). */
  record: JobMaterialsRecord;
  /** True when the job has no materials of its own yet. */
  usingDefaults: boolean;
  catalog: readonly MaterialRecord[];
  /** Slots this job has parts (or banding, or hardware) for, in slot order. */
  slots: readonly JobSlot[];
  issues: readonly MaterialIssue[];
  /** "2026-11-02", or null when nothing is priced yet. */
  pricesAsOf: string | null;
  changes: readonly PriceChange[];
  onChoose: (slot: JobSlot, materialId: string | null) => void;
  onUpdatePrices: () => void;
}

const NONE = '';

const PANEL_ID = 'cutlist-materials';

/** Bring the materials panel into view, focused on the first slot with no material (or the first slot). */
export function focusMaterialsPanel(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const target = panel.querySelector<HTMLElement>('select[aria-invalid="true"]') ?? panel.querySelector<HTMLElement>('select');
  panel.scrollIntoView?.({ block: 'nearest' });
  target?.focus({ preventScroll: true });
}

/**
 * Screen only: what each slot is cut from, changed per slot. A change copies
 * the material (and its price) into the job and regroups the cut list.
 */
export function MaterialsPanel({ jobId, record, usingDefaults, catalog, slots, issues, pricesAsOf, changes, onChoose, onUpdatePrices }: MaterialsPanelProps) {
  const id = useId();
  const changed = changedMaterialCount(changes);
  const settingsHref = routeHref({ name: 'settings', section: 'materials' });
  return (
    <section id={PANEL_ID} className={styles.railPanel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sketchTitle}>
        Materials
      </h2>
      <p className={styles.railHelp} style={{ marginTop: 6 }}>
        {usingDefaults
          ? 'This job uses the shop’s default materials. Choosing one keeps a copy, with its price, in the job.'
          : 'Each slot keeps a copy of its material and price. Editing the catalog never changes this job.'}
      </p>
      {catalog.length === 0 && (
        <p className={styles.railEmpty} data-empty="catalog">
          The materials catalog is empty. <a href={settingsHref}>Add materials in Settings → Materials</a>
        </p>
      )}
      {slots.length === 0 && (
        <p className={styles.railEmpty} data-empty="slots">
          No cabinets to choose materials for yet. <a href={routeHref({ name: 'workspace', jobId })}>Back to the workspace</a>
        </p>
      )}
      <div className={styles.slots}>
        {slots.map((slot) => {
          const current = record.slots[slot] ?? null;
          const choices = choicesFor(slot, catalog, current?.id ?? null);
          const known = current === null || choices.some((m) => m.id === current.id);
          const slotIssues = issues.filter((i) => i.slot === slot);
          const noteId = `${id}-${slot}-note`;
          return (
            <div key={slot} className={styles.slot}>
              <label className={styles.slotLabel} htmlFor={`${id}-${slot}`}>
                {SLOT_INFO[slot].name}
                <span className={styles.slotParts}>{SLOT_INFO[slot].parts}</span>
              </label>
              <select
                id={`${id}-${slot}`}
                className={styles.select}
                value={current?.id ?? NONE}
                aria-describedby={slotIssues.length > 0 || current ? noteId : undefined}
                aria-invalid={current === null || undefined}
                onChange={(e) => onChoose(slot, e.target.value === NONE ? null : e.target.value)}
              >
                <option value={NONE}>No material chosen</option>
                {/* A copy from another PC, or a deleted material, stays selectable as the job has it. */}
                {!known && current && <option value={current.id}>{current.name} (not in this catalog)</option>}
                {choices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
              <div id={noteId} className={styles.slotNote}>
                {slotIssues.map((issue) => (
                  <span key={issue.message} className={styles.slotWarn}>
                    <SymbolMark symbol="warning" />{' '}
                    {issue.message}
                  </span>
                ))}
                {current && slotIssues.length === 0 && (
                  <span className="mono">
                    {current.price === null ? 'needs a price' : `${formatMoney(current.price)} ${priceUnit(current)}`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.prices}>
        <span>
          {pricesAsOf ? (
            <>
              Prices as of <span className="mono">{pricesAsOf}</span>
            </>
          ) : (
            'No prices copied yet'
          )}
          {changed > 0 && <span className={styles.slotWarn}>{changed === 1 ? '1 catalog price has changed' : `${changed} catalog prices have changed`}</span>}
        </span>
        <Button
          disabled={changes.length === 0}
          disabledReason="The job’s prices match the catalog"
          onClick={onUpdatePrices}
        >
          Update prices
        </Button>
      </div>
      <p className={styles.railHelp}>
        Add materials and prices in <a href={settingsHref}>Settings → Materials</a>. Screen only: never printed.
      </p>
    </section>
  );
}
