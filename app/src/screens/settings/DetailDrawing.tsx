import { backThicknessOf, boxGeometry, inches, sleeperCount, toInches } from '@kerfuffle/engine';
import type { ConstructionRules, Ticks } from '@kerfuffle/engine';
import type { ReactNode } from 'react';
import { ChainDimension, DimensionLine, HatchDefs, HatchRect, useHatchIds } from '../../components/drawing';
import type { HatchIds } from '../../components/drawing';
import type { RoundTo } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import type { DetailKey } from './draft';
import { REFERENCE_CABINET, wideShelfPair } from './draft';
import styles from './Settings.module.css';

/**
 * Detail drawings A–F for the Settings screen, redrawn from the draft rules as
 * they're typed. Geometry is a picture, scaled and clamped so silly values
 * stay on the sheet; the numbers in the effect line come from the engine.
 */

export interface DetailInfo {
  letter: string;
  title: string;
  scale: string;
  text: string;
}

export const DETAILS: Readonly<Record<DetailKey, DetailInfo>> = {
  panel: {
    letter: 'A',
    title: 'Panel joint',
    scale: 'ENLARGED 0.94:1',
    text: 'Every box part is cut from this thickness. The bottom and top fit between the sides, so they lose two panel thicknesses.',
  },
  toeKick: {
    letter: 'B',
    title: 'Toe kick',
    scale: 'BASE CABINET, 34 1/2″ OVERALL · NTS',
    text: 'Base cabinets take the toe kick and countertop off the overall height to get the box height. Wall cabinets never use either.',
  },
  countertop: {
    letter: 'B',
    title: 'Countertop',
    scale: 'BASE CABINET, 34 1/2″ OVERALL · NTS',
    text: 'Base cabinets take the toe kick and countertop off the overall height to get the box height. Wall cabinets never use either.',
  },
  clearance: {
    letter: 'C',
    title: 'Shelf clearance',
    scale: 'ENLARGED 1.15:1',
    text: 'Shelves are cut short so they drop in without binding. The gap is left at each end, so the shelf loses twice this amount.',
  },
  setback: {
    letter: 'D',
    title: 'Shelf setback',
    scale: 'SECTION · ENLARGED 0.63:1',
    text: 'Shelves stop short of the front edge so doors close cleanly. Set it to 0 for full-depth shelves.',
  },
  laminate: {
    letter: 'E',
    title: 'Laminate oversize',
    scale: 'CORNER · NTS',
    text: 'Laminate is cut larger than the face it covers, past every edge, then trimmed flush after gluing.',
  },
  wide: {
    letter: 'F',
    title: 'Wide shelves',
    scale: 'TWO CABINETS COMPARED · NTS',
    text: 'Wider cabinets get thicker shelves so they don’t sag. The rule switches at the cabinet width shown.',
  },
  construction: {
    letter: 'G',
    title: 'Construction',
    scale: 'SECTION, FRONT AT LEFT · NTS',
    text: 'How a base cabinet meets the floor: on a ladder base, on leveling legs behind a kick board, or with sides that run to the floor, notched for the kick. New jobs start with this choice; each job can pick its own.',
  },
  back: {
    letter: 'H',
    title: 'Back',
    scale: 'PLAN AT THE BACK CORNER · ENLARGED',
    text: 'An applied back covers the box behind the sides. An inset back sits in a groove in the sides, top and bottom, and a nailer under the top takes the screws.',
  },
  top: {
    letter: 'I',
    title: 'Base cabinet top',
    scale: 'SECTION AT THE TOP, FRONT AT LEFT · NTS',
    text: 'A full top panel, or two stretchers (front and back) where the countertop covers the box. Wall cabinets always get a full top.',
  },
  kick: {
    letter: 'J',
    title: 'Toe kick',
    scale: 'SECTION, FRONT AT LEFT · NTS',
    text: 'The kick face sits back from the cabinet front by the kick depth: the ladder base’s rail and kick skin, the clip-on kick board, or the notch in the sides.',
  },
  base: {
    letter: 'K',
    title: 'Base',
    scale: 'PLAN FROM ABOVE · NTS',
    text: 'A ladder base runs under a whole run of cabinets, with sleepers close enough to carry them. Leveling legs go under each box, more under wide ones.',
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Drawing units for a size at `scale` px per inch, kept between lo and hi. */
const px = (v: Ticks, scale: number, lo: number, hi: number) => clamp(toInches(v) * scale, lo, hi);

function Note({ x, y, children, anchor = 'start' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' }) {
  return (
    <text className={styles.note} x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}

interface DrawProps {
  rules: ConstructionRules;
  ids: HatchIds;
  show: (v: Ticks) => string;
}

function PanelJoint({ rules, ids, show }: DrawProps) {
  const pw = px(rules.panelThickness, 90, 3, 110);
  return (
    <>
      <HatchRect ids={ids} x={70} y={40} width={pw} height={210} traced />
      <HatchRect ids={ids} x={70 + pw} y={250 - pw} width={250} height={pw} traced />
      <DimensionLine x1={70} y1={26} x2={70 + pw} y2={26} extendFrom={40} label={show(rules.panelThickness)} traced />
      <DimensionLine x1={346} y1={250 - pw} x2={346} y2={250} extendFrom={320} label={show(rules.panelThickness)} traced />
      <Note x={78 + pw} y={120}>
        SIDE
      </Note>
      <Note x={90 + pw} y={242 - pw}>
        BOTTOM (BETWEEN SIDES)
      </Note>
    </>
  );
}

function BaseChain({ rules, ids, show, hot }: DrawProps & { hot: 'toeKick' | 'countertop' }) {
  const overall = toInches(REFERENCE_CABINET.height);
  const s = 7;
  const top = 26;
  const floor = top + overall * s;
  const ct = clamp(toInches(rules.countertopThickness) * s, 0, overall * s * 0.45);
  const toe = clamp(toInches(rules.toeKickHeight) * s, 0, overall * s * 0.45);
  const x0 = 70;
  const w = 150;
  const box = REFERENCE_CABINET.height - rules.toeKickHeight - rules.countertopThickness;
  return (
    <>
      <rect className={hot === 'countertop' ? styles.hotFace : styles.mutedFace} x={x0 - 6} y={top} width={w + 10} height={Math.max(ct, 0.5)} />
      <HatchRect ids={ids} hatch="light" x={x0} y={top + ct} width={w} height={Math.max(0, floor - toe - top - ct)} />
      <rect className={hot === 'toeKick' ? styles.hotFace : styles.dashedFace} x={x0 + 18} y={floor - toe} width={w - 18} height={Math.max(toe, 0.5)} />
      <path className={styles.floor} d={`M30 ${floor}H370`} />
      <path className={styles.floorHatch} d={Array.from({ length: 33 }, (_, i) => `M${36 + i * 10} ${floor + 1}l-7 8`).join('')} />
      <ChainDimension
        orientation="vertical"
        at={x0 + w + 40}
        stops={[top, top + ct, floor - toe, floor]}
        extendFrom={x0 + w + 4}
        segments={[
          { id: 'ctop', label: show(rules.countertopThickness), traced: hot === 'countertop' },
          { id: 'box', label: box > 0 ? show(box as Ticks) : '—' },
          { id: 'toe', label: show(rules.toeKickHeight), traced: hot === 'toeKick' },
        ]}
        overall={{ at: x0 + w + 110, label: show(REFERENCE_CABINET.height) }}
      />
      <Note x={x0 + 8} y={top + ct + 18}>
        BASE BOX
      </Note>
      {toe > 12 && (
        <Note x={x0 + 26} y={floor - toe / 2 + 4}>
          TOE KICK
        </Note>
      )}
    </>
  );
}

function ShelfClearance({ rules, ids, show }: DrawProps) {
  const pw = px(rules.panelThickness, 110, 3, 90);
  const gap = px(rules.shelfClearancePerSide, 110, 0, 120);
  const st = px(rules.shelfThickness, 110, 3, 110);
  const shelfX = 40 + pw + gap;
  return (
    <>
      <HatchRect ids={ids} x={40} y={30} width={pw} height={240} />
      <rect className={styles.hotFace} x={shelfX} y={140} width={Math.max(10, 370 - shelfX)} height={st} />
      <DimensionLine x1={40 + pw} y1={112} x2={shelfX} y2={112} extendFrom={136} label={show(rules.shelfClearancePerSide)} traced />
      <Note x={46} y={290}>
        SIDE
      </Note>
      <Note x={shelfX + 14} y={140 + st + 22}>
        SHELF END
      </Note>
    </>
  );
}

function ShelfSetback({ rules, show }: DrawProps) {
  const front = 70;
  const sb = px(rules.shelfSetback, 60, 0, 200);
  const st = px(rules.shelfThickness, 60, 3, 80);
  return (
    <>
      <rect className={styles.sideFace} x={front} y={60} width={290} height={190} />
      <rect className={styles.hotFace} x={front + sb} y={140} width={Math.max(10, 290 - sb)} height={st} />
      <path className={styles.centerline} d={`M${front} 30V280`} />
      <DimensionLine x1={front} y1={118} x2={front + sb} y2={118} extendFrom={[30, 136]} label={show(rules.shelfSetback)} traced />
      <Note x={front - 30} y={24}>
        FRONT EDGE OF BOX
      </Note>
      <Note x={front + 120} y={82}>
        SIDE (SEEN FROM INSIDE)
      </Note>
      <Note x={front + sb + 10} y={140 + st + 20}>
        SHELF
      </Note>
    </>
  );
}

function LaminateCorner({ rules, show }: DrawProps) {
  const ox = 130;
  const oy = 90;
  const l = px(rules.laminateOversizePerEdge, 22, 0, 80);
  return (
    <>
      <rect className={styles.laminate} x={ox - l} y={oy - l} width={400 - ox + l + 10} height={300 - oy + l + 10} />
      <rect className={styles.face} x={ox} y={oy} width={400 - ox + 10} height={300 - oy + 10} />
      <DimensionLine x1={ox - l} y1={oy - l - 22} x2={ox} y2={oy - l - 22} extendFrom={[oy - l, oy]} label={show(rules.laminateOversizePerEdge)} traced />
      <DimensionLine x1={ox - l - 26} y1={oy - l} x2={ox - l - 26} y2={oy} extendFrom={[ox - l, ox]} label={show(rules.laminateOversizePerEdge)} traced />
      <Note x={ox + 16} y={oy + 30}>
        CABINET FACE
      </Note>
      <Note x={ox - l + 6} y={286}>
        LAMINATE, CUT OVERSIZE
      </Note>
    </>
  );
}

function WideShelves({ rules, ids, show }: DrawProps) {
  const [wide, narrow] = wideShelfPair(rules);
  const cabinets = [
    { x: 30, spec: narrow, thickness: rules.shelfThickness, hot: false },
    { x: 210, spec: wide, thickness: rules.wideShelfThickness, hot: true },
  ];
  return (
    <>
      {cabinets.map(({ x, spec, thickness, hot }) => {
        const w = clamp(toInches(spec.width) * 4.2, 40, 160);
        const th = px(thickness, 22, 3, 60);
        return (
          <g key={x}>
            <rect className={styles.face} x={x} y={70} width={w} height={150} />
            {hot ? (
              <rect className={styles.hotFace} x={x + 5} y={145 - th / 2} width={w - 10} height={th} />
            ) : (
              <HatchRect ids={ids} x={x + 5} y={145 - th / 2} width={w - 10} height={th} />
            )}
            <text className={hot ? styles.callHot : styles.call} x={x + w / 2} y={56} textAnchor="middle">
              {show(thickness)} SHELF
            </text>
            <DimensionLine x1={x} y1={244} x2={x + w} y2={244} extendFrom={222} label={show(spec.width)} traced={hot} />
          </g>
        );
      })}
    </>
  );
}

/** Section through the reference base cabinet built the default way, front at the left. */
function ConstructionSection({ rules, ids, show, hot }: DrawProps & { hot: 'construction' | 'kick' }) {
  const m = rules.method;
  const ref = REFERENCE_CABINET;
  const s = 6.4;
  const top = 30;
  const x0 = 96;
  const depth = toInches(ref.depth) * s;
  const floor = top + toInches(ref.height) * s;
  const ct = clamp(toInches(rules.countertopThickness) * s, 0, 60);
  const toe = clamp(toInches(rules.toeKickHeight) * s, 0, 80);
  const kd = clamp(toInches(m.kickDepth) * s, 0, depth - 20);
  const p = px(rules.panelThickness, s, 2, 12);
  const kickTop = floor - toe;
  const kickHot = hot === 'kick';
  const integral = m.id === 'B';
  return (
    <>
      <rect className={styles.mutedFace} x={x0 - 6} y={top} width={depth + 10} height={Math.max(ct, 0.5)} />
      {integral ? (
        <path className={styles.sideFace} d={`M${x0} ${top + ct}H${x0 + depth}V${floor}H${x0 + kd}V${kickTop}H${x0}Z`} />
      ) : (
        <HatchRect ids={ids} hatch="light" x={x0} y={top + ct} width={depth} height={Math.max(0, kickTop - top - ct)} />
      )}
      {/* The bottom, cut. */}
      <HatchRect ids={ids} x={x0} y={kickTop - p} width={depth - p} height={p} />
      {integral && <HatchRect ids={ids} x={x0 + kd} y={kickTop} width={p} height={toe} traced={kickHot} />}
      {!integral && m.baseType === 'legs' && (
        <>
          <HatchRect ids={ids} x={x0 + kd} y={kickTop} width={p} height={toe} traced={kickHot} />
          <path className={styles.leg} d={`M${x0 + kd + p + 12} ${kickTop}V${floor}M${x0 + depth - 14} ${kickTop}V${floor}`} />
        </>
      )}
      {!integral && m.baseType === 'ladder' && (
        <>
          <rect className={kickHot ? styles.hotFace : styles.skin} x={x0 + kd - 2.5} y={kickTop} width={2.5} height={toe} />
          <HatchRect ids={ids} x={x0 + kd} y={kickTop} width={p} height={toe} traced={kickHot} />
          <HatchRect ids={ids} hatch="light" x={x0 + kd + p} y={kickTop + 1} width={Math.max(0, depth - kd - 2 * p)} height={Math.max(0, toe - 2)} />
          <HatchRect ids={ids} x={x0 + depth - p} y={kickTop} width={p} height={toe} />
        </>
      )}
      <path className={styles.floor} d={`M30 ${floor}H370`} />
      <path className={styles.floorHatch} d={Array.from({ length: 33 }, (_, i) => `M${36 + i * 10} ${floor + 1}l-7 8`).join('')} />
      <DimensionLine x1={x0} y1={floor + 26} x2={x0 + kd} y2={floor + 26} extendFrom={floor} label={show(m.kickDepth)} traced={kickHot} />
      <DimensionLine x1={x0 - 26} y1={kickTop} x2={x0 - 26} y2={floor} extendFrom={x0} label={show(rules.toeKickHeight)} />
      <Note x={x0 + depth / 2} y={top + ct + 22} anchor="middle">
        {integral ? 'SIDE, TO THE FLOOR' : 'BASE BOX'}
      </Note>
      <Note x={x0 - 2} y={top - 8}>
        FRONT
      </Note>
    </>
  );
}

/** Plan at the back corner: the side, and an applied or inset back with its nailer. */
function BackCorner({ rules, ids, show }: DrawProps) {
  const m = rules.method;
  const s = 80;
  const x0 = 60;
  const rear = 252;
  const pw = px(rules.panelThickness, s, 4, 90);
  const tb = px(backThicknessOf(rules), s, 3, 90);
  const inset = m.backType !== 'applied';
  if (!inset) {
    return (
      <>
        <HatchRect ids={ids} x={x0} y={30} width={pw} height={rear - 30} />
        <HatchRect ids={ids} x={x0} y={rear} width={300} height={tb} traced />
        <DimensionLine x1={374} y1={rear} x2={374} y2={rear + tb} extendFrom={360} label={show(backThicknessOf(rules))} traced />
        <Note x={x0 + pw + 10} y={120}>
          SIDE
        </Note>
        <Note x={x0 + 120} y={rear - 10}>
          BACK, FULL WIDTH
        </Note>
      </>
    );
  }
  const g = px(m.backGrooveDepth, s, 2, pw - 2);
  const fromRear = m.backType === 'dado' ? px(m.backDadoInset, s, 0, 120) : 0;
  const yb1 = rear - fromRear;
  const yb0 = yb1 - tb;
  const sideIn = x0 + pw;
  const side = `M${x0} 30H${sideIn}V${yb0}H${sideIn - g}V${yb1}H${sideIn}V${rear}H${x0}Z`;
  return (
    <>
      <path className={styles.sideFace} d={side} />
      <rect className={styles.hotFace} x={sideIn - g} y={yb0} width={360 - sideIn + g} height={tb} />
      <rect className={styles.dashedFace} x={sideIn} y={yb0 - pw} width={360 - sideIn} height={pw} />
      <DimensionLine x1={sideIn - g} y1={22} x2={sideIn} y2={22} extendFrom={yb0} label={show(m.backGrooveDepth)} traced />
      <DimensionLine x1={374} y1={yb0} x2={374} y2={yb1} extendFrom={360} label={show(backThicknessOf(rules))} traced />
      {fromRear > 0 && <DimensionLine x1={x0 - 26} y1={yb1} x2={x0 - 26} y2={rear} extendFrom={x0} label={show(m.backDadoInset)} />}
      <Note x={x0 + pw + 10} y={110}>
        SIDE
      </Note>
      <Note x={sideIn + 40} y={yb0 - pw - 8}>
        NAILER, UNDER THE TOP
      </Note>
      <Note x={sideIn + 40} y={yb1 + 16}>
        {m.backType === 'dado' ? 'BACK IN A DADO' : 'BACK IN A RABBET'}
      </Note>
    </>
  );
}

/** Section at the top of a base box: a full top, or two stretchers. */
function TopSection({ rules, ids, show }: DrawProps) {
  const m = rules.method;
  const x0 = 50;
  const depth = 300;
  const s = depth / toInches(boxGeometry(REFERENCE_CABINET, rules).memberDepth || REFERENCE_CABINET.depth);
  const p = px(rules.panelThickness, s, 3, 30);
  const sw = clamp(toInches(m.stretcherWidth) * s, 4, depth / 2 - 4);
  const y = 110;
  return (
    <>
      <rect className={styles.sideFace} x={x0} y={y} width={depth} height={150} />
      {m.baseTop === 'full' ? (
        <HatchRect ids={ids} x={x0} y={y} width={depth} height={p} traced />
      ) : (
        <>
          <HatchRect ids={ids} x={x0} y={y} width={sw} height={p} traced />
          <HatchRect ids={ids} x={x0 + depth - sw} y={y} width={sw} height={p} traced />
          <DimensionLine x1={x0} y1={y - 26} x2={x0 + sw} y2={y - 26} extendFrom={y} label={show(m.stretcherWidth)} traced />
          <DimensionLine x1={x0 + depth - sw} y1={y - 26} x2={x0 + depth} y2={y - 26} extendFrom={y} label={show(m.stretcherWidth)} traced />
        </>
      )}
      <Note x={x0 + 8} y={y + 60}>
        SIDE (SEEN FROM INSIDE)
      </Note>
      <Note x={x0 + (m.baseTop === 'full' ? 8 : depth / 2 - 50)} y={y + p + 18}>
        {m.baseTop === 'full' ? 'FULL TOP' : 'OPEN BETWEEN'}
      </Note>
      <Note x={x0} y={y - 52}>
        FRONT
      </Note>
    </>
  );
}

/** Plan of the base: a ladder platform's sleepers, or legs under a box and a wide box. */
function BasePlan({ rules, show }: DrawProps) {
  const m = rules.method;
  if (m.id !== 'A') {
    return (
      <Note x={200} y={150} anchor="middle">
        THE SIDES CARRY THE BOX: NO SEPARATE BASE
      </Note>
    );
  }
  if (m.baseType === 'legs') {
    const boxes = [
      { x: 30, w: 130, legs: m.legsPerBox, label: show(m.legWidthThreshold) },
      { x: 200, w: 170, legs: m.legsPerWideBox, label: `over ${show(m.legWidthThreshold)}` },
    ];
    return (
      <>
        {boxes.map((b) => {
          const perSide = Math.max(1, Math.ceil(b.legs / 2));
          return (
            <g key={b.x}>
              <rect className={styles.face} x={b.x} y={90} width={b.w} height={110} />
              {Array.from({ length: b.legs }, (_, i) => {
                const row = i < perSide ? 0 : 1;
                const n = row === 0 ? perSide : b.legs - perSide;
                const k = row === 0 ? i : i - perSide;
                const cx0 = n === 1 ? b.x + b.w / 2 : b.x + 14 + ((b.w - 28) * k) / (n - 1);
                return <circle key={i} className={styles.legDot} cx={cx0} cy={row === 0 ? 108 : 182} r={6} />;
              })}
              <text className={styles.call} x={b.x + b.w / 2} y={74} textAnchor="middle">
                {b.legs} LEGS
              </text>
              <DimensionLine x1={b.x} y1={232} x2={b.x + b.w} y2={232} extendFrom={202} label={b.label} traced={b.x !== 30} />
            </g>
          );
        })}
      </>
    );
  }
  const length = m.platformLengthMax;
  const n = sleeperCount(length, rules);
  const x0 = 30;
  const w = 340;
  const p = 5;
  const gap = (w - p) / (n - 1);
  return (
    <>
      <rect className={styles.face} x={x0} y={110} width={w} height={p} />
      <rect className={styles.face} x={x0} y={200} width={w} height={p} />
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} className={i < 2 ? styles.hotFace : styles.face} x={x0 + i * gap} y={110 + p} width={p} height={200 - 110 - p} />
      ))}
      <DimensionLine x1={x0 + p / 2} y1={84} x2={x0 + gap + p / 2} y2={84} extendFrom={110} label={`≤ ${show(m.sleeperSpacingMax)}`} traced />
      <DimensionLine x1={x0} y1={236} x2={x0 + w} y2={236} extendFrom={205} label={show(length)} />
      <Note x={x0} y={98 - 26}>
        FRONT RAIL, SET BACK {show(m.kickDepth)}
      </Note>
      <Note x={x0} y={222}>
        BACK RAIL · {n} SLEEPERS
      </Note>
    </>
  );
}

export interface DetailDrawingProps {
  detail: DetailKey;
  rules: ConstructionRules;
  roundTo: RoundTo;
  /** The engine's effect line, for the drawing's accessible name. */
  effect: string | null;
}

/** The enlarged detail for one rule, drawn from the draft values. */
export function DetailDrawing({ detail, rules, roundTo, effect }: DetailDrawingProps) {
  const ids = useHatchIds();
  // Small allowances read best a step finer than the shop's rounding.
  const show = (v: Ticks) => displayInches(v, v < inches(1) && roundTo < 32 ? 32 : roundTo);
  const props = { rules, ids, show };
  const info = DETAILS[detail];
  return (
    <svg className={styles.detailSvg} viewBox="0 0 400 300" role="img" aria-label={`Detail ${info.letter}: ${info.title}. ${effect ?? ''}`.trim()}>
      <HatchDefs ids={ids} />
      {detail === 'panel' && <PanelJoint {...props} />}
      {(detail === 'toeKick' || detail === 'countertop') && <BaseChain {...props} hot={detail} />}
      {detail === 'clearance' && <ShelfClearance {...props} />}
      {detail === 'setback' && <ShelfSetback {...props} />}
      {detail === 'laminate' && <LaminateCorner {...props} />}
      {detail === 'wide' && <WideShelves {...props} />}
      {(detail === 'construction' || detail === 'kick') && <ConstructionSection {...props} hot={detail} />}
      {detail === 'back' && <BackCorner {...props} />}
      {detail === 'top' && <TopSection {...props} />}
      {detail === 'base' && <BasePlan {...props} />}
    </svg>
  );
}
