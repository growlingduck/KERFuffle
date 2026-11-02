import { boxGeometry, toInches } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, DependencyMap, FinishedEnds, Part, PartRole, Ticks, TraceKey } from '@kerfuffle/engine';
import { Centerline, DimensionLine, HatchDefs, SectionMark, useHatchIds } from '../../components/drawing';
import type { HatchIds } from '../../components/drawing';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import type { CabinetBase } from '../../workspace/base';
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
  /** An outline that isn't a plain rectangle (a notched side). */
  d?: string;
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

/** Something drawn for context that isn't on the cut list: a leveling leg. */
interface Passive {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawingLayout {
  /** SVG units per inch, the same for both views. */
  scale: number;
  shapes: Shape[];
  ghosts: Ghost[];
  /** Leveling legs (method A2): bought, not cut. */
  legs: Passive[];
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
 * is re-derived: the shelf drawn is the engine's shelf length, the box height
 * and back position come from the engine's box calculator.
 *
 * The drawing follows the construction method: stretchers or a top, an applied
 * or inset back with its nailer, and under a base box either the ladder base
 * (A1: kick skin, rails, sleepers), legs and a clip-on kick board (A2), or
 * sides that run to the floor, notched, with a kick board between them (B).
 */
export function layoutDrawing(evaluation: Evaluation, rules: ConstructionRules, base: CabinetBase | null = null): DrawingLayout | null {
  const { spec } = evaluation;
  // The base parts a run shares draw under this cabinet like its own.
  const parts: Partial<Record<PartRole, Part>> = { ...evaluation.byRole };
  for (const part of base?.parts ?? []) parts[part.role] ??= part;
  const side = parts['side-left'];
  const back = parts.back;
  const bottom = parts.bottom;
  const front = parts.front;
  if (!evaluation.valid || !side || !back || !bottom || !front) return null;

  const g = boxGeometry(spec, rules);
  const m = rules.method;
  const isBase = spec.type === 'base';
  const W = toInches(spec.width);
  const H = toInches(spec.height);
  const D = toInches(spec.depth);
  const s = Math.min(180 / W, 228 / H, 88 / D, 256 / (W + D));
  const inch = (value: Ticks) => toInches(value) * s;
  // Laminate has no thickness; every part drawn here is a panel.
  const thick = (part: Part) => inch(part.thickness ?? rules.panelThickness);

  const ws = W * s;
  const ds = D * s;
  const ctop = isBase ? inch(rules.countertopThickness) : 0;
  const toe = isBase ? inch(rules.toeKickHeight) : 0;
  const kick = isBase ? inch(m.kickDepth) : 0;
  const boxY = OY + ctop;
  const boxH = inch(g.boxHeight);
  // Method B's sides run past the box to the floor.
  const sideH = inch(side.length);
  const bot = OY + H * s;
  const sx = OX + ws + GAP;
  const ps = thick(side);
  const sideW = inch(side.width);
  const interior = inch(g.interiorDepth);
  const notched = Boolean(side.features?.some((f) => f.kind === 'notch'));

  const shapes: Shape[] = [];
  const add = (key: string, role: PartRole, kind: ShapeKind, x: number, y: number, w: number, h: number, d?: string) => {
    if (parts[role]) shapes.push({ key, role, kind, x, y, w: Math.max(0.5, w), h: Math.max(0.5, h), ...(d ? { d } : {}) });
  };

  // A: front elevation. The back (and a nailer) show through the opening.
  add('a-back', 'back', 'face', OX + ps, boxY + ps, ws - 2 * ps, boxH - 2 * ps);
  const top = parts.top;
  const stretcher = parts['stretcher-front'];
  const lid = top ?? stretcher;
  const lidT = lid ? thick(lid) : ps;
  const nailer = parts.nailer;
  if (nailer) add('a-nailer', 'nailer', 'face', OX + ps, boxY + lidT, inch(nailer.length), inch(nailer.width));
  add('a-side-left', 'side-left', 'edge', OX, boxY, ps, sideH);
  add('a-side-right', 'side-right', 'edge', OX + ws - ps, boxY, ps, sideH);
  if (top) add('a-top', 'top', 'edge', OX + (ws - inch(top.length)) / 2, boxY, inch(top.length), thick(top));
  if (stretcher) add('a-stretcher', 'stretcher-front', 'edge', OX + (ws - inch(stretcher.length)) / 2, boxY, inch(stretcher.length), thick(stretcher));
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
  // End laminate covers the side: the box, or to the floor with an integral kick.
  add('a-lam-left', 'laminate-side-left', 'lam', OX - 3.5, boxY, 3, sideH);
  add('a-lam-right', 'laminate-side-right', 'lam', OX + ws + 0.5, boxY, 3, sideH);

  // Under a base box, seen from the front: the kick skin (A1) or kick board (A2, B).
  const kickBoard = parts['kick-board'];
  if (kickBoard) {
    const x = OX + (ws - inch(kickBoard.length)) / 2;
    add('a-kick-board', 'kick-board', 'face', x, bot - toe, inch(kickBoard.length), toe);
  }
  if (parts['kick-skin']) add('a-kick-skin', 'kick-skin', 'face', OX, bot - toe, ws, toe);

  // B: section, front at the left. Top, bottom, back and shelves are cut.
  if (notched) {
    // Outline of a side notched at the front bottom for the toe kick.
    const yb = boxY + sideH;
    const d = `M${sx} ${boxY}H${sx + sideW}V${yb}H${sx + kick}V${yb - toe}H${sx}Z`;
    add('b-side', 'side-right', 'face', sx, boxY, sideW, sideH, d);
  } else {
    add('b-side', 'side-right', 'face', sx, boxY, sideW, sideH);
  }
  if (g.inset) {
    // In a groove in every member: centered on the box, its front face at the interior depth.
    const len = inch(back.length);
    add('b-back', 'back', 'cut', sx + interior, boxY + (boxH - len) / 2, thick(back), len);
  } else {
    add('b-back', 'back', 'cut', sx + sideW, boxY + boxH - inch(back.length), thick(back), inch(back.length));
  }
  if (top) add('b-top', 'top', 'cut', sx, boxY, inch(top.width), thick(top));
  if (stretcher) add('b-stretcher-front', 'stretcher-front', 'cut', sx, boxY, inch(stretcher.width), thick(stretcher));
  const rear = parts['stretcher-back'];
  if (rear) add('b-stretcher-back', 'stretcher-back', 'cut', sx + interior - inch(rear.width), boxY, inch(rear.width), thick(rear));
  if (nailer) add('b-nailer', 'nailer', 'cut', sx + interior - thick(nailer), boxY + lidT, thick(nailer), inch(nailer.width));
  add('b-bottom', 'bottom', 'cut', sx, boxY + boxH - thick(bottom), inch(bottom.width), thick(bottom));
  if (shelf) {
    const t = thick(shelf);
    shelfYs.forEach((yc, i) => add(`b-shelf-${i}`, 'shelf', 'cut', sx + inch(rules.shelfSetback), yc - t / 2, inch(shelf.width), t));
  }

  // Under a base box, in section: what the toe kick is made of.
  const legs: Passive[] = [];
  if (kickBoard) add('b-kick-board', 'kick-board', 'cut', sx + kick, bot - toe, thick(kickBoard), toe);
  if (kickBoard && m.id === 'A') {
    // A2: leveling legs carry the box; the kick board clips to the front pair.
    const legW = Math.max(2, inch(rules.panelThickness) * 1.4);
    for (const [key, x] of [
      ['leg-front', sx + kick + thick(kickBoard) + 2],
      ['leg-back', sx + sideW - legW - 2],
    ] as const) {
      legs.push({ key, x, y: bot - toe, w: legW, h: toe });
    }
  }
  const frontRail = parts['base-rail-front'];
  const sleeper = parts['base-sleeper'];
  if (frontRail) {
    const skin = parts['kick-skin'];
    if (skin) add('b-kick-skin', 'kick-skin', 'cut', sx + kick - thick(skin), bot - toe, thick(skin), toe);
    add('b-rail-front', 'base-rail-front', 'cut', sx + kick, bot - toe, thick(frontRail), toe);
    const sleeperX = sx + kick + thick(frontRail);
    const sleeperL = sleeper ? inch(sleeper.length) : 0;
    if (sleeper) add('b-sleeper', 'base-sleeper', 'face', sleeperX, bot - toe, sleeperL, toe);
    const backRail = parts['base-rail-back'];
    if (backRail) add('b-rail-back', 'base-rail-back', 'cut', sleeperX + sleeperL, bot - toe, thick(backRail), toe);
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
    const y = boxY + sideH / 2 - h / 2;
    const left = role === 'laminate-side-left';
    ghosts.push({ role, x: sx + ds / 2 - w / 2, y, w, h, label: left ? 'LEFT END LAM' : 'RIGHT END LAM', labelY: left ? y - 4 : y + h + 11, dash: 'lam' });
  }

  return {
    scale: s,
    shapes,
    ghosts,
    legs,
    base: isBase,
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
    values: { w: spec.width, h: spec.height, d: spec.depth, box: g.boxHeight, toe: rules.toeKickHeight, ctop: rules.countertopThickness },
  };
}

/** `SCALE ≈ 1:n` at 96 px to the inch on screen. */
export function scaleText(layout: DrawingLayout | null): string {
  return layout ? `SCALE ≈ 1:${Math.round(96 / layout.scale)}` : 'NO DRAWING';
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the drawing shows of the construction method, beyond a plain box. */
function methodSentence(type: CabinetType, rules: ConstructionRules): string {
  const m = rules.method;
  const out: string[] = [];
  if (m.backType !== 'applied') out.push(`The back is inset in a ${m.backType}, with a nailer under the top.`);
  if (type === 'wall') return out.map((s) => ` ${s}`).join('');
  if (m.baseTop === 'stretchers') out.push('Two stretchers close the top.');
  if (m.id === 'B') out.push('The sides run to the floor, notched for the toe kick, with a kick board between them.');
  else if (m.listBase && m.baseType === 'ladder') out.push('It stands on a ladder base: kick skin, rails and sleepers.');
  else if (m.listBase) out.push('It stands on leveling legs behind a clip-on kick board.');
  return out.map((s) => ` ${s}`).join('');
}

/** The sentence a screen reader gets for the drawing. */
export function drawingLabel(label: string, type: CabinetType, ends: FinishedEnds, evaluation: Evaluation, rules?: ConstructionRules): string {
  const { spec } = evaluation;
  const built = rules ? methodSentence(type, rules) : '';
  return (
    `${type === 'base' ? 'Base' : 'Wall'} cabinet ${label || 'without an ID'}, front elevation and section: ` +
    `${displayInches(spec.width)} wide, ${displayInches(spec.height)} high, ${displayInches(spec.depth)} deep, ` +
    `${plural(spec.shelfCount, 'shelf', 'shelves')}, ${ENDS_TEXT[ends].toLowerCase()}.${built}`
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

export interface CabinetDrawingProps {
  evaluation: Evaluation;
  layout: DrawingLayout;
  label: string;
  type: CabinetType;
  ends: FinishedEnds;
  rules: ConstructionRules;
  /** What the traced key moves, on this cabinet and its base. */
  deps: DependencyMap | null;
}

export function CabinetDrawing({ evaluation, layout, label, type, ends, rules, deps }: CabinetDrawingProps) {
  const ids = useHatchIds();
  const trace = useUi(traceKeyOf);
  const hot = useUi(hotPartOf);
  const showDims = useUi((ui) => ui.showDims);
  const showOversize = useUi((ui) => ui.showOversize);
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
      aria-label={drawingLabel(label, type, ends, evaluation, rules)}
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

      {L.legs.map((leg) => (
        <rect key={leg.key} className={cx(styles.leg, styles.passive)} data-leg x={leg.x} y={leg.y} width={leg.w} height={leg.h} />
      ))}

      {L.shapes.map((shape) => {
        const isHot = hot === shape.role;
        const common = {
          className: cx(styles.shape, styles[`shape_${shape.kind}`]),
          'data-part': shape.role,
          'data-hot': isHot || undefined,
          'data-dep': (!hot && depends(deps, shape.role)) || undefined,
          'data-faded': (hot !== null && !isHot) || undefined,
          fill: shapeFill(shape.kind, ids, isHot),
          onClick: () => togglePin(shape.role),
          ...hoverPartHandlers(shape.role),
        };
        return shape.d ? (
          <path key={shape.key} d={shape.d} {...common} />
        ) : (
          <rect key={shape.key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} {...common} />
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
