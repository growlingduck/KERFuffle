import { formatDimension, PART_NAMES } from '@kerfuffle/engine';
import type { BlockedCabinet, ConstructionRules, CutListGroup, CutListLine, CutListOptions, CutListRef, Grain } from '@kerfuffle/engine';
import { displayInches, INCH } from '../lib/dimensions';

/**
 * Text for the cut list, shared by the screen, the printout and the CSV so the
 * three always say the same thing.
 */

/**
 * The name on a cut-list row. Laminate rows drop "Laminate, " (the group
 * heading says it) and the Front drops "(door/laminate size)" (general note 4
 * says it), so rows stay on one line. A cutout follows in brackets:
 * "Left side / Right side (notched 4 × 3)".
 */
export function lineName(line: Pick<CutListLine, 'category' | 'names' | 'note'>): string {
  const short = (name: string) =>
    name === PART_NAMES.front
      ? 'Front'
      : line.category === 'laminate'
        ? name.replace(/^Laminate, /, '').replace(/^./, (c) => c.toUpperCase())
        : name;
  const names = line.names.map(short).join(' / ');
  return line.note ? `${names} (${line.note})` : names;
}

/** "B1", "B3×2". */
export function refText(ref: CutListRef): string {
  return ref.quantity > 1 ? `${ref.cabinetId}×${ref.quantity}` : ref.cabinetId;
}

export function refsText(refs: readonly CutListRef[]): string {
  return refs.map(refText).join(', ');
}

export const GRAIN_WORDS: Readonly<Record<Grain, string>> = {
  vertical: 'grain up and down',
  horizontal: 'grain side to side',
  mixed: 'grain both ways',
};

/** Thickness for a cell: laminate has none. */
export function thicknessText(thickness: CutListLine['thickness']): string {
  return thickness === null ? 'lam.' : displayInches(thickness);
}

/** The options in words: "Identical parts merged · fronts left out · inches". */
export function optionsText(options: Pick<CutListOptions, 'mode' | 'includeFronts'>): string {
  return [
    options.mode === 'merged' ? 'Identical parts merged' : 'Listed by cabinet',
    options.includeFronts ? 'fronts included' : 'fronts left out',
    'inches',
  ].join(' · ');
}

/** "Excludes B3: needs a fix" (one or more cabinets). */
export function blockedText(blocked: readonly BlockedCabinet[]): string | null {
  if (blocked.length === 0) return null;
  const ids = blocked.map((b) => b.cabinetId.trim() || `cabinet ${b.index + 1}`);
  return `Excludes ${ids.join(', ')}: ${blocked.length === 1 ? 'needs a fix' : 'need a fix'}`;
}

export function groupTitle(group: CutListGroup, rules: ConstructionRules): string {
  if (group.category === 'panel') return `Panels · ${displayInches(group.thickness ?? rules.panelThickness)} thick`;
  if (group.category === 'lumber') return `Solid stock · ${displayInches(group.thickness ?? rules.panelThickness)} thick`;
  return `Laminate · ${displayInches(rules.laminateOversizePerEdge)} oversize each edge`;
}

/** Numbered general notes, printed on the last sheet. Built from the job's own rules. */
export function generalNotes(rules: ConstructionRules): string[] {
  const exact = (t: Parameters<typeof displayInches>[0]) => formatDimension(t, { inchMark: false }).text + INCH;
  return [
    `All dimensions in inches, to the nearest 1/16${INCH}. ≈ marks a rounded size.`,
    // U+FE0E asks for the plain text arrow, not a colour emoji.
    'Length runs with the grain: ↕︎ up and down in the cabinet, ↔︎ side to side.',
    `Laminate is cut ${exact(rules.laminateOversizePerEdge)} oversize past every edge. Trim after gluing.`,
    'Front = door / front-laminate reference size, not a box part.',
    `Shelves are ${exact(rules.wideShelfThickness)} thick in cabinets ${exact(rules.shelfThickWidthThreshold)} wide ${
      rules.shelfThickComparison === 'gte' ? 'or more' : 'and over'
    }.`,
  ];
}

/** Unambiguous local date: 2026-10-31. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Kitchen remodel – cut list.pdf", safe as a Windows file name. */
export function exportFileName(jobName: string, extension: 'pdf' | 'csv'): string {
  const safe = jobName
    // Characters Windows forbids in names, and control characters.
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\p{Cc}/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return `${safe || 'Job'} – cut list.${extension}`;
}

export type PageSizeName = 'letter' | 'a4';

export interface PageSize {
  name: PageSizeName;
  label: string;
  /** For the CSS @page rule and the PDF settings. */
  widthIn: number;
  heightIn: number;
}

/** US Letter portrait. A4 is ready here but not offered in Settings yet (docs/pending-checks.md). */
export const PAGE_SIZES: Readonly<Record<PageSizeName, PageSize>> = {
  letter: { name: 'letter', label: 'US Letter', widthIn: 8.5, heightIn: 11 },
  a4: { name: 'a4', label: 'A4', widthIn: 210 / 25.4, heightIn: 297 / 25.4 },
};
