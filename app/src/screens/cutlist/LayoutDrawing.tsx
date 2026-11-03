import { memo } from 'react';
import type { MaterialLayout, Piece, Placement, SheetPattern, Ticks } from '@kerfuffle/engine';
import { stripsOf } from '../../cutlist/layoutText';
import { exactText } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import styles from './Layouts.module.css';

/** A piece pointed at: its cut-list line, and which of the line's pieces it is. */
export interface PointedPiece {
  lineKey: string;
  pieceId: string;
  ref: string;
}

export interface LayoutDrawingProps {
  layout: Pick<MaterialLayout, 'sheetLength' | 'sheetWidth' | 'pieces' | 'material'>;
  pattern: SheetPattern;
  trim: Ticks;
  /** The drawing's width in CSS pixels; it scales down to fit, never up. Text is sized for it. */
  widthPx: number;
  /** A sentence for screen readers: what the drawing shows. */
  label: string;
  hotLine?: string | null;
  pinnedLine?: string | null;
  onPoint?: (piece: PointedPiece | null) => void;
  onPin?: (lineKey: string) => void;
}

/** Room for the rip dimensions on the left (or top) and the overall sizes. */
const M = { side: 74, top: 30, end: 34, foot: 30 };
/** Marks are 12 px, or 9 px on a narrow strip, so every piece carries its mark where it can. */
const MARK_PX = 12;
const SMALL_MARK_PX = 9;
const SIZE_PX = 10;
const textWidth = (text: string, px: number) => text.length * px * 0.62;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Grain and hatching as plain lines clipped to their rectangle. (SVG pattern
 * fills look the same but make printing to PDF crawl: a 37-page job took
 * minutes instead of a second.)
 */
export function grainPath(x: number, y: number, w: number, h: number, gap = 4): string {
  let d = '';
  for (let yy = y + gap / 2; yy < y + h; yy += gap) d += `M${r1(x)} ${r1(yy)}H${r1(x + w)}`;
  return d;
}

/** 45° lines `gap` apart: rising ("/"), and with `cross` falling too ("\\"). */
export function hatchPath(x: number, y: number, w: number, h: number, gap: number, cross = false): string {
  const step = gap * Math.SQRT2;
  let d = '';
  // Rising lines: x + y = k.
  for (let k = x + y + step / 2; k < x + w + y + h; k += step) {
    const a = Math.max(x, k - (y + h));
    const b = Math.min(x + w, k - y);
    if (b > a) d += `M${r1(a)} ${r1(k - a)}L${r1(b)} ${r1(k - b)}`;
  }
  if (cross) {
    // Falling lines: x − y = k.
    for (let k = x - (y + h) + step / 2; k < x + w - y; k += step) {
      const a = Math.max(x, k + y);
      const b = Math.min(x + w, k + y + h);
      if (b > a) d += `M${r1(a)} ${r1(a - k)}L${r1(b)} ${r1(b - k)}`;
    }
  }
  return d;
}

/**
 * One sheet pattern drawn to scale: the sheet and its trim, each piece with
 * its mark (and size where it fits), grain lines on grained pieces, offcuts
 * hatched (wide for keepable, close for waste), and the strips dimensioned
 * in cut order. Black on white only, so it prints as drawn.
 */
export const LayoutDrawing = memo(function LayoutDrawing({ layout, pattern, trim, widthPx, label, hotLine, pinnedLine, onPoint, onPin }: LayoutDrawingProps) {
  const L = layout.sheetLength;
  const W = layout.sheetWidth;
  const strips = stripsOf(pattern);
  const ripsAlongTop = strips[0]?.axis === 'x';
  const left = ripsAlongTop ? 34 : M.side;
  const top = ripsAlongTop ? M.top + 14 : 12;
  const s = (widthPx - left - M.end) / L;
  const heightPx = Math.ceil(top + W * s + M.foot);
  const px = (x: number) => left + x * s;
  const py = (y: number) => top + y * s;
  const pieces = new Map<string, Piece>(layout.pieces.map((p) => [p.id, p]));
  const ids = pattern.sheets[0]?.pieceIds ?? [];
  const grained = layout.material.grain !== 'none';

  const pieceLabel = (p: Placement, w: number, h: number) => {
    const size = `${exactText(p.partLength)} × ${exactText(p.partWidth)}`;
    const fits = (px: number) => w >= textWidth(p.mark, px) + 4 && h >= px + 2;
    const markPx = fits(MARK_PX) ? MARK_PX : fits(SMALL_MARK_PX) ? SMALL_MARK_PX : 0;
    const showMark = markPx > 0;
    const showSize = markPx === MARK_PX && w >= textWidth(size, SIZE_PX) + 6 && h >= MARK_PX + SIZE_PX + 8;
    return { size, showMark, showSize, markPx };
  };

  return (
    <svg
      className={styles.drawing}
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      role="img"
      aria-label={label}
      data-pattern={pattern.id}
    >
      {/* The full sheet, and the trimmed sheet inside it. */}
      <rect x={px(0)} y={py(0)} width={L * s} height={W * s} className={styles.sheet} />
      <rect x={px(trim)} y={py(trim)} width={(L - 2 * trim) * s} height={(W - 2 * trim) * s} className={styles.trimLine} />

      {pattern.offcuts.map((o, i) => {
        const w = o.length * s;
        const h = o.width * s;
        const text = `${exactText(o.length)} × ${exactText(o.width)}`;
        const room = w >= textWidth(text, SIZE_PX) + 8 && h >= SIZE_PX + 6;
        return (
          <g key={`o${i}`} data-offcut={o.keepable ? 'keep' : 'waste'}>
            {/* Keepable: wide single hatch. Waste: close cross-hatch. */}
            <path d={hatchPath(px(o.x), py(o.y), w, h, o.keepable ? 9 : 4, !o.keepable)} className={styles.hatchLine} />
            <rect x={px(o.x)} y={py(o.y)} width={w} height={h} className={styles.offcut} />
            {o.keepable && room && (
              <text x={px(o.x) + w / 2} y={py(o.y) + h / 2} className={styles.offcutText} dominantBaseline="central" textAnchor="middle">
                {text}
              </text>
            )}
          </g>
        );
      })}

      {pattern.placements.map((p, i) => {
        const w = p.length * s;
        const h = p.width * s;
        const x = px(p.x);
        const y = py(p.y);
        const id = ids[i] ?? p.mark;
        const piece = pieces.get(id);
        const hot = hotLine === p.lineKey;
        const pinned = pinnedLine === p.lineKey;
        const { size, showMark, showSize, markPx } = pieceLabel(p, w, h);
        const cy = y + h / 2 - (showSize ? SIZE_PX / 2 + 1 : 0);
        return (
          <g
            key={`p${i}`}
            className={cx(styles.piece, hot && styles.pieceHot, !hot && pinned && styles.piecePinned)}
            data-line={p.lineKey}
            data-mark={p.mark}
            data-hot={hot || undefined}
            onPointerEnter={() => onPoint?.({ lineKey: p.lineKey, pieceId: id, ref: piece?.ref ?? '' })}
            onPointerLeave={() => onPoint?.(null)}
            onClick={() => onPin?.(p.lineKey)}
          >
            <rect x={x} y={y} width={w} height={h} className={styles.pieceRect} />
            {/* Grain runs along the sheet's length: fine lines along x. */}
            {grained && p.grainLocked && <path d={grainPath(x, y, w, h)} className={styles.grainLine} data-grain />}
            {p.features.map((f, k) => (
              <rect key={k} x={px(f.x)} y={py(f.y)} width={f.length * s} height={f.width * s} className={styles.feature} />
            ))}
            {showMark && (
              <>
                <rect
                  x={x + w / 2 - textWidth(p.mark, markPx) / 2 - 2}
                  y={cy - markPx / 2 - 1}
                  width={textWidth(p.mark, markPx) + 4}
                  height={markPx + 2}
                  className={styles.labelGround}
                />
                <text x={x + w / 2} y={cy} className={styles.mark} style={{ fontSize: markPx }} dominantBaseline="central" textAnchor="middle">
                  {p.mark}
                </text>
              </>
            )}
            {showSize && (
              <text x={x + w / 2} y={cy + MARK_PX / 2 + SIZE_PX / 2 + 3} className={styles.size} dominantBaseline="central" textAnchor="middle">
                {size}
              </text>
            )}
            <title>{`${id}${piece ? ` · ${piece.name} · for ${piece.ref}` : ''} · ${size}${p.rotated ? ' · turned' : ''}`}</title>
          </g>
        );
      })}

      {/* The strips, dimensioned in cut order. */}
      {strips.map((strip) => {
        const a = strip.from * s;
        const b = (strip.from + strip.size) * s;
        const value = exactText(strip.size);
        if (strip.axis === 'y') {
          const lx = left - 12;
          const mid = top + (a + b) / 2;
          const room = b - a >= 11;
          return (
            <g key={`r${strip.n}`} className={styles.dim} data-rip={strip.n}>
              <line x1={lx} y1={top + a} x2={lx} y2={top + b} />
              <line x1={lx - 4} y1={top + a + 4} x2={lx + 4} y2={top + a - 4} />
              <line x1={lx - 4} y1={top + b + 4} x2={lx + 4} y2={top + b - 4} />
              <line x1={lx + 2} y1={top + a} x2={left - 2} y2={top + a} className={styles.ext} />
              <line x1={lx + 2} y1={top + b} x2={left - 2} y2={top + b} className={styles.ext} />
              {room && (
                <text x={lx - 6} y={mid} className={styles.dimText} dominantBaseline="central" textAnchor="end">
                  <tspan className={styles.ripNo}>{strip.n}·</tspan> {value}
                </text>
              )}
            </g>
          );
        }
        const ly = top - 12;
        const room = b - a >= textWidth(value, SIZE_PX) + 18;
        return (
          <g key={`r${strip.n}`} className={styles.dim} data-rip={strip.n}>
            <line x1={left + a} y1={ly} x2={left + b} y2={ly} />
            <line x1={left + a - 4} y1={ly + 4} x2={left + a + 4} y2={ly - 4} />
            <line x1={left + b - 4} y1={ly + 4} x2={left + b + 4} y2={ly - 4} />
            <line x1={left + a} y1={ly + 2} x2={left + a} y2={top - 2} className={styles.ext} />
            <line x1={left + b} y1={ly + 2} x2={left + b} y2={top - 2} className={styles.ext} />
            {room && (
              <text x={left + (a + b) / 2} y={ly - 6} className={styles.dimText} textAnchor="middle">
                <tspan className={styles.ripNo}>{strip.n}·</tspan> {value}
              </text>
            )}
          </g>
        );
      })}

      {/* Overall sizes: length along the foot, width up the far side. */}
      <g className={styles.dim}>
        <line x1={px(0)} y1={py(W) + 16} x2={px(L)} y2={py(W) + 16} />
        <line x1={px(0) - 4} y1={py(W) + 20} x2={px(0) + 4} y2={py(W) + 12} />
        <line x1={px(L) - 4} y1={py(W) + 20} x2={px(L) + 4} y2={py(W) + 12} />
        <text x={(px(0) + px(L)) / 2} y={py(W) + 12} className={styles.dimText} textAnchor="middle">
          {exactText(L)}
        </text>
        <line x1={px(L) + 16} y1={py(0)} x2={px(L) + 16} y2={py(W)} />
        <line x1={px(L) + 12} y1={py(0) + 4} x2={px(L) + 20} y2={py(0) - 4} />
        <line x1={px(L) + 12} y1={py(W) + 4} x2={px(L) + 20} y2={py(W) - 4} />
        <text
          x={px(L) + 26}
          y={(py(0) + py(W)) / 2}
          className={styles.dimText}
          textAnchor="middle"
          transform={`rotate(90 ${px(L) + 26} ${(py(0) + py(W)) / 2})`}
        >
          {exactText(W)}
        </text>
      </g>
    </svg>
  );
});
