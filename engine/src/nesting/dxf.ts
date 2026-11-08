import type { PartFeature } from '../types';
import { TICKS_PER_INCH, type Ticks } from '../units';
import type { Piece, PlacedFeature, Placement, SheetPattern } from './types';

/**
 * DXF output: one sheet pattern as a drawing CAD and CAM software can open.
 * docs/plan-methods-optimizer-costing.md §4 and docs/cnc-output.md.
 *
 * It only reads a saved SheetPattern; it never lays anything out, so the file
 * always matches the printout.
 *
 * Format: ASCII DXF **R12** (AC1009). R12 is the version every reader handles:
 * LibreCAD, AutoCAD, browser viewers, laser and CNC CAM tools alike. R2000
 * would add object handles, owner pointers and an OBJECTS section that strict
 * readers reject when any one is off, and buys nothing for closed outlines and
 * text. Outlines are POLYLINE/VERTEX/SEQEND entities (R12 has no LWPOLYLINE).
 *
 * Coordinates: the drawing looks like the printout. DXF y runs up, so the
 * sheet's y (down the printed page) is flipped: a point (x, y) on the sheet is
 * (x, sheetWidth − y) in the file. The origin is the sheet corner at the
 * bottom left of the printed drawing. Units are inches or millimeters, set in
 * the header ($INSUNITS) and used for every number.
 */

export type DxfUnits = 'in' | 'mm';

export interface DxfOptions {
  units: DxfUnits;
  /** The full sheet, from the MaterialLayout. */
  sheetLength: Ticks;
  sheetWidth: Ticks;
  /** The material's pieces (MaterialLayout.pieces). With them, labels name the cabinet or run. */
  pieces?: readonly Piece[];
}

/** Layer names and their AutoCAD color numbers. */
export const DXF_LAYERS = {
  sheet: 'SHEET',
  outsideCut: 'OUTSIDE_CUT',
  label: 'LABEL',
} as const;

const COLORS: Readonly<Record<string, number>> = { SHEET: 8, OUTSIDE_CUT: 7, LABEL: 3, POCKET: 5, DRILL: 1 };

/** A point in the file's coordinates, in Ticks (x right, y up). */
export interface DxfPoint {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Numbers and names
// ---------------------------------------------------------------------------

/** Ticks per unit. 1 tick = 1/64″ = 0.396875 mm, so both convert exactly at 6 decimals. */
const PER_UNIT: Readonly<Record<DxfUnits, number>> = { in: TICKS_PER_INCH, mm: TICKS_PER_INCH / 25.4 };

function num(ticks: number, units: DxfUnits): string {
  const text = (ticks / PER_UNIT[units]).toFixed(6).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

/** "0_25IN", "6_35MM": R12 layer names allow only A–Z, 0–9, $, - and _. */
function sizeName(ticks: number, units: DxfUnits): string {
  return `${num(ticks, units).replace('.', '_')}${units.toUpperCase()}`;
}

/** The layer for a pocket (dado, rabbet) this deep. Reserved: no method makes pockets yet. */
export const pocketLayer = (depth: Ticks, units: DxfUnits) => `POCKET_${sizeName(depth, units)}`;
/** The layer for holes of this diameter. Reserved: no method makes holes yet. */
export const drillLayer = (diameter: Ticks, units: DxfUnits) => `DRILL_${sizeName(diameter, units)}`;

/** R12 text is 8-bit: anything outside printable ASCII goes as \U+XXXX, which readers turn back. */
function dxfText(text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    const code = ch.codePointAt(0)!;
    out += code >= 0x20 && code < 0x7f ? ch : code <= 0xffff ? `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}` : '?';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The four corners of a rectangle, counterclockwise from the bottom left. */
type Corner = 0 | 1 | 2 | 3;

/** Which corner of the piece a feature rectangle sits in (file coordinates), or null if none. */
function cornerOf(f: { x0: number; y0: number; x1: number; y1: number }, r: { x0: number; y0: number; x1: number; y1: number }): Corner | null {
  const left = f.x0 === r.x0;
  const right = f.x1 === r.x1;
  const bottom = f.y0 === r.y0;
  const top = f.y1 === r.y1;
  // A feature as wide as the piece touches both sides; take the side it doesn't fill.
  if (bottom && !top) return left ? 0 : right ? 1 : null;
  if (top && !bottom) return right ? 2 : left ? 3 : null;
  return null;
}

/** A sheet rectangle, flipped into file coordinates. */
function flip(r: { x: number; y: number; length: number; width: number }, sheetWidth: number) {
  return { x0: r.x, x1: r.x + r.length, y0: sheetWidth - (r.y + r.width), y1: sheetWidth - r.y };
}

/**
 * A piece's closed outline in file coordinates, counterclockwise, with each
 * corner notch cut in. Points are Ticks; the first point isn't repeated.
 */
export function partOutline(p: Placement, sheetWidth: Ticks): DxfPoint[] {
  const r = flip(p, sheetWidth);
  const corners: DxfPoint[] = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  const notches = new Map<Corner, { dx: number; dy: number }>();
  for (const f of p.features) {
    if (f.kind !== 'notch') continue;
    const fr = flip(f, sheetWidth);
    const at = cornerOf(fr, r);
    if (at !== null && !notches.has(at)) notches.set(at, { dx: fr.x1 - fr.x0, dy: fr.y1 - fr.y0 });
  }
  // Walking counterclockwise, a notched corner becomes three points: up or down
  // the edge we arrive on, across, then along the edge we leave on.
  const points: DxfPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const c = corners[i]!;
    const n = notches.get(i as Corner);
    if (!n) {
      points.push(c);
      continue;
    }
    const sx = i === 0 || i === 3 ? 1 : -1; // into the piece along x
    const sy = i === 0 || i === 1 ? 1 : -1; // into the piece along y
    const inX = { x: c.x + sx * n.dx, y: c.y };
    const inY = { x: c.x, y: c.y + sy * n.dy };
    const inner = { x: c.x + sx * n.dx, y: c.y + sy * n.dy };
    // Corners 0 and 2 are reached along a vertical edge; 1 and 3 along a horizontal one.
    points.push(...(i === 0 || i === 2 ? [inY, inner, inX] : [inX, inner, inY]));
  }
  return dedupe(points);
}

function dedupe(points: DxfPoint[]): DxfPoint[] {
  const out: DxfPoint[] = [];
  for (const pt of points) {
    const last = out.at(-1);
    if (!last || last.x !== pt.x || last.y !== pt.y) out.push(pt);
  }
  while (out.length > 1 && out[0]!.x === out.at(-1)!.x && out[0]!.y === out.at(-1)!.y) out.pop();
  return out;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

class Dxf {
  private readonly lines: string[] = [];
  constructor(readonly units: DxfUnits) {}

  pair(code: number, value: string | number): void {
    this.lines.push(String(code), String(value));
  }
  point(base: number, x: number, y: number): void {
    this.pair(base, num(x, this.units));
    this.pair(base + 10, num(y, this.units));
    this.pair(base + 20, '0');
  }
  polyline(layer: string, points: readonly DxfPoint[]): void {
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.point(10, 0, 0);
    this.pair(70, 1); // closed
    for (const pt of points) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.point(10, pt.x, pt.y);
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }
  rect(layer: string, x0: number, y0: number, x1: number, y1: number): void {
    this.polyline(layer, [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]);
  }
  /** Text centered on (cx, cy). The first point is a left-baseline guess for readers that ignore alignment. */
  text(layer: string, value: string, cx: number, cy: number, height: number, rotated: boolean): void {
    const half = (value.length * height * 0.6) / 2;
    const [x, y] = rotated ? [cx + height / 2, cy - half] : [cx - half, cy - height / 2];
    this.pair(0, 'TEXT');
    this.pair(8, layer);
    this.point(10, x, y);
    this.pair(40, num(height, this.units));
    this.pair(1, dxfText(value));
    if (rotated) this.pair(50, 90);
    this.pair(7, 'STANDARD');
    this.pair(72, 1); // center
    this.point(11, cx, cy);
    this.pair(73, 2); // middle
  }
  toString(): string {
    return this.lines.join('\r\n') + '\r\n';
  }
}

/** The text height for a piece's mark: about a sixth of its short side, 1/4″ to 1 1/2″, and short enough to fit along it. */
function markHeight(p: Placement, chars: number): number {
  const short = Math.min(p.length, p.width);
  const long = Math.max(p.length, p.width);
  const byShort = Math.min(Math.max(short / 6, TICKS_PER_INCH / 4), TICKS_PER_INCH * 1.5);
  return Math.min(byShort, (long * 0.8) / (Math.max(chars, 1) * 0.6), short / 2.5);
}

/** The cabinets or runs a placement is cut for, across every sheet of the pattern: "B1, B3 +2". */
function refsAt(pattern: SheetPattern, index: number, pieces: ReadonlyMap<string, Piece>): string {
  const refs: string[] = [];
  for (const sheet of pattern.sheets) {
    const piece = pieces.get(sheet.pieceIds[index] ?? '');
    if (piece && !refs.includes(piece.ref)) refs.push(piece.ref);
  }
  const shown = refs.slice(0, 3).join(', ');
  return refs.length > 3 ? `${shown} +${refs.length - 3}` : shown;
}

/**
 * The layer a feature is drawn on, or null when it's part of the outline.
 * Exhaustive, so a new feature kind has to pick one: a dado or rabbet goes on
 * pocketLayer(depth, units), a hole on drillLayer(diameter, units).
 */
function featureLayer(f: PartFeature): string | null {
  switch (f.kind) {
    case 'notch':
      return null; // cut into the outline
  }
}

/**
 * One sheet pattern as an R12 ASCII DXF, CRLF line ends.
 *
 * - `SHEET`: the full sheet and the trim line.
 * - `OUTSIDE_CUT`: every piece as a closed counterclockwise polyline, notches cut in.
 * - `POCKET_<depth>`, `DRILL_<dia>`: written only when a piece has such features (none yet).
 * - `LABEL`: each piece's mark, with its cabinet or run under it.
 */
export function layoutToDxf(pattern: SheetPattern, options: DxfOptions): string {
  const { units, sheetLength: L, sheetWidth: W } = options;
  const pieces = new Map((options.pieces ?? []).map((p) => [p.id, p]));
  const trim = pattern.cutTree;

  const featureLayers = new Set<string>();
  const extra: { layer: string; f: PlacedFeature }[] = [];
  for (const p of pattern.placements) {
    for (const f of p.features) {
      const layer = featureLayer(f.part);
      if (layer) {
        featureLayers.add(layer);
        extra.push({ layer, f });
      }
    }
  }
  const layers = [DXF_LAYERS.sheet, DXF_LAYERS.outsideCut, ...[...featureLayers].sort(), DXF_LAYERS.label];

  const d = new Dxf(units);
  // Header: version, units (1 inches, 4 millimeters), extents.
  d.pair(0, 'SECTION');
  d.pair(2, 'HEADER');
  d.pair(9, '$ACADVER');
  d.pair(1, 'AC1009');
  d.pair(9, '$INSBASE');
  d.point(10, 0, 0);
  d.pair(9, '$EXTMIN');
  d.point(10, 0, 0);
  d.pair(9, '$EXTMAX');
  d.point(10, L, W);
  d.pair(9, '$LIMMIN');
  d.pair(10, '0');
  d.pair(20, '0');
  d.pair(9, '$LIMMAX');
  d.pair(10, num(L, units));
  d.pair(20, num(W, units));
  d.pair(9, '$INSUNITS');
  d.pair(70, units === 'in' ? 1 : 4);
  d.pair(9, '$MEASUREMENT');
  d.pair(70, units === 'in' ? 0 : 1);
  d.pair(0, 'ENDSEC');

  // Tables: one line type, the layers, one text style.
  d.pair(0, 'SECTION');
  d.pair(2, 'TABLES');
  d.pair(0, 'TABLE');
  d.pair(2, 'LTYPE');
  d.pair(70, 1);
  d.pair(0, 'LTYPE');
  d.pair(2, 'CONTINUOUS');
  d.pair(70, 0);
  d.pair(3, 'Solid line');
  d.pair(72, 65);
  d.pair(73, 0);
  d.pair(40, '0.0');
  d.pair(0, 'ENDTAB');
  d.pair(0, 'TABLE');
  d.pair(2, 'LAYER');
  d.pair(70, layers.length);
  for (const name of layers) {
    d.pair(0, 'LAYER');
    d.pair(2, name);
    d.pair(70, 0);
    d.pair(62, COLORS[name] ?? COLORS[name.split('_')[0]!] ?? 7);
    d.pair(6, 'CONTINUOUS');
  }
  d.pair(0, 'ENDTAB');
  d.pair(0, 'TABLE');
  d.pair(2, 'STYLE');
  d.pair(70, 1);
  d.pair(0, 'STYLE');
  d.pair(2, 'STANDARD');
  d.pair(70, 0);
  d.pair(40, '0.0');
  d.pair(41, '1.0');
  d.pair(50, '0.0');
  d.pair(71, 0);
  d.pair(42, '0.2');
  d.pair(3, 'txt');
  d.pair(4, '');
  d.pair(0, 'ENDTAB');
  d.pair(0, 'ENDSEC');

  d.pair(0, 'SECTION');
  d.pair(2, 'BLOCKS');
  d.pair(0, 'ENDSEC');

  d.pair(0, 'SECTION');
  d.pair(2, 'ENTITIES');
  d.rect(DXF_LAYERS.sheet, 0, 0, L, W);
  const t = flip(trim, W);
  d.rect(DXF_LAYERS.sheet, t.x0, t.y0, t.x1, t.y1);
  for (const p of pattern.placements) d.polyline(DXF_LAYERS.outsideCut, partOutline(p, W));
  for (const { layer, f } of extra) {
    const r = flip(f, W);
    d.rect(layer, r.x0, r.y0, r.x1, r.y1);
  }
  pattern.placements.forEach((p, i) => {
    const r = flip(p, W);
    const rotated = p.width > p.length;
    const ref = refsAt(pattern, i, pieces);
    const h = markHeight(p, Math.max(p.mark.length, ref.length * 0.6));
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    if (!ref) {
      d.text(DXF_LAYERS.label, p.mark, cx, cy, h, rotated);
      return;
    }
    // Mark above, cabinet or run below at 60 %; "above" turns with the text.
    const small = h * 0.6;
    const space = h * 0.3;
    const up = (k: number) => (rotated ? { x: cx - k, y: cy } : { x: cx, y: cy + k });
    const a = up((space + small) / 2);
    const b = up(-(h + space) / 2);
    d.text(DXF_LAYERS.label, p.mark, a.x, a.y, h, rotated);
    d.text(DXF_LAYERS.label, ref, b.x, b.y, small, rotated);
  });
  d.pair(0, 'ENDSEC');
  d.pair(0, 'EOF');
  return d.toString();
}
