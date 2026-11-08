import { SLOT_INFO, ticks } from '@kerfuffle/engine';
import type { CutList, Estimate, EstimateLine, JobSlot } from '@kerfuffle/engine';
import { formatMoney, priceUnit, ROUGH_PRICE_NOTE } from '../data/materials';
import { displayInches } from '../lib/dimensions';
import { BOM, csvField } from './csv';
import { blockedText, optionsText } from './format';

/**
 * Words for the purchase estimate, shared by the screen, the printout and
 * the CSV so the three always say the same thing.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Box, back, shelves". */
export function slotsText(slots: readonly JobSlot[]): string {
  const names = slots.map((s) => SLOT_INFO[s].name.toLowerCase());
  const text = names.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What area-based sheet counts are: "area + 15% waste". */
export function basisText(estimate: Pick<Estimate, 'options'>): string {
  return `area + ${estimate.options.wastePercent}% waste`;
}

/** How the estimate's sheets were counted, for its heading: "from layout", "≈ area + 15% waste", or both. */
export function sheetsBasisText(estimate: Pick<Estimate, 'options' | 'lines'>): string {
  const sheets = estimate.lines.filter((l) => l.unit === 'sheet' && l.material !== null);
  const layout = sheets.filter((l) => l.basis === 'layout').length;
  if (layout > 0 && layout === sheets.length) return 'sheets from layout';
  if (layout > 0) return `sheets from layout, or ≈ ${basisText(estimate)} where there is none`;
  return `sheets ≈ ${basisText(estimate)}`;
}

/** A count with its unit: "7 sheets", "70 ft", "2 rolls", "18 each". */
export function countText(line: Pick<EstimateLine, 'unit'>, n: number): string {
  switch (line.unit) {
    case 'sheet':
      return plural(n, 'sheet');
    case 'foot':
      return `${n} ft`;
    case 'roll':
      return plural(n, 'roll');
    case 'each':
      return String(n);
    default:
      return `${n} ${line.unit}`;
  }
}

/** The Needed cell: "7 sheets" from a layout, "≈ 7 sheets" from area (marked as an estimate), "70 ft", "18". */
export function neededText(line: EstimateLine): string {
  if (line.needed === null) return '—';
  const count = countText(line, line.needed);
  return line.basis === 'area' ? `≈ ${count}` : count;
}

/** The line under Needed that says how it was counted. */
export function neededDetail(line: EstimateLine, estimate: Pick<Estimate, 'options'>): string | null {
  if (line.material === null) return 'Choose a material';
  if (line.basis === 'layout') return 'from layout';
  if (line.basis === 'area') {
    if (line.needed === null) return 'The sheet is too small once trimmed';
    return `${Math.round(line.partArea ?? 0).toLocaleString('en-US')} sq in · ${basisText(estimate)}`;
  }
  if (line.basis === 'length') {
    const edges = `${displayInches(ticks(Math.round((line.lengthInches ?? 0) * 64)))} of edges`;
    return line.unit === 'roll' && line.material.rollFeet ? `${edges} · ${line.material.rollFeet} ft rolls` : edges;
  }
  return null;
}

export function onHandText(line: EstimateLine): string {
  return line.onHand === null ? '—' : countText(line, line.onHand);
}

export function toBuyText(line: EstimateLine): string {
  return line.toBuy === null ? '—' : countText(line, line.toBuy);
}

/** "$68.00 per sheet", or "needs a price". */
export function priceText(line: EstimateLine): string {
  if (!line.material) return '—';
  if (line.price === null) return 'needs a price';
  return `${formatMoney(line.price)} ${priceUnit(line.material)}`;
}

export function costText(line: EstimateLine): string {
  return line.cost === null ? '—' : formatMoney(line.cost);
}

/** "$812.50", or why there's no total: "Incomplete: 2 materials need a price". */
export function totalText(estimate: Estimate): string {
  const { total } = estimate;
  if (total.cost !== null) return formatMoney(total.cost);
  const reasons: string[] = [];
  if (total.unpriced > 0) reasons.push(`${plural(total.unpriced, 'material')} ${total.unpriced === 1 ? 'needs' : 'need'} a price`);
  if (total.unassigned.length > 0) reasons.push(`choose a material for ${slotsText(total.unassigned).toLowerCase()}`);
  if (reasons.length === 0) reasons.push('a sheet is too small to count');
  return `Incomplete: ${reasons.join('; ')}`;
}

/** "Rough starting prices (Omaha, NE, Nov 2026) for MDF 3/4″ and HPL laminate 48 × 96: check them with your supplier." */
export function roughPricesText(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${ROUGH_PRICE_NOTE.replace('Rough starting price', 'Rough starting prices')} for ${list}: check them with your supplier.`;
}

/** Numbered notes printed on the estimate. `rough`: materials priced at a rough starting price. */
export function estimateNotes(estimate: Estimate, list: CutList, rough: readonly string[] = []): string[] {
  const trim = displayInches(estimate.options.edgeTrim);
  const sheets = estimate.lines.filter((l) => l.unit === 'sheet' && l.material !== null);
  const layout = sheets.filter((l) => l.basis === 'layout').length;
  const area = `part area ÷ the sheet less ${trim} trim each edge, plus ${estimate.options.wastePercent}% waste, rounded up`;
  const sheetNote =
    layout > 0 && layout === sheets.length
      ? 'Sheet counts are from the sheet layouts: exact for those layouts.'
      : layout > 0
        ? `Sheet counts marked “from layout” are exact for the sheet layout. The rest (≈) are estimates from area: ${area}.`
        : `Sheet counts are estimates from area: ${area}. A sheet layout can need more or fewer.`;
  return [
    sheetNote,
    'Edge banding covers the exposed front edges of sides, top or front stretcher, bottom and shelves, rounded up to the foot.',
    'Hardware is the construction method’s own (leveling legs and kick clips). Hinges, slides, pulls, screws and glue are not included.',
    `Material cost to buy only: no markup, labor or tax. Prices are the job’s copies. Parts as on the cut list: ${optionsText(list.options).split(' · ')[1]}.`,
    ...(rough.length > 0 ? [roughPricesText(rough)!] : []),
  ];
}

export interface EstimateCsvMeta {
  jobName: string;
  jobNumber: string;
  date: string;
  revision: number;
  construction?: string;
  /** "prices as of 2026-11-02". */
  pricesAsOf?: string | null;
  /** Materials priced at a rough starting price. */
  rough?: readonly string[];
}

export const ESTIMATE_CSV_COLUMNS = [
  'Material',
  'Kind',
  'Used for',
  'Needed',
  'Unit',
  'Counted from',
  'On hand',
  'To buy',
  'Price (each unit)',
  'Cost',
] as const;

const KIND_WORDS = { sheet: 'sheet goods', laminate: 'laminate', banding: 'edge banding', hardware: 'hardware' } as const;
const BASIS_WORDS = { layout: 'sheet layout', area: 'area (approximate)', length: 'edge length', count: 'count' } as const;
const money = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));
const count = (n: number | null) => (n === null ? '' : String(n));

/**
 * The estimate as CSV, in the cut-list CSV's format: a comment row saying
 * which job and when, a header row, one row per material, then the total.
 * Prices are plain decimal dollars so Excel adds them up.
 */
export function estimateCsv(estimate: Estimate, list: CutList, meta: EstimateCsvMeta): string {
  const about = [
    `# KERFuffle estimate: ${meta.jobName}`,
    meta.jobNumber,
    meta.construction,
    `Rev. ${meta.revision}`,
    `printed ${meta.date}`,
    meta.pricesAsOf ? `prices as of ${meta.pricesAsOf}` : null,
    roughPricesText(meta.rough ?? []),
    sheetsBasisText(estimate),
    blockedText(list.blocked),
  ]
    .filter(Boolean)
    .join(' · ');
  const rows = estimate.lines.map((line) =>
    [
      line.material?.name ?? `(no material) ${slotsText(line.slots)}`,
      KIND_WORDS[line.kind],
      slotsText(line.slots),
      count(line.needed),
      line.unit,
      BASIS_WORDS[line.basis],
      count(line.onHand),
      count(line.toBuy),
      line.material && line.price === null ? 'needs a price' : money(line.price),
      money(line.cost),
    ]
      .map(csvField)
      .join(','),
  );
  const total = ['Total', '', '', '', '', '', '', '', '', estimate.total.cost === null ? totalText(estimate) : money(estimate.total.cost)]
    .map(csvField)
    .join(',');
  return BOM + [csvField(about), ESTIMATE_CSV_COLUMNS.map(csvField).join(','), ...rows, total].join('\r\n') + '\r\n';
}
