import { toInches } from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules } from '@kerfuffle/engine';
import styles from './Workspace.module.css';

const VIEW_W = 30;
const VIEW_H = 40;
const FLOOR = 38;
/** Most shelf lines drawn in a thumbnail; more would only be a smear. */
const MAX_SHELF_LINES = 6;

/**
 * The cabinet list's thumbnail: true proportions, shelves, dark bars for
 * finished ends, countertop and dashed toe kick on base cabinets. Invalid sizes
 * draw a red dashed "?". Decorative; the row's text says the same.
 */
export function MiniElevation({
  spec,
  rules,
  invalid,
  box = [24, 34],
}: {
  spec: Pick<CabinetSpec, 'type' | 'width' | 'height' | 'shelfCount' | 'finishedEnds'>;
  rules: Pick<ConstructionRules, 'toeKickHeight' | 'countertopThickness'>;
  invalid: boolean;
  box?: readonly [number, number];
}) {
  if (invalid || spec.width <= 0 || spec.height <= 0) {
    return (
      <svg className={styles.mini} width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
        <rect className={styles.miniBad} x={4} y={6} width={22} height={30} />
        <text className={styles.miniBadText} x={15} y={26}>
          ?
        </text>
      </svg>
    );
  }
  const W = toInches(spec.width);
  const H = toInches(spec.height);
  const m = Math.min(box[0] / W, box[1] / H);
  const w = W * m;
  const h = H * m;
  const x = (VIEW_W - w) / 2;
  const y = FLOOR - h;
  const base = spec.type === 'base';
  const topH = base ? Math.max(1.2, toInches(rules.countertopThickness) * m) : 0;
  const toeH = base ? toInches(rules.toeKickHeight) * m : 0;
  const boxY = y + topH;
  const boxH = Math.max(1, h - topH - toeH);
  const lines = Math.min(spec.shelfCount, MAX_SHELF_LINES);
  const left = spec.finishedEnds === 'left' || spec.finishedEnds === 'both';
  const right = spec.finishedEnds === 'right' || spec.finishedEnds === 'both';

  return (
    <svg className={styles.mini} width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
      {base && <rect className={styles.miniTop} x={x} y={y} width={w} height={topH} />}
      {base && <rect className={styles.miniToe} x={x + 1.5} y={y + h - toeH} width={Math.max(0, w - 3)} height={toeH} />}
      <rect className={styles.miniBox} x={x} y={boxY} width={w} height={boxH} />
      {Array.from({ length: lines }, (_, i) => {
        const sy = boxY + (boxH * (i + 1)) / (lines + 1);
        return <line key={i} className={styles.miniShelf} x1={x + 1.5} x2={x + w - 1.5} y1={sy} y2={sy} />;
      })}
      {left && <rect className={styles.miniEnd} x={x - 3} y={boxY} width={2.5} height={boxH} />}
      {right && <rect className={styles.miniEnd} x={x + w + 0.5} y={boxY} width={2.5} height={boxH} />}
    </svg>
  );
}
