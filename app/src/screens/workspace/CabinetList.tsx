import { memo, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { inches, runOf, usesRuns } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, Ticks } from '@kerfuffle/engine';
import { IconButton } from '../../components/IconButton';
import { DuplicateIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { Kbd } from '../../components/Kbd';
import type { MenuEntry } from '../../components/Menu';
import { Sheet } from '../../components/Sheet';
import { SplitButton } from '../../components/SplitButton';
import { ViewTitle } from '../../components/ViewTitle';
import { jobSession } from '../../data/storage';
import type { CabinetRecord } from '../../data/types';
import { displayInches, INCH } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { prefersReducedMotion } from '../../motion';
import { showToast } from '../../state/toast';
import { evaluateCabinet } from '../../workspace/calc';
import { CABINET_TYPE_ORDER, duplicateLabels, ENDS_TEXT, isDuplicateLabel, NEW_CABINET, newCabinet, PRESET_WIDTHS, TYPE_LABEL } from '../../workspace/cabinets';
import { removeWithExit, runCommand, undoIfLatest } from '../../workspace/history';
import { selectCabinet, selectedCabinetId, setUi, useSelectedCabinetId, useUi, workspaceUi } from '../../workspace/ui';
import { useCabinets, useDraftFor, useRules } from './hooks';
import { MiniElevation } from './MiniElevation';
import styles from './Workspace.module.css';
import { SymbolMark } from '../../components/InfoTip';

/** The "new row" sweep (§3 slow). */
const SWEEP_MS = 1400;
let sweepTimer: ReturnType<typeof setTimeout> | null = null;

function sweep(id: string) {
  setUi({ fresh: id });
  if (sweepTimer !== null) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => {
    if (workspaceUi.getState().fresh === id) setUi({ fresh: null });
  }, prefersReducedMotion() ? 0 : SWEEP_MS);
}

function focusRow(id: string | null) {
  if (!id) return;
  // After React has rendered the row.
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cabinet-pick="${CSS.escape(id)}"]`)?.focus());
}

/** Shared by the list buttons and the workspace shortcuts. */
export function addCabinet(cabinets: readonly CabinetRecord[], type: CabinetType, width?: number) {
  // A tall cabinet's starting fixed shelves come from the job's rule.
  const rules = jobSession.getJob()?.rules;
  const cabinet = newCabinet(cabinets, type, width === undefined ? undefined : inches(width), rules);
  if (runCommand({ type: 'addCabinet', cabinet })) sweep(cabinet.id);
}

export function duplicateCabinet(id: string) {
  const entry = runCommand({ type: 'duplicateCabinet', cabinetId: id, newId: crypto.randomUUID() });
  if (entry?.selectAfter) sweep(entry.selectAfter);
}

/** Remove with the slide-out and a toast with Undo. Focus follows the new selection if it was in the list. */
export function removeCabinet(id: string, label: string) {
  const hadFocus = Boolean(document.activeElement?.closest('[data-cabinet-list]'));
  removeWithExit(id, (entry) => {
    if (!entry) return;
    if (hadFocus) focusRow(entry.selectAfter);
    showToast(`Removed ${label.trim() || 'cabinet'}`, { label: 'Undo', run: () => void undoIfLatest(entry) });
  });
}

function sizeText(spec: { width: Ticks; height: Ticks; depth: Ticks }) {
  const t = (v: Ticks) => displayInches(v).replace(INCH, '');
  return `${t(spec.width)} × ${t(spec.height)} × ${t(spec.depth)}`;
}

interface RowProps {
  cabinet: CabinetRecord;
  rules: ConstructionRules;
  selected: boolean;
  fresh: boolean;
  leaving: boolean;
  canRemove: boolean;
  duplicateId: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, id: string) => void;
}

/**
 * One cabinet. Memoized and subscribed to its own draft only, so typing in the
 * editor re-renders this row and no other.
 */
const CabinetRow = memo(function CabinetRow({ cabinet, rules, selected, fresh, leaving, canRemove, duplicateId, onKeyDown }: RowProps) {
  const draft = useDraftFor(cabinet.id);
  const live = useMemo(() => evaluateCabinet(cabinet, rules, draft), [cabinet, rules, draft]);
  const rowRef = useRef<HTMLLIElement>(null);
  const name = cabinet.label.trim() || 'Unnamed';

  useEffect(() => {
    if (fresh) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [fresh]);

  return (
    <li
      ref={rowRef}
      className={cx(styles.cabRow, selected && styles.cabRowOn, fresh && styles.cabRowFresh, leaving && styles.cabRowOut)}
      data-cabinet-id={cabinet.id}
    >
      <button
        type="button"
        className={styles.pick}
        data-cabinet-pick={cabinet.id}
        aria-current={selected || undefined}
        onClick={() => selectCabinet(cabinet.id)}
        onKeyDown={(e) => onKeyDown(e, cabinet.id)}
      >
        <MiniElevation spec={live.spec} rules={rules} invalid={!live.valid} />
        <span className={styles.pickText}>
          <span className={styles.pickHead}>
            <span className={styles.cabId}>{name}</span>
            <span className={styles.cabType}>{TYPE_LABEL[cabinet.type]}</span>
            {duplicateId && (
              <span className={styles.cabDup}>
                <SymbolMark symbol="warning" decorative /> ID used twice
              </span>
            )}
            {cabinet.quantity > 1 && (
              <span className={styles.qtyBadge}>
                <span className="visually-hidden">quantity </span>×{cabinet.quantity}
              </span>
            )}
          </span>
          {live.valid ? (
            <span className={styles.cabSize}>{sizeText(live.spec)}</span>
          ) : (
            <span className={cx(styles.cabSize, styles.cabBad)}>
              <SymbolMark symbol="needsFix" decorative /> Needs a fix
            </span>
          )}
          <span className={styles.cabEnds}>{ENDS_TEXT[cabinet.finishedEnds]}</span>
        </span>
      </button>
      <div className={styles.rowActs}>
        <IconButton size="sm" label={`Duplicate ${name}`} tooltip={`Duplicate ${name}  Ctrl+D`} onClick={() => duplicateCabinet(cabinet.id)}>
          <DuplicateIcon />
        </IconButton>
        <IconButton
          size="sm"
          className={styles.removeBtn}
          label={`Remove ${name}`}
          disabled={!canRemove}
          disabledReason="A job needs at least one cabinet"
          onClick={() => removeCabinet(cabinet.id, cabinet.label)}
        >
          <TrashIcon />
        </IconButton>
      </div>
    </li>
  );
});

export interface CabinetGroup {
  id: string;
  title: string;
  /** "3 cabinets · 84″ long": what the run's base will be built for. */
  sub: string;
  cabinets: CabinetRecord[];
}

/**
 * The list by run: each run in the order it first appears, then base and tall
 * cabinets with no run (each gets its own base), then wall cabinets (no base).
 */
export function groupByRun(cabinets: readonly CabinetRecord[]): CabinetGroup[] {
  const runs = new Map<string, CabinetRecord[]>();
  const loose: CabinetRecord[] = [];
  const walls: CabinetRecord[] = [];
  for (const c of cabinets) {
    if (c.type === 'wall') {
      walls.push(c);
      continue;
    }
    const run = runOf(c);
    if (run === null) loose.push(c);
    else runs.set(run, [...(runs.get(run) ?? []), c]);
  }
  const count = (list: readonly CabinetRecord[]) => {
    const boxes = list.reduce((n, c) => n + c.quantity, 0);
    return `${boxes} ${boxes === 1 ? 'cabinet' : 'cabinets'}`;
  };
  const groups: CabinetGroup[] = [...runs].map(([run, list]) => {
    const length = list.reduce((sum, c) => sum + c.width * c.quantity, 0) as Ticks;
    return { id: `run:${run}`, title: `Run: ${run}`, sub: `${count(list)} · ${displayInches(length)} long`, cabinets: list };
  });
  if (loose.length > 0) groups.push({ id: 'loose', title: 'No run (own base)', sub: count(loose), cabinets: loose });
  if (walls.length > 0) groups.push({ id: 'walls', title: 'Wall cabinets', sub: count(walls), cabinets: walls });
  return groups;
}

function presetItems(cabinets: readonly CabinetRecord[], rules: ConstructionRules): MenuEntry[] {
  return CABINET_TYPE_ORDER.map((type) => {
    const size = NEW_CABINET[type];
    const h = displayInches(size.height).replace(INCH, '');
    const d = displayInches(size.depth).replace(INCH, '');
    return {
      type: 'group',
      id: type,
      label: `${TYPE_LABEL[type]} · ${h}${INCH} high, ${d}${INCH} deep`,
      items: PRESET_WIDTHS.map((width) => ({
        id: `${type}-${width}`,
        label: (
          <span className={styles.preset}>
            <MiniElevation
              spec={{
                type,
                width: inches(width),
                height: size.height,
                shelfCount: size.shelfCount,
                finishedEnds: 'none',
                ...(type === 'tall' ? { fixedShelfCount: newCabinet(cabinets, type, inches(width), rules).fixedShelfCount ?? 0 } : {}),
              }}
              rules={rules}
              invalid={false}
            />
            <span className={styles.presetText}>
              <span className={styles.presetName}>
                {width}
                {INCH} {type}
              </span>
              <span className={styles.presetSize}>
                {width} × {h} × {d}
              </span>
            </span>
          </span>
        ),
        onSelect: () => addCabinet(cabinets, type, width),
      })),
    };
  });
}

export function CabinetList() {
  const cabinets = useCabinets();
  const rules = useRules();
  const selected = useSelectedCabinetId();
  const fresh = useUi((ui) => ui.fresh);
  const leaving = useUi((ui) => ui.leaving);
  const dupes = useMemo(() => duplicateLabels(cabinets), [cabinets]);
  const boxes = cabinets.reduce((n, c) => n + c.quantity, 0);
  const currentType = cabinets.find((c) => c.id === selected)?.type ?? 'base';
  const runsApply = rules ? usesRuns(rules.method) : false;
  const grouped = useUi((ui) => ui.groupByRun) && runsApply;
  const groups = useMemo(() => (grouped ? groupByRun(cabinets) : null), [grouped, cabinets]);
  // Arrow keys follow the list as shown.
  const ordered = useMemo(() => groups?.flatMap((g) => g.cabinets) ?? cabinets, [groups, cabinets]);

  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = ordered.findIndex((c) => c.id === id);
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    selectCabinet(next.id);
    focusRow(next.id);
  };

  if (!rules) return null;
  const row = (c: CabinetRecord) => (
    <CabinetRow
      key={c.id}
      cabinet={c}
      rules={rules}
      selected={c.id === selected}
      fresh={fresh === c.id}
      leaving={leaving === c.id}
      canRemove={cabinets.length > 1}
      duplicateId={isDuplicateLabel(c.label, dupes)}
      onKeyDown={onRowKey}
    />
  );
  return (
    <Sheet padding="sm" aria-labelledby="ws-cab" className={styles.listPanel}>
      <div className={styles.listHead}>
        <ViewTitle id="ws-cab" mark="1" title="Cabinets" sub={`${cabinets.length} ${cabinets.length === 1 ? 'ENTRY' : 'ENTRIES'} · ${boxes} ${boxes === 1 ? 'BOX' : 'BOXES'}`} />
        {runsApply && cabinets.length > 0 && (
          <button type="button" className={styles.toggle} aria-pressed={grouped} onClick={() => setUi({ groupByRun: !grouped })}>
            Group by run
          </button>
        )}
      </div>
      {cabinets.length === 0 ? (
        <p className={styles.empty}>No cabinets yet. Use Add cabinet below to start.</p>
      ) : groups ? (
        <div className={styles.cabGroups} data-cabinet-list role="group" aria-label="Cabinets in this job, by run">
          {groups.map((g) => (
            <section key={g.id} className={styles.cabGroup} aria-labelledby={`ws-group-${g.id}`}>
              <h3 id={`ws-group-${g.id}`} className={styles.cabGroupHead}>
                <span className={styles.cabGroupTitle}>{g.title}</span>
                <span className={styles.cabGroupSub}>{g.sub}</span>
              </h3>
              <ul className={styles.cabList} aria-labelledby={`ws-group-${g.id}`}>
                {g.cabinets.map(row)}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className={styles.cabList} data-cabinet-list aria-label="Cabinets in this job">
          {cabinets.map(row)}
        </ul>
      )}
      <SplitButton
        className={styles.addSplit}
        icon={<PlusIcon />}
        onClick={() => addCabinet(cabinets, currentType)}
        tooltip="Add cabinet  Ctrl+N"
        keyShortcuts="Control+N"
        menuLabel="Add from a preset size"
        items={presetItems(cabinets, rules)}
      >
        Add cabinet
      </SplitButton>
      <p className={styles.listHint}>
        <Kbd>↑</Kbd> <Kbd>↓</Kbd> move between cabinets · <Kbd>Ctrl</Kbd> <Kbd>D</Kbd> duplicate · <Kbd>Del</Kbd> remove
      </p>
    </Sheet>
  );
}

/** For shortcuts: the selected cabinet record. */
export function selectedCabinet(cabinets: readonly CabinetRecord[]): CabinetRecord | undefined {
  const id = selectedCabinetId();
  return cabinets.find((c) => c.id === id);
}
