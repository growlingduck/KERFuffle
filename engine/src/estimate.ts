import type { CutList, CutListLine } from './cutlist';
import { hardwareSlot, JOB_SLOTS, SLOT_INFO, type JobMaterials, type JobSlot, type Material, type MaterialKind } from './materials';
import { inches, TICKS_PER_INCH, type Ticks } from './units';

/**
 * The shop's purchase estimate: what the job's materials cost to buy. Sheets
 * are counted from area (prompt 13 replaces that with counts from the layout),
 * edge banding by the foot, and the method's hardware by the piece. Never
 * hinges, slides, pulls, screws or glue. No markup, labor or tax.
 * docs/plan-methods-optimizer-costing.md §3.3–3.4.
 *
 * Pure: money is whole cents, and every count is rounded up.
 */

export interface EstimateOptions {
  /** Added to the part area before counting sheets, in percent. Shop default 15. */
  wastePercent: number;
  /** Trimmed off each edge of every sheet before parts are counted against it. */
  edgeTrim: Ticks;
}

export const DEFAULT_ESTIMATE_OPTIONS: Readonly<EstimateOptions> = Object.freeze({
  wastePercent: 15,
  edgeTrim: inches(1 / 4),
});

/** How a line was counted: sheets from area, banding from length, hardware by count. */
export type EstimateBasis = 'area' | 'length' | 'count';

export interface EstimateLine {
  /** The material id, or "slot:box" for a slot with no material chosen. */
  key: string;
  /** Null: no material chosen for these slots, so nothing can be counted. */
  material: Material | null;
  /** The job slots this material fills, in slot order. */
  slots: JobSlot[];
  kind: MaterialKind;
  basis: EstimateBasis;
  /** "sheet", "foot", "roll", or the hardware's own unit ("each"). */
  unit: string;
  /** Null when there's no material, or the sheet has no usable area. */
  needed: number | null;
  onHand: number | null;
  /** Needed less on hand, never below zero. */
  toBuy: number | null;
  /** Cents per unit, as the job snapshotted it. */
  price: number | null;
  /** toBuy × price. Null when either is unknown. */
  cost: number | null;
  /** Area basis: square inches of parts, and of one sheet after edge trim. */
  partArea?: number;
  usableArea?: number;
  /** Length basis: the banding needed, exact, in inches. */
  lengthInches?: number;
  /** Marks of pieces too big for one usable sheet of this material. */
  oversize: string[];
}

export interface EstimateTotal {
  /** Cents. Null when any line has no price or no material: the total would be wrong. */
  cost: number | null;
  /** Materials in use that need a price. */
  unpriced: number;
  /** Slots with parts but no material chosen. */
  unassigned: JobSlot[];
}

export interface Estimate {
  options: EstimateOptions;
  lines: EstimateLine[];
  total: EstimateTotal;
}

const SQ = TICKS_PER_INCH * TICKS_PER_INCH;
const TICKS_PER_FOOT = 12 * TICKS_PER_INCH;
const slotRank = (slot: JobSlot) => JOB_SLOTS.indexOf(slot);

interface Tally {
  material: Material | null;
  slots: JobSlot[];
  kind: MaterialKind;
  /** Ticks² for sheets, ticks for banding, count for hardware. */
  amount: number;
  lines: CutListLine[];
}

/**
 * Estimate the job's purchase.
 *
 * - Sheet goods and laminate: part area ÷ usable sheet area (sheet less the
 *   edge trim all round) × (1 + waste %), rounded up to whole sheets.
 * - Edge banding: the banding the method declares on the listed lines, in
 *   feet, rounded up (and up to whole rolls when sold by the roll).
 * - Hardware: the method's count (method A2's legs and kick clips).
 *
 * Lines follow the cut list as shown: with fronts left out, they aren't counted.
 */
export function estimate(cutList: CutList, materials: JobMaterials, options: EstimateOptions = DEFAULT_ESTIMATE_OPTIONS): Estimate {
  const tallies = new Map<string, Tally>();
  // A line's parts share one material (or none), so its first slot decides.
  const add = (slots: readonly JobSlot[], kind: MaterialKind, amount: number, line?: CutListLine) => {
    const slot = slots[0]!;
    const material = materials[slot] ?? null;
    const key = material ? material.id : `slot:${slot}`;
    let tally = tallies.get(key);
    if (!tally) tallies.set(key, (tally = { material, slots: [], kind: material?.kind ?? kind, amount: 0, lines: [] }));
    for (const s of slots) if (!tally.slots.includes(s)) tally.slots.push(s);
    tally.amount += amount;
    if (line) tally.lines.push(line);
  };

  let banding = 0;
  for (const line of cutList.lines) {
    banding += line.banding;
    // Solid stock (a later face-frame method) is bought by the board, not counted here yet.
    if (line.category === 'lumber') continue;
    const slot = line.slots[0];
    if (!slot) continue;
    add(line.slots, SLOT_INFO[slot].kind, line.length * line.width * line.quantity, line);
  }
  if (banding > 0) add(['edge-banding'], 'banding', banding);
  for (const item of cutList.hardware) add([hardwareSlot(item.item)], 'hardware', item.quantity);

  const lines = [...tallies.entries()]
    .map(([key, tally]) => countLine(key, tally, options))
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || slotRank(a.slots[0]!) - slotRank(b.slots[0]!));

  const unpriced = lines.filter((l) => l.material !== null && l.material.price === null).length;
  const unassigned = lines.filter((l) => l.material === null).flatMap((l) => l.slots);
  const complete = lines.every((l) => l.cost !== null);
  return {
    options: { ...options },
    lines,
    total: { cost: complete ? lines.reduce((sum, l) => sum + (l.cost ?? 0), 0) : null, unpriced, unassigned },
  };
}

const KIND_ORDER: readonly MaterialKind[] = ['sheet', 'laminate', 'banding', 'hardware'];
const kindRank = (kind: MaterialKind) => KIND_ORDER.indexOf(kind);

function countLine(key: string, tally: Tally, options: EstimateOptions): EstimateLine {
  const { material, kind } = tally;
  const slots = [...tally.slots].sort((a, b) => slotRank(a) - slotRank(b));
  const base = { key, material, slots, kind, onHand: material?.onHand ?? null, price: material?.price ?? null, oversize: [] as string[] };
  const finish = (line: Omit<EstimateLine, 'toBuy' | 'cost'>): EstimateLine => {
    const toBuy = line.needed === null ? null : Math.max(0, line.needed - (line.onHand ?? 0));
    const cost = toBuy === null || line.price === null ? null : toBuy * line.price;
    return { ...line, toBuy, cost };
  };

  if (kind === 'sheet' || kind === 'laminate') {
    const partArea = tally.amount / SQ;
    if (!material || material.length === null || material.width === null) {
      return finish({ ...base, basis: 'area', unit: 'sheet', needed: null, partArea });
    }
    const trim = 2 * options.edgeTrim;
    const long = material.length - trim;
    const short = material.width - trim;
    const usable = Math.max(0, long) * Math.max(0, short);
    const oversize = tally.lines
      .filter((l) => {
        const [a, b] = l.length >= l.width ? [l.length, l.width] : [l.width, l.length];
        return a > Math.max(long, short) || b > Math.min(long, short);
      })
      .map((l) => l.mark);
    // Integer arithmetic: exact for whole-percent waste.
    const needed = usable <= 0 ? null : tally.amount === 0 ? 0 : Math.ceil((tally.amount * (100 + options.wastePercent)) / (usable * 100));
    return finish({ ...base, basis: 'area', unit: 'sheet', needed, partArea, usableArea: usable / SQ, oversize });
  }

  if (kind === 'banding') {
    const lengthInches = tally.amount / TICKS_PER_INCH;
    const feet = Math.ceil(tally.amount / TICKS_PER_FOOT);
    if (material?.rollFeet) {
      return finish({ ...base, basis: 'length', unit: 'roll', needed: Math.ceil(feet / material.rollFeet), lengthInches });
    }
    return finish({ ...base, basis: 'length', unit: 'foot', needed: material ? feet : null, lengthInches });
  }

  return finish({ ...base, basis: 'count', unit: material?.unit?.trim() || 'each', needed: material ? tally.amount : null });
}
