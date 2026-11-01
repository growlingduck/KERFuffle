import { inches, toInches } from '@kerfuffle/engine';
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
    </svg>
  );
}
