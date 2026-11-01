import { TICKS_PER_INCH } from '@kerfuffle/engine';
import type { CutList, CutListLine, Ticks } from '@kerfuffle/engine';
import { displayInches } from '../lib/dimensions';
import { blockedText, lineName, optionsText, refsText } from './format';

export interface CsvMeta {
  jobName: string;
  /** J-0014 */
  jobNumber: string;
  /** 2026-10-31 */
  date: string;
  revision: number;
}

export const CSV_COLUMNS = [
  'Mark',
  'Part',
  'Category',
  'Length (in)',
  'Width (in)',
  'Thickness (in)',
  'Length (decimal in)',
  'Width (decimal in)',
  'Thickness (decimal in)',
  'Quantity',
  'Cabinets',
] as const;

/** Byte-order mark: without it Excel reads UTF-8 as the local code page and mangles ″ and ×. */
export const BOM = '﻿';

/**
 * Exact decimal inches. Every 1/64″ is a finite binary fraction, so the
 * number prints exactly (1/64 = 0.015625) and sorts as a number in Excel.
 */
export function decimalInches(value: Ticks): string {
  return String(value / TICKS_PER_INCH);
}

function field(value: string | number): string {
  let text = String(value);
  // A cell starting with = + - @ is run as a formula by Excel; a label like "=B1" must stay text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(line: CutListLine, cabinets: string): string {
  const t = line.thickness;
  return [
    line.mark,
    lineName(line),
    line.category,
    // As on screen, with the ″ mark; it also stops Excel turning 3/4 into a date.
    displayInches(line.length),
    displayInches(line.width),
    t === null ? '' : displayInches(t),
    decimalInches(line.length),
    decimalInches(line.width),
    t === null ? '' : decimalInches(t),
    line.quantity,
    cabinets,
  ]
    .map(field)
    .join(',');
}

/**
 * The cut list as CSV, one row per line of the current mode, with a comment row
 * that says which job, when and with which options. CRLF line ends and a BOM,
 * so Excel opens it with the right characters.
 */
export function cutListCsv(list: CutList, meta: CsvMeta): string {
  const about = [
    `# KERFuffle cut list: ${meta.jobName}`,
    meta.jobNumber,
    `Rev. ${meta.revision}`,
    `printed ${meta.date}`,
    optionsText(list.options),
    blockedText(list.blocked),
  ]
    .filter(Boolean)
    .join(' · ');
  const rows =
    list.options.mode === 'merged'
      ? list.groups.flatMap((g) => g.lines.map((line) => row(line, refsText(line.refs))))
      : list.sections.flatMap((s) => s.lines.map((line) => row(line, s.cabinet.id)));
  return BOM + [field(about), CSV_COLUMNS.map(field).join(','), ...rows].join('\r\n') + '\r\n';
}
