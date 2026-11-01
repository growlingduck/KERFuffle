import { dependenciesFor, toInches } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, DependencyMap, FinishedEnds, Part, PartRole, Ticks, TraceKey } from '@kerfuffle/engine';
import { Centerline, DimensionLine, HatchDefs, SectionMark, useHatchIds } from '../../components/drawing';
import type { HatchIds } from '../../components/drawing';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { ENDS_TEXT } from '../../workspace/cabinets';
import type { Evaluation } from '../../workspace/calc';
import { hotPartOf, hoverKeyHandlers, hoverPartHandlers, requestFocus, setUi, togglePin, traceKeyOf, useUi } from '../../workspace/ui';
import styles from './Workspace.module.css';

/** Drawing frame in SVG units. Fixed, so the panel never changes height while typing. */
export const VIEW_W = 470;
export const VIEW_H = 330;
const OX = 64;
const OY = 40;
/** Gap between the elevation and the section, room for the height dimensions. */
const GAP = 120;
/** Most shelves drawn; past this the drawing would be all shelf. */
const MAX_DRAWN_SHELVES = 24;

type ShapeKind = 'face' | 'cut' | 'edge' | 'lam';

interface Shape {
  key: string;
  role: PartRole;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ghost {
  role: PartRole;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  labelY: number;
  dash: 'ref' | 'lam';
}

export interface DrawingLayout {
  /** SVG units per inch, the same for both views. */
  scale: number;
  shapes: Shape[];
  ghosts: Ghost[];
  base: boolean;
  /** Elevation box, countertop and toe kick edges, in SVG units. */
  ox: number;
  oy: number;
  ws: number;
  ds: number;
  sx: number;
  boxY: number;
  boxH: number;
  bot: number;
  sideW: number;
  /** Dimension values, already from the engine or the job's rules. */
  values: { w: Ticks; h: Ticks; d: Ticks; box: Ticks; toe: Ticks; ctop: Ticks };
  /** Toe-kick height in SVG units (0 on wall cabinets). */
  toeS: number;
}

/**
 * Lay the cabinet out from the engine's part sizes and the job's rules. Nothing
 * is re-derived: the shelf drawn is the engine's shelf length, the box height is
 * the engine's side length.
 */
export function layoutDrawing(evaluation: Evaluation, rules: ConstructionRules): DrawingLayout | null {
  const { spec, byRole: parts } = evaluation;
  const side = parts['side-left'];
  const back = parts.back;
  const top = parts.top;
  const bottom = parts.bottom;
  const front = parts.front;
  if (!evaluation.valid || !side || !back || !top || !bottom || !front) return null;

  const base = spec.type === 'base';
  const W = toInches(spec.width);
  const H = toInches(spec.height);
  const D = toInches(spec.depth);
  const s = Math.min(180 / W, 228 / H, 88 / D, 256 / (W + D));
  const inch = (value: Ticks) => toInches(value) * s;
  // Laminate has no thickness; every part drawn here is a panel.
  const thick = (part: Part) => inch(part.thickness ?? rules.panelThickness);

  const ws = W * s;
  const ds = D * s;
  const ctop = base ? inch(rules.countertopThickness) : 0;
  const toe = base ? inch(rules.toeKickHeight) : 0;
  const boxY = OY + ctop;
  const boxH = inch(side.length);
  const bot = OY + H * s;
  const sx = OX + ws + GAP;
  const ps = thick(side);
  const sideW = inch(side.width);

  const shapes: Shape[] = [];
  const add = (key: string, role: PartRole, kind: ShapeKind, x: number, y: number, w: number, h: number) => {
    if (parts[role]) shapes.push({ key, role, kind, x, y, w: Math.max(0.5, w), h: Math.max(0.5, h) });
  };

  // A: front elevation. The back shows through the opening.
  add('a-back', 'back', 'face', OX + ps, boxY + ps, inch(back.width) - 2 * ps, boxH - 2 * ps);
  add('a-side-left', 'side-left', 'edge', OX, boxY, ps, boxH);
  add('a-side-right', 'side-right', 'edge', OX + ws - ps, boxY, ps, boxH);
  add('a-top', 'top', 'edge', OX + (ws - inch(top.length)) / 2, boxY, inch(top.length), thick(top));
  add('a-bottom', 'bottom', 'edge', OX + (ws - inch(bottom.length)) / 2, boxY + boxH - thick(bottom), inch(bottom.length), thick(bottom));

  const shelf = parts.shelf;
  const shelfYs: number[] = [];
  if (shelf) {
    const n = Math.min(spec.shelfCount, MAX_DRAWN_SHELVES);
    const t = thick(shelf);
    for (let i = 1; i <= n; i++) {
      const yc = boxY + ps + ((boxH - 2 * ps) * i) / (n + 1);
      shelfYs.push(yc);
      add(`a-shelf-${i}`, 'shelf', 'edge', OX + (ws - inch(shelf.length)) / 2, yc - t / 2, inch(shelf.length), t);
    }
  }
  add('a-lam-left', 'laminate-side-left', 'lam', OX - 3.5, boxY, 3, boxH);
  add('a-lam-right', 'laminate-side-right', 'lam', OX + ws + 0.5, boxY, 3, boxH);

  // B: section, front at the left. Top, bottom, back and shelves are cut.
  add('b-side', 'side-right', 'face', sx, boxY, sideW, boxH);
  add('b-back', 'back', 'cut', sx + sideW, boxY + boxH - inch(back.length), thick(back), inch(back.length));
  add('b-top', 'top', 'cut', sx, boxY, inch(top.width), thick(top));
  add('b-bottom', 'bottom', 'cut', sx, boxY + boxH - thick(bottom), inch(bottom.width), thick(bottom));
  if (shelf) {
    const t = thick(shelf);
    // The setback is whatever the side is deeper than the shelf.
    const setback = sideW - inch(shelf.width);
    shelfYs.forEach((yc, i) => add(`b-shelf-${i}`, 'shelf', 'cut', sx + setback, yc - t / 2, inch(shelf.width), t));
  }

  const ghosts: Ghost[] = [];
  ghosts.push({ role: 'front', x: OX, y: boxY, w: inch(front.width), h: inch(front.length), label: 'FRONT REF', labelY: boxY + boxH - 5, dash: 'ref' });
  const over = displayInches(rules.laminateOversizePerEdge);
  const lamFront = parts['laminate-front'];
  if (lamFront) {
    const w = inch(lamFront.width);
    const h = inch(lamFront.length);
    const y = boxY + boxH / 2 - h / 2;
    ghosts.push({ role: 'laminate-front', x: OX + ws / 2 - w / 2, y, w, h, label: `FRONT LAM +${over} EACH EDGE`, labelY: y - 4, dash: 'lam' });
  }
  for (const role of ['laminate-side-left', 'laminate-side-right'] as const) {
    const lam = parts[role];
    if (!lam) continue;
    const w = inch(lam.width);
    const h = inch(lam.length);
    const y = boxY + boxH / 2 - h / 2;
    const left = role === 'laminate-side-left';
    ghosts.push({ role, x: sx + ds / 2 - w / 2, y, w, h, label: left ? 'LEFT END LAM' : 'RIGHT END LAM', labelY: left ? y - 4 : y + h + 11, dash: 'lam' });
  }

  return {
    scale: s,
    shapes,
    ghosts,
    base,
    ox: OX,
    oy: OY,
    ws,
    ds,
    sx,
    boxY,
    boxH,
    bot,
    sideW,
    toeS: toe,
    values: { w: spec.width, h: spec.height, d: spec.depth, box: side.length, toe: rules.toeKickHeight, ctop: rules.countertopThickness },
  };
}

/** `SCALE ≈ 1:n` at 96 px to the inch on screen. */
export function scaleText(layout: DrawingLayout | null): string {
  return layout ? `SCALE ≈ 1:${Math.round(96 / layout.scale)}` : 'NO DRAWING';
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The sentence a screen reader gets for the drawing. */
export function drawingLabel(label: string, type: CabinetType, ends: FinishedEnds, evaluation: Evaluation): string {
  const { spec } = evaluation;
  return (
    `${type === 'base' ? 'Base' : 'Wall'} cabinet ${label || 'without an ID'}, front elevation and section: ` +
    `${displayInches(spec.width)} wide, ${displayInches(spec.height)} high, ${displayInches(spec.depth)} deep, ` +
    `${plural(spec.shelfCount, 'shelf', 'shelves')}, ${ENDS_TEXT[ends].toLowerCase()}.`
  );
}

function depends(deps: DependencyMap | null, role: PartRole): boolean {
  return Boolean(deps?.[role]?.length);
}

function shapeFill(kind: ShapeKind, ids: HatchIds, hot: boolean): string | undefined {
  if (kind === 'face') return `url(#${ids.light})`;
  if (kind === 'cut') return `url(#${hot ? ids.sectionTraced : ids.section})`;
  return undefined;
}

/** Click a dimension: focus its field. Toe kick and countertop open the Construction rules. */
function dimensionClick(key: TraceKey) {
  return () => {
    if (key === 'toe' || key === 'ctop') setUi({ constructionOpen: true });
    else if (key === 'w') requestFocus('width');
    else if (key === 'd') requestFocus('depth');
    else requestFocus('height');
  };
}

export function CabinetDrawing({ evaluation, layout, label, type, ends }: { evaluation: Evaluation; layout: DrawingLayout; label: string; type: CabinetType; ends: FinishedEnds }) {
  const ids = useHatchIds();
  const trace = useUi(traceKeyOf);
  const hot = useUi(hotPartOf);
  const showDims = useUi((ui) => ui.showDims);
  const showOversize = useUi((ui) => ui.showOversize);
  const deps = trace ? dependenciesFor(trace, type) : null;
  const L = layout;
  const cx0 = L.ox + L.ws / 2;
  const right = L.ox + L.ws;

  const dimTraced = (key: TraceKey) => trace === key || (key === 'box' && trace === 'h') || (key === 'h' && trace === 'box');
  const dim = (key: TraceKey) => ({
    traced: dimTraced(key),
    faded: hot !== null,
    onClick: dimensionClick(key),
    ...hoverKeyHandlers(key),
  });

  const contextRect = (key: 'ctop' | 'toe', x: number, y: number, w: number, h: number) => (
    <rect
      key={`${key}-${x}`}
      className={cx(styles.ctx, key === 'toe' && styles.ctxDashed)}
      data-traced={trace === key || undefined}
      data-faded={hot !== null || undefined}
      x={x}
      y={y}
      width={Math.max(0.5, w)}
      height={Math.max(0.5, h)}
      onClick={dimensionClick(key)}
      {...hoverKeyHandlers(key)}
    />
  );

  const X1 = right + 22;
  const X2 = right + 92;
  const dy = L.bot + 24;

  return (
    <svg
      className={styles.drawing}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={drawingLabel(label, type, ends, evaluation)}
      data-hot={hot ?? undefined}
    >
      <HatchDefs ids={ids} />
      {L.base && (
        <>
          {contextRect('ctop', L.ox - 2, L.oy, L.ws + 4, L.boxY - L.oy)}
          {contextRect('toe', L.ox + 2, L.bot - L.toeS, L.ws - 4, L.toeS)}
          {contextRect('ctop', L.sx - 2, L.oy, L.ds + 2, L.boxY - L.oy)}
          {contextRect('toe', L.sx, L.bot - L.toeS, L.sideW, L.toeS)}
        </>
      )}

      {L.shapes.map((shape) => {
        const isHot = hot === shape.role;
        return (
          <rect
            key={shape.key}
            className={cx(styles.shape, styles[`shape_${shape.kind}`])}
            data-part={shape.role}
            data-hot={isHot || undefined}
            data-dep={(!hot && depends(deps, shape.role)) || undefined}
            data-faded={(hot !== null && !isHot) || undefined}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            fill={shapeFill(shape.kind, ids, isHot)}
            onClick={() => togglePin(shape.role)}
            {...hoverPartHandlers(shape.role)}
          />
        );
      })}

      <Centerline x1={cx0} y1={L.oy - 22} x2={cx0} y2={L.bot + 10} className={styles.passive} />
      <SectionMark x={cx0 - 6} y={L.oy - 14} direction="right" letter="B" className={styles.passive} />

      {L.ghosts.map((g) => {
        const on = hot === g.role || (!hot && depends(deps, g.role));
        if (!on && !showOversize) return null;
        return (
          <g key={g.role} className={styles.ghost} data-on={on || undefined} data-ghost={g.role}>
            <rect className={g.dash === 'ref' ? styles.ghostRef : styles.ghostLam} x={g.x} y={g.y} width={g.w} height={g.h} />
            <text className={styles.ghostLabel} x={g.x + (g.dash === 'ref' ? 4 : 0)} y={g.labelY}>
              {g.label}
            </text>
          </g>
        );
      })}

      {showDims && (
        <g>
          <g data-dim="w">
            <DimensionLine x1={L.ox} y1={dy} x2={right} y2={dy} extendFrom={L.bot} label={displayInches(L.values.w)} {...dim('w')} />
          </g>
          <g data-dim="d">
            <DimensionLine x1={L.sx} y1={dy} x2={L.sx + L.ds} y2={dy} extendFrom={L.bot} label={displayInches(L.values.d)} {...dim('d')} />
          </g>
          {L.base ? (
            <>
              <g data-dim="ctop">
                <DimensionLine x1={X1} y1={L.oy} x2={X1} y2={L.boxY} extendFrom={right} label={displayInches(L.values.ctop)} {...dim('ctop')} />
              </g>
              <g data-dim="box">
                <DimensionLine x1={X1} y1={L.boxY} x2={X1} y2={L.boxY + L.boxH} extendFrom={right} label={displayInches(L.values.box)} {...dim('box')} />
              </g>
              <g data-dim="toe">
                <DimensionLine x1={X1} y1={L.boxY + L.boxH} x2={X1} y2={L.bot} extendFrom={right} label={displayInches(L.values.toe)} {...dim('toe')} />
              </g>
              <g data-dim="h">
                <DimensionLine x1={X2} y1={L.oy} x2={X2} y2={L.bot} extendFrom={X1} gap={6} label={displayInches(L.values.h)} {...dim('h')} />
              </g>
            </>
          ) : (
            <g data-dim="h">
              <DimensionLine x1={X1} y1={L.oy} x2={X1} y2={L.bot} extendFrom={right} label={displayInches(L.values.h)} {...dim('h')} />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
