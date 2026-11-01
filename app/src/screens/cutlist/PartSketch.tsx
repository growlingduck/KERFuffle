import type { CutListLine, CutListTotals } from '@kerfuffle/engine';
import { lineName, refsText, thicknessText } from '../../cutlist/format';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import styles from './CutList.module.css';

export type SketchSource = 'pinned' | 'pointed' | 'first';

const SOURCE_TEXT: Record<SketchSource, string> = { pinned: 'Pinned', pointed: 'Pointed at', first: 'First row' };

/** The row drawn to scale: length across, grain lines and arrow along it, L and W dimensions. */
function Drawing({ line }: { line: CutListLine }) {
  const maxW = 230;
  const maxH = 120;
  const s = Math.min(maxW / line.length, maxH / line.width);
  const w = line.length * s;
  const h = line.width * s;
  const x = (300 - w) / 2 + 10;
  const y = 30 + (maxH - h) / 2;
  let grain = '';
  for (let gy = y + 6; gy < y + h - 3; gy += 7) grain += `M${x + 4} ${gy}q${w / 4} -2 ${w / 2} 0t${w / 2 - 8} 0`;
  const ay = y + h / 2;
  const ax1 = x + w / 2 - 30;
  const ax2 = x + w / 2 + 30;
  const arrow = `M${ax1} ${ay}H${ax2}M${ax2 - 7} ${ay - 5}L${ax2} ${ay}L${ax2 - 7} ${ay + 5}M${ax1 + 7} ${ay - 5}L${ax1} ${ay}L${ax1 + 7} ${ay + 5}`;
  const dims =
    `M${x} ${y + h + 6}V${y + h + 30}M${x + w} ${y + h + 6}V${y + h + 30}M${x} ${y + h + 24}H${x + w}` +
    `M${x - 4} ${y + h + 28}l8 -8M${x + w - 4} ${y + h + 28}l8 -8` +
    `M${x - 6} ${y}H${x - 30}M${x - 6} ${y + h}H${x - 30}M${x - 24} ${y}V${y + h}` +
    `M${x - 28} ${y + 4}l8 -8M${x - 28} ${y + h + 4}l8 -8`;
  const laminate = line.category === 'laminate';
  const L = displayInches(line.length);
  const W = displayInches(line.width);
  return (
    <svg
      className={styles.sketchSvg}
      viewBox="0 0 300 210"
      role="img"
      aria-label={`${lineName(line)}, ${L} long by ${W} wide, grain along the length`}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={laminate ? 'var(--vellum)' : 'var(--white)'}
        stroke="var(--ink)"
        strokeWidth={laminate ? 1.4 : 1.6}
        strokeDasharray={laminate ? '6 3' : undefined}
      />
      <path d={grain} fill="none" stroke="#8e9095" strokeWidth="0.8" />
      <path d={arrow} fill="none" stroke="var(--blue)" strokeWidth="1.5" />
      <text x={x + w / 2} y={ay - 9} textAnchor="middle" fill="var(--blue)" style={{ font: '600 9px var(--font-cond)', letterSpacing: '0.1em' }}>
        GRAIN
      </text>
      <path d={dims} fill="none" stroke="var(--muted)" strokeWidth="0.8" />
      <text x={x + w / 2} y={y + h + 44} textAnchor="middle" fill="var(--ink)" style={{ font: '600 12px var(--font-mono)' }}>
        L {L}
      </text>
      <text
        x={x - 34}
        y={y + h / 2}
        transform={`rotate(-90 ${x - 34} ${y + h / 2})`}
        textAnchor="middle"
        fill="var(--ink)"
        style={{ font: '600 12px var(--font-mono)' }}
      >
        W {W}
      </text>
    </svg>
  );
}

export interface PartSketchProps {
  line: CutListLine | null;
  source: SketchSource;
  totals: CutListTotals;
}

/** Screen-only rail beside the sheets: the part sketch and the job totals. */
export function PartSketch({ line, source, totals }: PartSketchProps) {
  return (
    <aside className={styles.rail} aria-label="Part sketch and totals">
      <div className={styles.railPanel}>
        <div className={styles.sketchHead}>
          <span className={styles.sketchBubble} aria-hidden="true">
            {line?.mark ?? '–'}
          </span>
          <div>
            <h2 className={styles.sketchTitle}>Part sketch</h2>
            <div className={cx('mono', styles.sketchState)} aria-live="polite">
              {line ? `${SOURCE_TEXT[source]} · ${line.category === 'laminate' ? 'Laminate' : 'Panel'}` : 'Nothing to sketch'}
            </div>
          </div>
        </div>
        {line && (
          <>
            <Drawing line={line} />
            <dl className={styles.sketchFacts}>
              <div>
                <dt className="cap">Thick.</dt>
                <dd className="mono">{thicknessText(line.thickness)}</dd>
              </div>
              <div>
                <dt className="cap">Qty</dt>
                <dd className="mono">{line.quantity}</dd>
              </div>
              <div>
                <dt className="cap">Mark</dt>
                <dd className="mono">{line.mark}</dd>
              </div>
            </dl>
            <p className={styles.sketchFrom}>
              <strong>{lineName(line)}</strong> <span className={styles.muted}>· from {refsText(line.refs)}</span>
            </p>
          </>
        )}
        <p className={styles.railHelp}>
          Point at a row to sketch it; click to keep it here. Point at a cabinet to trace its parts; click to show only that
          cabinet. Screen only: never printed.
        </p>
      </div>
      <div className={styles.railPanel}>
        <h2 className={cx('cap', styles.totalsTitle)}>Totals</h2>
        <dl className={styles.totals}>
          <div>
            <dt>Boxes to build</dt>
            <dd className="mono">{totals.boxes}</dd>
          </div>
          <div>
            <dt>Panel pieces</dt>
            <dd className="mono">{totals.panelPieces}</dd>
          </div>
          <div>
            <dt>Laminate pieces</dt>
            <dd className="mono">{totals.laminatePieces}</dd>
          </div>
          <div>
            <dt>Distinct cuts</dt>
            <dd className="mono">{totals.distinctCuts}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
