import { PART_ORDER, calculateParts } from './calculate';
import type { CabinetSpec, ConstructionRules, Part, PartCategory, PartRole, ValidationIssue } from './types';
import type { Ticks } from './units';
import { hasErrors } from './validate';

/**
 * The job cut list: every cabinet's parts, merged into distinct cuts, grouped
 * and marked. Pure and deterministic; the screen, the printout and the CSV all
 * read the same CutList.
 */

export type CutListMode = 'merged' | 'by-cabinet';
export type CutListSortKey = 'name' | 'length' | 'width' | 'quantity';
export type SortDirection = 'asc' | 'desc';

export interface CutListOptions {
  mode: CutListMode;
  /** False drops parts with `optional: true` (the Front reference size). */
  includeFronts: boolean;
  /** Display order inside each merged group. By-cabinet lines keep part order. */
  sort: { key: CutListSortKey; dir: SortDirection };
}

export const DEFAULT_CUT_LIST_OPTIONS: Readonly<CutListOptions> = Object.freeze({
  mode: 'merged',
  includeFronts: true,
  sort: Object.freeze({ key: 'length', dir: 'desc' }),
});

/**
 * Which way the grain runs in the cabinet. Length is always with the grain, so
 * this says how the piece stands: up and down, or side to side. `mixed` only
 * happens if two differently oriented parts share one size.
 */
export type Grain = 'vertical' | 'horizontal' | 'mixed';

const VERTICAL_ROLES: ReadonlySet<PartRole> = new Set([
  'back',
  'side-left',
  'side-right',
  'front',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
]);

export function grainOf(role: PartRole): Exclude<Grain, 'mixed'> {
  return VERTICAL_ROLES.has(role) ? 'vertical' : 'horizontal';
}

/** How many pieces of a line come from one cabinet. */
export interface CutListRef {
  cabinetId: string;
  quantity: number;
}

export interface CutListLine {
  /** Identity of the cut: category, length, width and thickness. */
  key: string;
  /** P1…, L1…: stable across sorting, modes and the fronts switch. */
  mark: string;
  category: PartCategory;
  /** Distinct part names in part order, e.g. ["Bottom", "Top"]. */
  names: string[];
  /** The names joined: "Bottom / Top". */
  name: string;
  roles: PartRole[];
  length: Ticks;
  width: Ticks;
  /** Null for laminate. */
  thickness: Ticks | null;
  quantity: number;
  /** Per-cabinet counts, in cabinet order. */
  refs: CutListRef[];
  /** Every part on the line is optional (a Front reference size). */
  optional: boolean;
  grain: Grain;
}

export interface CutListGroup {
  /** "panel:48" (3/4″) or "laminate". */
  id: string;
  category: PartCategory;
  /** Panel thickness; null for laminate. */
  thickness: Ticks | null;
  lines: CutListLine[];
  pieces: number;
}

export interface CutListSection {
  /** Position in the job's cabinet list (labels can repeat). */
  index: number;
  cabinet: CabinetSpec;
  /** One line per part, in part order, carrying the job-wide marks. */
  lines: CutListLine[];
  pieces: number;
}

export interface BlockedCabinet {
  index: number;
  cabinetId: string;
  issues: ValidationIssue[];
}

export interface CutListTotals {
  /** Boxes to build: the quantities of the listed cabinets added up. */
  boxes: number;
  panelPieces: number;
  laminatePieces: number;
  /** Merged lines. */
  distinctCuts: number;
}

export interface CutList {
  options: CutListOptions;
  /** Merged mode: panels by thickness (thinnest first), then laminate. Empty in by-cabinet mode. */
  groups: CutListGroup[];
  /** By-cabinet mode: one section per listed cabinet. Empty in merged mode. */
  sections: CutListSection[];
  /** Every merged line, in mark order. Filled in both modes. */
  lines: CutListLine[];
  /** Cabinets left out because they have validation errors. */
  blocked: BlockedCabinet[];
  totals: CutListTotals;
}

function cutKey(part: Pick<Part, 'category' | 'length' | 'width' | 'thickness'>): string {
  return `${part.category}|${part.thickness ?? '-'}|${part.length}|${part.width}`;
}

const ROLE_RANK: ReadonlyMap<PartRole, number> = new Map(PART_ORDER.map((role, i) => [role, i]));
const CATEGORY_RANK: Readonly<Record<PartCategory, number>> = { panel: 0, laminate: 1 };

/** Canonical order, which assigns marks: category, thickness, length desc, width desc. */
function canonical(a: CutListLine, b: CutListLine): number {
  return (
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
    (a.thickness ?? 0) - (b.thickness ?? 0) ||
    b.length - a.length ||
    b.width - a.width
  );
}

interface Accumulator {
  line: Omit<CutListLine, 'mark' | 'name' | 'grain' | 'optional'>;
  grains: Set<Exclude<Grain, 'mixed'>>;
  /** Each name's place in part order, so "Bottom" comes before "Top". */
  nameRank: Map<string, number>;
  optional: boolean;
}

/** Merge parts into lines in first-seen order. */
function merge(parts: readonly Part[]): CutListLine[] {
  const byKey = new Map<string, Accumulator>();
  for (const part of parts) {
    const key = cutKey(part);
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        line: {
          key,
          category: part.category,
          names: [],
          roles: [],
          length: part.length,
          width: part.width,
          thickness: part.thickness,
          quantity: 0,
          refs: [],
        },
        grains: new Set(),
        nameRank: new Map(),
        optional: true,
      };
      byKey.set(key, acc);
    }
    const { line } = acc;
    line.quantity += part.quantity;
    if (!line.roles.includes(part.role)) line.roles.push(part.role);
    if (!line.names.includes(part.name)) line.names.push(part.name);
    const rank = ROLE_RANK.get(part.role) ?? 0;
    acc.nameRank.set(part.name, Math.min(rank, acc.nameRank.get(part.name) ?? rank));
    const ref = line.refs.find((r) => r.cabinetId === part.cabinetId);
    if (ref) ref.quantity += part.quantity;
    else line.refs.push({ cabinetId: part.cabinetId, quantity: part.quantity });
    acc.grains.add(grainOf(part.role));
    acc.optional &&= part.optional;
  }

  return [...byKey.values()].map(({ line, grains, nameRank, optional }) => {
    // Names follow part order (Bottom before Top), not the order cabinets met them.
    const names = [...line.names].sort((a, b) => (nameRank.get(a) ?? 0) - (nameRank.get(b) ?? 0));
    const roles = [...line.roles].sort((a, b) => (ROLE_RANK.get(a) ?? 0) - (ROLE_RANK.get(b) ?? 0));
    const grain: Grain = grains.size === 1 ? [...grains][0]! : 'mixed';
    return { ...line, names, roles, name: names.join(' / '), mark: '', grain, optional };
  });
}

function compareBy(key: CutListSortKey): (a: CutListLine, b: CutListLine) => number {
  switch (key) {
    case 'name':
      return (a, b) => a.name.localeCompare(b.name, 'en');
    case 'length':
      return (a, b) => a.length - b.length;
    case 'width':
      return (a, b) => a.width - b.width;
    case 'quantity':
      return (a, b) => a.quantity - b.quantity;
  }
}

/** Display order: the chosen column, ties broken by mark order so it is always the same. */
export function sortLines(lines: readonly CutListLine[], sort: CutListOptions['sort']): CutListLine[] {
  const by = compareBy(sort.key);
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...lines].sort((a, b) => sign * by(a, b) || canonical(a, b));
}

function pieces(lines: readonly CutListLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Build the job's cut list.
 *
 * - Cabinets with validation errors are left out and reported in `blocked`.
 * - Identical cuts (category + length + width + thickness) merge into one line.
 * - Marks are numbered in canonical order over every part, fronts included, so
 *   they stay put when the list is re-sorted, switched to by-cabinet, or the
 *   fronts are hidden.
 */
export function buildCutList(
  cabinets: readonly CabinetSpec[],
  rules: ConstructionRules,
  options: CutListOptions = DEFAULT_CUT_LIST_OPTIONS,
): CutList {
  const blocked: BlockedCabinet[] = [];
  const listed: { index: number; cabinet: CabinetSpec; parts: Part[] }[] = [];
  cabinets.forEach((cabinet, index) => {
    const result = calculateParts(cabinet, rules);
    if (hasErrors(result.issues)) blocked.push({ index, cabinetId: cabinet.id, issues: result.issues });
    else listed.push({ index, cabinet, parts: result.parts });
  });

  const allParts = listed.flatMap((c) => c.parts);
  const marks = new Map<string, string>();
  const counters: Record<PartCategory, number> = { panel: 0, laminate: 0 };
  for (const line of merge(allParts).sort(canonical)) {
    counters[line.category] += 1;
    marks.set(line.key, `${line.category === 'panel' ? 'P' : 'L'}${counters[line.category]}`);
  }
  const withMark = (line: CutListLine): CutListLine => ({ ...line, mark: marks.get(line.key) ?? '' });

  const keep = (part: Part) => options.includeFronts || !part.optional;
  const lines = merge(allParts.filter(keep)).map(withMark).sort(canonical);

  const groups: CutListGroup[] = [];
  const sections: CutListSection[] = [];
  if (options.mode === 'merged') {
    const thicknesses = [...new Set(lines.filter((l) => l.category === 'panel').map((l) => l.thickness ?? 0))].sort(
      (a, b) => a - b,
    );
    for (const thickness of thicknesses) {
      const groupLines = sortLines(
        lines.filter((l) => l.category === 'panel' && l.thickness === thickness),
        options.sort,
      );
      groups.push({ id: `panel:${thickness}`, category: 'panel', thickness: thickness as Ticks, lines: groupLines, pieces: pieces(groupLines) });
    }
    const laminate = sortLines(
      lines.filter((l) => l.category === 'laminate'),
      options.sort,
    );
    if (laminate.length > 0) {
      groups.push({ id: 'laminate', category: 'laminate', thickness: null, lines: laminate, pieces: pieces(laminate) });
    }
  } else {
    for (const { index, cabinet, parts } of listed) {
      // Each part keeps its own line (Left and Right side stay separate here).
      const sectionLines = parts
        .filter(keep)
        .map((part) => withMark(merge([part])[0]!));
      sections.push({ index, cabinet, lines: sectionLines, pieces: pieces(sectionLines) });
    }
  }

  const panelPieces = pieces(lines.filter((l) => l.category === 'panel'));
  const laminatePieces = pieces(lines.filter((l) => l.category === 'laminate'));
  return {
    options: { ...options, sort: { ...options.sort } },
    groups,
    sections,
    lines,
    blocked,
    totals: {
      boxes: listed.reduce((sum, c) => sum + c.cabinet.quantity, 0),
      panelPieces,
      laminatePieces,
      distinctCuts: lines.length,
    },
  };
}
