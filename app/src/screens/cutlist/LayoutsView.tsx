import { useMemo, useState } from 'react';
import { LAYOUT_MODES } from '@kerfuffle/engine';
import type { LayoutMode, LayoutStats, MaterialLayout, SawProfile, Sensitivity, SheetPattern, UnplacedPiece } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { MODE_NAMES, sheetNumbersText, sheetSizeText, sheetsText } from '../../cutlist/layoutText';
import { changesText } from '../../data/layouts';
import type { LayoutChange } from '../../data/layouts';
import type { SavedLayoutRecord } from '../../data/types';
import { exactInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { routeHref } from '../../routes';
import { LayoutDrawing } from './LayoutDrawing';
import type { PointedPiece } from './LayoutDrawing';
import styles from './Layouts.module.css';
import { SymbolMark } from '../../components/InfoTip';

/** The layout the tab shows for one material: the one kept with the job, or the one worked out now. */
export interface ShownLayout {
  materialId: string;
  name: string;
  /** Null until the first layout arrives. */
  layout: MaterialLayout | null;
  source: 'saved' | 'live';
  /** The kept layout, when there is one (shown or not). */
  record: SavedLayoutRecord | null;
  /** What changed since the kept layout was made. */
  changes: LayoutChange[];
  /** The search has finished (a kept layout always has). */
  final: boolean;
  mode: LayoutMode;
  profile: SawProfile;
}

/** Why there's nothing to lay out: no cabinets, parts with no material, or no cabinet makes parts. */
export type NothingToLayOut = 'no-cabinets' | 'no-material' | 'no-parts';

export interface LayoutsViewProps {
  jobId: string;
  /** What's missing while there's nothing to lay out. */
  nothing: NothingToLayOut;
  /** The catalog has no materials to choose from. */
  catalogEmpty: boolean;
  /** Focus the materials panel. */
  onChooseMaterials: () => void;
  shown: ShownLayout | null;
  /** Ready to cut or later: the kept layout stays until Recalculate. */
  fixed: boolean;
  /** This material's measures in each mode; a mode still laying out is missing. */
  modeStats: Partial<Record<LayoutMode, LayoutStats>>;
  /** For this material. Null until the background run finishes. */
  sensitivity: Sensitivity | null;
  /** Pieces the job couldn't lay out at all (no material, no sheet size). */
  jobUnplaced: readonly UnplacedPiece[];
  error: string | null;
  hotLine: string | null;
  pinnedLine: string | null;
  onLine: (lineKey: string | null) => void;
  onPinLine: (lineKey: string) => void;
  /** Lay out again from the job as it is now; null until that layout is ready. */
  onRecalculate: (() => void) | null;
}

const NOTHING_TEXT: Record<NothingToLayOut, string> = {
  'no-cabinets': 'Nothing to lay out yet: this job has no cabinets.',
  'no-material': 'Nothing to lay out yet: no sheet parts have a material chosen.',
  'no-parts': 'Nothing to lay out yet: every cabinet needs a fix before it makes parts.',
};

/** The drawings' width on screen. */
const DRAWING_PX = 760;

/** Distinct marks on a pattern, with how many of each, in first-placed order. */
function marksOn(pattern: SheetPattern): { mark: string; lineKey: string; name: string; count: number }[] {
  const byMark = new Map<string, { mark: string; lineKey: string; name: string; count: number }>();
  for (const p of pattern.placements) {
    const seen = byMark.get(p.mark);
    if (seen) seen.count += 1;
    else byMark.set(p.mark, { mark: p.mark, lineKey: p.lineKey, name: p.name, count: 1 });
  }
  return [...byMark.values()];
}

function patternLabel(m: MaterialLayout, p: SheetPattern, name: string): string {
  const cuts = p.cuts.length;
  return `Sheet pattern ${p.id} of ${name}, ${sheetSizeText(m)}, cut ${p.count === 1 ? 'once' : `${p.count} times`}: ${p.placements.length === 1 ? '1 piece' : `${p.placements.length} pieces`}, ${cuts} ${cuts === 1 ? 'cut' : 'cuts'}, ${p.yieldPercent.toFixed(1)}% used.`;
}

function StatsStrip({ current, stats }: { current: LayoutMode; stats: Partial<Record<LayoutMode, LayoutStats>> }) {
  const cell = (s: LayoutStats | undefined, pick: (s: LayoutStats) => string) =>
    s ? (
      pick(s)
    ) : (
      <span aria-label="still laying out" className={styles.pending}>
        …
      </span>
    );
  return (
    <table className={styles.stats} aria-label="Measures in each mode">
      <thead>
        <tr>
          <th scope="col">Mode</th>
          <th scope="col">Sheets</th>
          <th scope="col">Yield</th>
          <th scope="col">Fence settings</th>
          <th scope="col">Patterns</th>
          <th scope="col">Cuts</th>
        </tr>
      </thead>
      <tbody>
        {LAYOUT_MODES.map((mode) => {
          const s = stats[mode];
          const here = mode === current;
          return (
            <tr key={mode} className={cx(here && styles.statsCurrent)} data-mode={mode} aria-current={here || undefined}>
              <th scope="row">
                <span aria-hidden="true" className={styles.statsGlyph}>
                  {here ? '◆' : ''}
                </span>
                {MODE_NAMES[mode]}
                {here && <span className="visually-hidden"> (shown)</span>}
              </th>
              <td>{cell(s, (v) => String(v.sheets))}</td>
              <td>{cell(s, (v) => `${v.yieldPercent.toFixed(1)}%`)}</td>
              <td>{cell(s, (v) => String(v.fenceSettings))}</td>
              <td>{cell(s, (v) => String(v.patterns))}</td>
              <td>{cell(s, (v) => String(v.cuts))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ALLOWANCE_LINKS = {
  kerf: { href: routeHref({ name: 'settings', section: 'saws' }), text: 'Saw profiles in Settings' },
  edgeTrim: { href: routeHref({ name: 'settings', section: 'saws' }), text: 'Saw profiles in Settings' },
  laminateOversize: { href: routeHref({ name: 'settings', section: 'construction' }), text: 'Construction in Settings' },
  shelfClearance: { href: routeHref({ name: 'settings', section: 'construction' }), text: 'Construction in Settings' },
} as const;

function Notes({ jobId, notes, pending }: { jobId: string; notes: Sensitivity | null; pending: boolean }) {
  if (!notes) {
    return <p className={styles.notesPending}>{pending ? 'Checking how close this layout is to saving or costing a sheet…' : ''}</p>;
  }
  const items = [
    ...notes.nearMisses.map((n) => {
      const link =
        n.change.kind === 'allowance' ? ALLOWANCE_LINKS[n.change.allowance] : { href: routeHref({ name: 'workspace', jobId }), text: 'the cabinets in the Workspace' };
      return (
        <li key={`n:${n.message}`} data-note="near-miss">
          <span className="cap">Could save</span> {n.message} <span className={styles.noteHow}>Change it in <a href={link.href}>{link.text}</a>.</span>
        </li>
      );
    }),
    ...notes.fragile.map((f) => (
      <li key={`f:${f.message}`} data-note="fragile">
        <span className="cap">Tight</span> {f.message}
      </li>
    )),
    ...notes.risks.map((r) => (
      <li key={`r:${r.message}`} data-note="risk">
        <span className="cap">Could cost</span> {r.message}
      </li>
    )),
    ...notes.lightSheets.map((l) => (
      <li key={`l:${l.message}`} data-note="light">
        <span className="cap">Light sheet</span> {l.message}
      </li>
    )),
  ];
  if (items.length === 0) return <p className={styles.notesPending}>No near misses: small changes to the allowances wouldn’t save or cost a sheet.</p>;
  return (
    <>
      <ul className={styles.notes}>{items}</ul>
      <p className={styles.noteHow}>Suggestions only. Nothing changes until you change it.</p>
    </>
  );
}

/**
 * The Layouts tab (plan §2.7): one drawing per sheet pattern for the chosen
 * material, the measures in each mode, and the sensitivity notes. Screen
 * only: the printout is LayoutPages.
 */
export function LayoutsView(props: LayoutsViewProps) {
  const { jobId, nothing, catalogEmpty, onChooseMaterials, shown, fixed, modeStats, sensitivity, jobUnplaced, error, hotLine, pinnedLine, onLine, onPinLine, onRecalculate } = props;
  const [pointed, setPointed] = useState<PointedPiece | null>(null);
  const layout = shown?.layout ?? null;
  const pieceNames = useMemo(() => new Map(layout?.pieces.map((p) => [p.id, p]) ?? []), [layout]);

  const point = (p: PointedPiece | null) => {
    setPointed(p);
    onLine(p?.lineKey ?? null);
  };

  let status: string;
  if (!shown) status = NOTHING_TEXT[nothing];
  else if (shown.source === 'saved' && shown.record) {
    status = `Kept with the job ${shown.record.createdAt.slice(0, 10)} · ${MODE_NAMES[shown.mode]} mode · ${shown.profile.name}, kerf ${exactInches(shown.profile.kerf)}, trim ${exactInches(shown.profile.edgeTrim)}.`;
  } else if (!layout) status = 'Laying out…';
  else if (!shown.final) status = 'Searching for a better layout. The best so far is shown.';
  else if (fixed) status = 'Not kept with the job yet: it’s kept when the layouts are printed or saved as PDF.';
  else status = 'Draft: worked out again whenever the job changes. Kept with the job when printed, saved as PDF or marked Ready to cut.';

  const hovered = pointed ? pieceNames.get(pointed.pieceId) : undefined;
  const banner = shown && shown.record && shown.source === 'saved' && shown.changes.length > 0;

  return (
    <div className={styles.view}>
      {error && (
        <p className={styles.error} role="alert">
          <SymbolMark symbol="needsFix" />{' '}
          The layout couldn’t be worked out: {error}
        </p>
      )}
      {banner && (
        <div className={styles.banner} role="note" data-layout-banner>
          <p>
            <SymbolMark symbol="warning" />{' '}
            <strong>{changesText(shown.changes)}.</strong> The kept layout is shown, and printed, until you recalculate it.
          </p>
          <Button
            size="lg"
            disabled={onRecalculate === null}
            disabledReason="Laying the job out as it is now…"
            onClick={() => onRecalculate?.()}
          >
            Recalculate
          </Button>
        </div>
      )}

      <p className={styles.status} role="status" aria-live="polite" data-layout-status>
        {status}
      </p>

      {!shown && (
        <p className={styles.nothingAction} data-layout-empty={nothing}>
          {nothing !== 'no-material' ? (
            <a href={routeHref({ name: 'workspace', jobId })}>Back to the workspace</a>
          ) : catalogEmpty ? (
            <a href={routeHref({ name: 'settings', section: 'materials' })}>Add materials in Settings → Materials</a>
          ) : (
            <button type="button" className={styles.linkButton} onClick={onChooseMaterials}>
              Choose materials
            </button>
          )}
        </p>
      )}

      {shown && (
        <section className={styles.panel} aria-labelledby="layout-stats-title">
          <h2 id="layout-stats-title" className={styles.panelTitle}>
            {shown.name}
            {layout && <span className={cx('mono', styles.panelSub)}>{sheetSizeText(layout)} sheet</span>}
          </h2>
          <StatsStrip current={shown.mode} stats={modeStats} />
          <p className={styles.trace} aria-live="off" data-layout-trace>
            {hovered ? (
              <>
                <span className={styles.traceMark}>{hovered.id}</span> {hovered.name} · {exactInches(hovered.length)} × {exactInches(hovered.width)} · for{' '}
                <strong>{hovered.ref}</strong>
              </>
            ) : (
              'Point at a piece to see its cut-list line and cabinet.'
            )}
          </p>
        </section>
      )}

      {shown && layout && (
        <div className={styles.patterns}>
          {layout.patterns.map((p) => (
            <section key={p.id} className={styles.pattern} aria-labelledby={`pattern-${p.id}`} data-pattern-id={p.id}>
              <header className={styles.patternHead}>
                <h3 id={`pattern-${p.id}`}>
                  Pattern {p.id} <span className={styles.times}>× {p.count}</span>
                </h3>
                <span className="mono">
                  {sheetNumbersText(p)} · {p.yieldPercent.toFixed(1)}% used · {p.cuts.length} cuts
                </span>
              </header>
              <div className={styles.drawingWrap}>
                <LayoutDrawing
                  layout={layout}
                  pattern={p}
                  trim={shown.profile.edgeTrim}
                  widthPx={DRAWING_PX}
                  label={patternLabel(layout, p, shown.name)}
                  hotLine={hotLine}
                  pinnedLine={pinnedLine}
                  onPoint={point}
                  onPin={onPinLine}
                />
              </div>
              <div className={styles.marks} role="group" aria-label={`Pieces on pattern ${p.id}`}>
                {marksOn(p).map((m) => {
                  const pinned = pinnedLine === m.lineKey;
                  return (
                    <button
                      key={m.mark}
                      type="button"
                      className={cx(styles.markChip, hotLine === m.lineKey && styles.markChipHot)}
                      aria-pressed={pinned}
                      aria-label={`${m.mark} ${m.name}, ${m.count} on this sheet`}
                      onPointerEnter={() => onLine(m.lineKey)}
                      onPointerLeave={() => onLine(null)}
                      onFocus={() => onLine(m.lineKey)}
                      onBlur={() => onLine(null)}
                      onClick={() => onPinLine(m.lineKey)}
                    >
                      <span className={styles.pm}>{m.mark}</span>
                      {m.count > 1 && <span className="mono">×{m.count}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {layout.patterns.length > 0 && (
            <div className={styles.legend} aria-hidden="true">
              <span>
                <svg width="28" height="14" className={styles.legendSwatch}>
                  <path d="M1 4.5h26M1 7.5h26M1 10.5h26" className={styles.grainLine} />
                  <rect x="1" y="1" width="26" height="12" />
                </svg>
                grain runs this way
              </span>
              <span>
                <svg width="28" height="14" className={styles.legendSwatch}>
                  <path d="M1 13L13 1M10 13L22 1M19 13L27 5" className={styles.hatchLine} />
                  <rect x="1" y="1" width="26" height="12" />
                </svg>
                offcut worth keeping
              </span>
              <span>
                <svg width="28" height="14" className={styles.legendSwatch}>
                  <path
                    d="M1 5L5 1M1 9L9 1M1 13L13 1M5 13L17 1M9 13L21 1M13 13L25 1M17 13L27 3M21 13L27 7M1 9L5 13M1 5L9 13M1 1L13 13M5 1L17 13M9 1L21 13M13 1L25 13M17 1L27 11M21 1L27 7"
                    className={styles.hatchLine}
                  />
                  <rect x="1" y="1" width="26" height="12" />
                </svg>
                waste
              </span>
              <span className="mono">1· 23 1/8 = rip 1, in cut order</span>
            </div>
          )}
        </div>
      )}

      {shown && layout && (layout.unplaced.length > 0 || layout.small.length > 0 || jobUnplaced.length > 0) && (
        <section className={styles.panel} aria-labelledby="layout-unplaced-title">
          <h2 id="layout-unplaced-title" className={styles.panelTitle}>
            Not on these sheets
          </h2>
          <ul className={styles.unplaced}>
            {[...layout.unplaced, ...jobUnplaced].map((u) => (
              <li key={u.piece.id} data-unplaced={u.reason}>
                {u.message}
              </li>
            ))}
            {layout.small.length > 0 && (
              <li data-unplaced="small">
                Laid out, but narrower than the saw’s smallest safe piece ({exactInches(shown.profile.minPiece)}): {layout.small.join(', ')}. Cut them with care.
              </li>
            )}
          </ul>
        </section>
      )}

      {shown && layout && (
        <section className={styles.panel} aria-labelledby="layout-notes-title">
          <h2 id="layout-notes-title" className={styles.panelTitle}>
            Sensitivity notes
            <span className={cx('mono', styles.panelSub)}>{layout ? sheetsText(layout.stats.sheets) : ''}</span>
          </h2>
          {shown.source === 'saved' && shown.changes.length > 0 ? (
            <p className={styles.notesPending}>Recalculate to see notes for the job as it is now.</p>
          ) : (
            <Notes jobId={jobId} notes={sensitivity} pending={!error} />
          )}
        </section>
      )}
    </div>
  );
}
