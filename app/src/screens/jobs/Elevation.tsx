import { TICKS_PER_INCH } from '@kerfuffle/engine';
import { DimensionLine } from '../../components/drawing';
import { feetAndInches } from '../../lib/elevation';
import type { ElevationLayout } from '../../lib/elevation';
import { cx } from '../../lib/interaction';
import styles from './Jobs.module.css';

/** Preview drawing frame, in SVG units. */
const VIEW_W = 400;
const VIEW_H = 190;
const LEFT = 30;
const RIGHT = 30;
const TOP = 12;
const FLOOR = 150;
/** Small jobs don't blow up past this many px per inch. */
const MAX_PX_PER_INCH = 2.6;

function floorHatch(y: number, from: number, to: number): string {
  let d = '';
  for (let x = from + 4; x < to; x += 9) d += `M${x} ${y + 1}l-6 7`;
  return d;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The sentence a screen reader gets for a job's elevation. */
export function elevationLabel(name: string, layout: ElevationLayout): string {
  if (layout.boxes.length === 0) return `${name} elevation: no cabinets yet.`;
  const kinds = [plural(layout.baseCount, 'base cabinet'), ...(layout.tallCount > 0 ? [plural(layout.tallCount, 'tall cabinet')] : []), plural(layout.wallCount, 'wall cabinet')];
  const listed = `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
  const parts = [`${name} elevation: ${listed}`];
  if (layout.baseRun !== null) parts.push(`base run ${feetAndInches(layout.baseRun)}`);
  let text = `${parts.join(', ')}.`;
  if (layout.invalidCount > 0) {
    text += ` ${layout.invalidCount === 1 ? '1 cabinet has errors and is' : `${layout.invalidCount} cabinets have errors and are`} drawn dashed.`;
  }
  if (layout.truncated) text += ' Not every box is drawn.';
  return text;
}

/**
 * Job preview elevation: wall cabinets hung over base cabinets (tall cabinets
 * fill both rows) on a hatched floor line, cabinet labels, and a blue base-run
 * dimension. True proportions (one scale for both axes), not to any drawing scale.
 */
export function JobElevation({ name, layout }: { name: string; layout: ElevationLayout }) {
  const inchesWide = layout.width / TICKS_PER_INCH;
  const inchesHigh = layout.height / TICKS_PER_INCH;
  const pxPerInch = Math.min(
    MAX_PX_PER_INCH,
    inchesWide > 0 ? (VIEW_W - LEFT - RIGHT) / inchesWide : MAX_PX_PER_INCH,
    inchesHigh > 0 ? (FLOOR - TOP) / inchesHigh : MAX_PX_PER_INCH,
  );
  const s = pxPerInch / TICKS_PER_INCH;
  const runY = FLOOR + 24;

  return (
    <svg className={styles.elevation} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={elevationLabel(name, layout)}>
      <line className={styles.floor} x1={12} x2={VIEW_W - 12} y1={FLOOR} y2={FLOOR} />
      <path className={styles.floorHatch} d={floorHatch(FLOOR, 12, VIEW_W - 12)} />
      {layout.boxes.map((box) => {
        const x = LEFT + box.x * s;
        const w = box.width * s;
        const h = box.height * s;
        const y = FLOOR - (box.bottom + box.height) * s;
        const showLabel = w >= 16 && h >= 12;
        return (
          <g key={box.key} data-invalid={box.invalid || undefined}>
            <rect className={cx(styles.box, box.invalid && styles.boxInvalid)} x={x} y={y} width={w} height={h} />
            {showLabel && (
              <text className={styles.boxLabel} x={x + w / 2} y={y + h / 2}>
                {box.label}
              </text>
            )}
          </g>
        );
      })}
      {layout.boxes.length === 0 && (
        <text className={styles.emptyDrawing} x={VIEW_W / 2} y={FLOOR / 2}>
          No cabinets yet
        </text>
      )}
      {layout.baseRun !== null && (
        <DimensionLine
          className={styles.runDim}
          x1={LEFT}
          x2={LEFT + layout.baseRun * s}
          y1={runY}
          y2={runY}
          extendFrom={FLOOR}
          gap={10}
          label={`BASE RUN ${feetAndInches(layout.baseRun)}`}
        />
      )}
    </svg>
  );
}

const STRIP_W = 120;
const STRIP_H = 34;

/** The register's 120 × 34 thumbnail of the same elevation. Decorative: the row says the count. */
export function ElevationStrip({ layout }: { layout: ElevationLayout }) {
  const floor = STRIP_H - 1;
  const s = Math.min(
    layout.width > 0 ? (STRIP_W - 2) / layout.width : 1,
    layout.height > 0 ? (floor - 1) / layout.height : 1,
  );
  return (
    <svg className={styles.strip} width={STRIP_W} height={STRIP_H} viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} aria-hidden="true">
      <line className={styles.stripFloor} x1={0} x2={STRIP_W} y1={floor} y2={floor} />
      {layout.boxes.map((box) => (
        <rect
          key={box.key}
          className={cx(styles.stripBox, box.invalid && styles.boxInvalid)}
          data-invalid={box.invalid || undefined}
          x={1 + box.x * s}
          y={floor - (box.bottom + box.height) * s}
          width={Math.max(1, box.width * s)}
          height={Math.max(1, box.height * s)}
        />
      ))}
    </svg>
  );
}
