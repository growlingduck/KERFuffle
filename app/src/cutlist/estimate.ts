import { SLOT_INFO, ticks } from '@kerfuffle/engine';
import type { CutList, Estimate, EstimateLine, JobSlot } from '@kerfuffle/engine';
import { formatMoney, priceUnit } from '../data/materials';
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

/** The Needed cell: "≈ 7 sheets" (area counts are marked as estimates), "70 ft", "18". */
export function neededText(line: EstimateLine): string {
  if (line.needed === null) return '—';
  const count = countText(line, line.needed);
  return line.basis === 'area' ? `≈ ${count}` : count;
}

/** The line under Needed that says how it was counted. */
export function neededDetail(line: EstimateLine, estimate: Pick<Estimate, 'options'>): string | null {
  if (line.material === null) return 'Choose a material';
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

/** Numbered notes printed on the estimate. */
export function estimateNotes(estimate: Estimate, list: CutList): string[] {
  const trim = displayInches(estimate.options.edgeTrim);
  return [
    `Sheet counts are estimates from area: part area ÷ the sheet less ${trim} trim each edge, plus ${estimate.options.wastePercent}% waste, rounded up. A sheet layout can need more or fewer.`,
    'Edge banding covers the exposed front edges of sides, top or front stretcher, bottom and shelves, rounded up to the foot.',
    'Hardware is the construction method’s own (leveling legs and kick clips). Hinges, slides, pulls, screws and glue are not included.',
    `Material cost to buy only: no markup, labor or tax. Prices are the job’s copies. Parts as on the cut list: ${optionsText(list.options).split(' · ')[1]}.`,
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
const BASIS_WORDS = { area: 'area (approximate)', length: 'edge length', count: 'count' } as const;
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
    `sheets ≈ ${basisText(estimate)}`,
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
