import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { boxGeometry } from '@kerfuffle/engine';
import type { ConstructionRules, DependencyMap, Part, PartRole, TraceKey } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { CloseIcon } from '../../components/icons';
import { IconButton } from '../../components/IconButton';
import { SymbolChip } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { ViewTitle } from '../../components/ViewTitle';
import { dismissTracingHint } from '../../data/storage';
import type { CabinetRecord } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { useTracingHintDismissed } from '../../state/display';
import { ENDS_TEXT } from '../../workspace/cabinets';
import { firstInvalidField } from '../../workspace/calc';
import type { Evaluation } from '../../workspace/calc';
import type { CabinetBase } from '../../workspace/base';
import { hotPartOf, requestFocus, setUi, traceKeyOf, useUi } from '../../workspace/ui';
import { CabinetDrawing, layoutDrawing, scaleText, VIEW_H, VIEW_W } from './CabinetDrawing';
import { FIELD_NAME } from './Editor';
import { useCabinetBase, useTraceMap } from './hooks';
import { balloonNumbers } from './PartsPanel';
import styles from './Workspace.module.css';

/** Symbol and name for each trace key, as the caption shows them. */
export const KEY_INFO: Record<TraceKey, { symbol: string; name: string }> = {
  w: { symbol: 'W', name: 'Width' },
  h: { symbol: 'H', name: 'Overall height' },
  box: { symbol: 'Hb', name: 'Box height' },
  toe: { symbol: 't', name: 'Toe kick' },
  ctop: { symbol: 'T', name: 'Countertop' },
  d: { symbol: 'D', name: 'Depth' },
  shelves: { symbol: 'n', name: 'Shelves' },
  ends: { symbol: '◧', name: 'Finished ends' },
  qty: { symbol: '×', name: 'Quantity' },
  p: { symbol: 'p', name: 'Panel thickness' },
  cl: { symbol: 'c', name: 'Shelf clearance' },
  sb: { symbol: 's', name: 'Shelf setback' },
  wide: { symbol: 'S', name: 'Wide-shelf rule' },
  lam: { symbol: '+', name: 'Laminate oversize' },
};

/** Short names for the "→ changes …" list. */
const SHORT: Record<PartRole, string> = {
  back: 'back',
  bottom: 'bottom',
  'side-left': 'left side',
  'side-right': 'right side',
  top: 'top',
  'stretcher-front': 'front stretcher',
  'stretcher-back': 'back stretcher',
  nailer: 'nailer',
  'kick-board': 'kick board',
  front: 'front',
  shelf: 'shelf',
  'base-rail-front': 'front base rail',
  'base-rail-back': 'back base rail',
  'base-sleeper': 'base sleeper',
  'kick-skin': 'kick skin',
  'laminate-side-left': 'left end laminate',
  'laminate-side-right': 'right end laminate',
  'laminate-front': 'front laminate',
};

function partSize(part: Part): string {
  const t = part.thickness === null ? '' : ` × ${displayInches(part.thickness)}`;
  return `${displayInches(part.length)} × ${displayInches(part.width)}${t}`;
}

function keyValue(key: TraceKey, cabinet: CabinetRecord, evaluation: Evaluation, rules: ConstructionRules): string {
  const { spec } = evaluation;
  switch (key) {
    case 'w':
      return displayInches(spec.width);
    case 'h':
      return displayInches(spec.height);
    case 'd':
      return displayInches(spec.depth);
    case 'box':
      return evaluation.valid ? displayInches(boxGeometry(spec, rules).boxHeight) : '?';
    case 'toe':
      return cabinet.type === 'base' ? displayInches(rules.toeKickHeight) : 'n/a on wall cabinets';
    case 'ctop':
      return cabinet.type === 'base' ? displayInches(rules.countertopThickness) : 'n/a on wall cabinets';
    case 'shelves':
      return String(spec.shelfCount);
    case 'ends':
      return ENDS_TEXT[cabinet.finishedEnds];
    case 'qty':
      return `× ${spec.quantity}`;
    case 'p':
      return displayInches(rules.panelThickness);
    case 'cl':
      return `${displayInches(rules.shelfClearancePerSide)} each side`;
    case 'sb':
      return displayInches(rules.shelfSetback);
    case 'wide':
      return `${displayInches(rules.wideShelfThickness)} at ${displayInches(rules.shelfThickWidthThreshold)}+`;
    case 'lam':
      return `${displayInches(rules.laminateOversizePerEdge)} each edge`;
  }
}

/** Fixed-height line under the drawing: the traced part or dimension, else a hint. */
function Caption({
  cabinet,
  evaluation,
  rules,
  base,
  deps,
}: {
  cabinet: CabinetRecord;
  evaluation: Evaluation | null;
  rules: ConstructionRules;
  base: CabinetBase | null;
  deps: DependencyMap | null;
}) {
  const trace = useUi(traceKeyOf);
  const hot = useUi(hotPartOf);
  const pinned = useUi((ui) => ui.pinPart);
  // The cabinet's own parts, then the base it shares with its run.
  const parts = evaluation?.valid ? [...evaluation.parts, ...(base?.parts ?? [])] : [];
  const part = hot ? parts.find((p) => p.role === hot) : undefined;

  let body;
  if (part && evaluation) {
    const extra = [
      `qty ${part.quantity}`,
      part.run !== undefined && `shared by run ${part.run}`,
      part.optional && 'reference size',
      pinned === part.role && 'pinned',
    ]
      .filter(Boolean)
      .join(' · ');
    body = (
      <>
        <span className={cx(styles.bal, styles.balOn)} aria-hidden="true">
          {balloonNumbers(parts).get(part.role)}
        </span>
        <span className={styles.capName}>{part.name}</span>
        <span className={styles.capValue}>{partSize(part)}</span>
        <span className={styles.capExtra}>{extra}</span>
      </>
    );
  } else if (trace && evaluation) {
    const names = [...new Set(parts.filter((p) => deps?.[p.role]?.length).map((p) => SHORT[p.role]))];
    body = (
      <>
        <SymbolChip on>{KEY_INFO[trace].symbol}</SymbolChip>
        <span className={styles.capName}>{KEY_INFO[trace].name}</span>
        <span className={styles.capValue}>{keyValue(trace, cabinet, evaluation, rules)}</span>
        <span className={styles.capExtra}>→ changes {names.length > 0 ? names.join(', ') : 'nothing on this cabinet'}</span>
      </>
    );
  } else {
    body = <span className={styles.capHint}>Point at a part or dimension to trace it. Click a dimension to edit it; click a part to pin it.</span>;
  }
  return <div className={styles.caption}>{body}</div>;
}

/** Shown once per PC, the first time a job is open in the workspace, until it's dismissed. */
function TracingHint() {
  const dismissed = useTracingHintDismissed();
  if (dismissed) return null;
  return (
    <div className={styles.tracingHint} role="note" data-tracing-hint>
      <p>Point at any size or rule to see what it changes in the drawing.</p>
      <IconButton size="sm" label="Dismiss this tip" onClick={() => void dismissTracingHint()}>
        <CloseIcon />
      </IconButton>
    </div>
  );
}

function Toggle({ pressed, onClick, icon, children }: { pressed: boolean; onClick: () => void; icon: ReactNode; children: string }) {
  return (
    <button type="button" className={styles.toggle} aria-pressed={pressed} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

export function DrawingPanel({ cabinet, evaluation, rules }: { cabinet: CabinetRecord | null; evaluation: Evaluation | null; rules: ConstructionRules }) {
  const showDims = useUi((ui) => ui.showDims);
  const showOversize = useUi((ui) => ui.showOversize);
  const base = useCabinetBase(cabinet, evaluation);
  const deps = useTraceMap(cabinet, evaluation);
  const layout = useMemo(() => (evaluation ? layoutDrawing(evaluation, rules, base) : null), [evaluation, rules, base]);
  const name = cabinet ? cabinet.label.trim() || 'Unnamed' : '—';
  const bad = evaluation && !evaluation.valid ? firstInvalidField(evaluation.issues) : null;

  return (
    <Sheet padding="sm" aria-labelledby="ws-dw">
      <div className={styles.panelHead}>
        <ViewTitle id="ws-dw" mark="3" title="Drawing" sub={`${name} · ${scaleText(layout)}`} />
        <div className={styles.toggles}>
          <Toggle
            pressed={showDims}
            onClick={() => setUi({ showDims: !showDims })}
            icon={
              <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
                <path d="M1 5h12M1 2v6M13 2v6" />
              </svg>
            }
          >
            Dimensions
          </Toggle>
          <Toggle
            pressed={showOversize}
            onClick={() => setUi({ showOversize: !showOversize })}
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" strokeDasharray="2 1.5" />
              </svg>
            }
          >
            Oversize
          </Toggle>
        </div>
      </div>
      {cabinet && <TracingHint />}
      <div className={styles.frame} style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
        {cabinet && evaluation && layout ? (
          <CabinetDrawing
            evaluation={evaluation}
            layout={layout}
            label={cabinet.label.trim()}
            type={cabinet.type}
            ends={cabinet.finishedEnds}
            rules={rules}
            deps={deps}
          />
        ) : (
          <div className={styles.placeholder}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className={styles.placeholderMark}>
              <rect x="10" y="8" width="44" height="48" />
              <path d="M10 8l44 48M54 8L10 56" />
            </svg>
            <p>{cabinet ? 'The drawing comes back once every size is valid.' : 'The drawing appears here once the job has a cabinet.'}</p>
            {bad && (
              <Button onClick={() => requestFocus(bad)}>
                Go to {FIELD_NAME[bad]}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className={styles.viewTitles} aria-hidden={!layout || undefined} style={{ visibility: layout ? undefined : 'hidden' }}>
        <ViewTitle mark="A" title="Front elevation" size="sm" level={3} />
        <ViewTitle mark="B" title="Section" size="sm" level={3} />
      </div>
      {cabinet && <Caption cabinet={cabinet} evaluation={evaluation} rules={rules} base={base} deps={deps} />}
      {!cabinet && <div className={styles.caption} />}
    </Sheet>
  );
}
