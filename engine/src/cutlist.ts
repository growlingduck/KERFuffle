import { calculateParts, listedJobParts } from './calculate';
import type { JobIssue, ListedCabinet } from './methods';
import { roleRank } from './parts';
import type { CabinetSpec, ConstructionRules, Part, PartCategory, PartFeature, PartRole, ValidationIssue } from './types';
import { formatDimension, type Ticks } from './units';
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
  /** Identity of the cut: category, length, width, thickness and features. */
  key: string;
  /** P1…, S1… (solid stock), L1…: stable across sorting, modes and the fronts switch. */
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
  /** Cutouts on every piece of the line (method B's kick notch). Absent when none. */
  features?: PartFeature[];
  /** The features in words, for the line: "notched 4 × 3". Absent when none. */
  note?: string;
}

export interface CutListGroup {
  /** "panel:48" (3/4″), "lumber:48", or "laminate". */
  id: string;
  category: PartCategory;
  /** Panel or lumber thickness; null for laminate. */
  thickness: Ticks | null;
  lines: CutListLine[];
  pieces: number;
}

export interface CutListSection {
  /** Position in the job's cabinet list (labels can repeat). */
  index: number;
  cabinet: CabinetSpec;
  /**
   * One line per part, in part order, carrying the job-wide marks. A base
   * cabinet's own platform (method A1, no run) is listed here too.
   */
  lines: CutListLine[];
  pieces: number;
}

/** By-cabinet mode: the parts a run of cabinets shares. */
export interface CutListRunSection {
  run: string;
  /** "Run: Sink wall", as on the parts' refs. */
  ref: string;
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
  /** Solid-stock pieces; present only when there are some. */
  lumberPieces?: number;
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
  /** By-cabinet mode: one section per run with shared parts, after the cabinets. Empty in merged mode. */
  runSections: CutListRunSection[];
  /** Every merged line, in mark order. Filled in both modes. */
  lines: CutListLine[];
  /** Cabinets left out because they have validation errors. */
  blocked: BlockedCabinet[];
  /** Problems with runs and platforms (method A1). An error leaves that base off. */
  jobIssues: JobIssue[];
  totals: CutListTotals;
}

function featuresKey(features: readonly PartFeature[] | undefined): string {
  if (!features || features.length === 0) return '';
  return features
    .map((f) => `${f.kind}:${f.corner}:${f.length}x${f.width}`)
    .sort()
    .join(',');
}

/** Parts with different features are different cuts, so they never merge. */
function cutKey(part: Pick<Part, 'category' | 'length' | 'width' | 'thickness' | 'features'>): string {
  const base = `${part.category}|${part.thickness ?? '-'}|${part.length}|${part.width}`;
  const features = featuresKey(part.features);
  return features === '' ? base : `${base}|${features}`;
}

/** "notched 4 × 3": length × width of each cutout. */
export function featureNote(features: readonly PartFeature[]): string {
  const show = (value: Ticks) => formatDimension(value, { inchMark: false }).text;
  return features.map((f) => `notched ${show(f.length)} × ${show(f.width)}`).join(', ');
}

const CATEGORY_RANK: Readonly<Record<PartCategory, number>> = { panel: 0, lumber: 1, laminate: 2 };
const MARK_PREFIX: Readonly<Record<PartCategory, string>> = { panel: 'P', lumber: 'S', laminate: 'L' };

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
          ...(part.features && part.features.length > 0 ? { features: part.features, note: featureNote(part.features) } : {}),
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
    const rank = roleRank(part.role);
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
    const roles = [...line.roles].sort((a, b) => roleRank(a) - roleRank(b));
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

  // Parts the cabinets share (a run's ladder base) come after the cabinets' own.
  const shared = listedJobParts(
    listed.map(({ index, cabinet }): ListedCabinet => ({ index, cabinet })),
    rules,
  );

  const allParts = [...listed.flatMap((c) => c.parts), ...shared.parts.map((p) => p.part)];
  const marks = new Map<string, string>();
  const counters: Record<PartCategory, number> = { panel: 0, lumber: 0, laminate: 0 };
  for (const line of merge(allParts).sort(canonical)) {
    counters[line.category] += 1;
    marks.set(line.key, `${MARK_PREFIX[line.category]}${counters[line.category]}`);
  }
  const withMark = (line: CutListLine): CutListLine => ({ ...line, mark: marks.get(line.key) ?? '' });

  const keep = (part: Part) => options.includeFronts || !part.optional;
  const lines = merge(allParts.filter(keep)).map(withMark).sort(canonical);

  const groups: CutListGroup[] = [];
  const sections: CutListSection[] = [];
  const runSections: CutListRunSection[] = [];
  if (options.mode === 'merged') {
    for (const category of ['panel', 'lumber'] as const) {
      const thicknesses = [...new Set(lines.filter((l) => l.category === category).map((l) => l.thickness ?? 0))].sort(
        (a, b) => a - b,
      );
      for (const thickness of thicknesses) {
        const groupLines = sortLines(
          lines.filter((l) => l.category === category && l.thickness === thickness),
          options.sort,
        );
        groups.push({ id: `${category}:${thickness}`, category, thickness: thickness as Ticks, lines: groupLines, pieces: pieces(groupLines) });
      }
    }
    const laminate = sortLines(
      lines.filter((l) => l.category === 'laminate'),
      options.sort,
    );
    if (laminate.length > 0) {
      groups.push({ id: 'laminate', category: 'laminate', thickness: null, lines: laminate, pieces: pieces(laminate) });
    }
  } else {
    // Each part keeps its own line (Left and Right side stay separate here).
    const toLines = (parts: readonly Part[]) => parts.filter(keep).map((part) => withMark(merge([part])[0]!));
    for (const { index, cabinet, parts } of listed) {
      const own = shared.parts.filter((p) => p.cabinetIndex === index).map((p) => p.part);
      const sectionLines = toLines([...parts, ...own]);
      sections.push({ index, cabinet, lines: sectionLines, pieces: pieces(sectionLines) });
    }
    const byRun = new Map<string, Part[]>();
    for (const { part, cabinetIndex } of shared.parts) {
      if (cabinetIndex !== null || part.run === undefined) continue;
      byRun.set(part.run, [...(byRun.get(part.run) ?? []), part]);
    }
    for (const [run, parts] of byRun) {
      const sectionLines = toLines(parts);
      runSections.push({ run, ref: parts[0]!.cabinetId, lines: sectionLines, pieces: pieces(sectionLines) });
    }
  }

  const panelPieces = pieces(lines.filter((l) => l.category === 'panel'));
  const lumberPieces = pieces(lines.filter((l) => l.category === 'lumber'));
  const laminatePieces = pieces(lines.filter((l) => l.category === 'laminate'));
  return {
    options: { ...options, sort: { ...options.sort } },
    groups,
    sections,
    runSections,
    lines,
    blocked,
    jobIssues: shared.issues,
    totals: {
      boxes: listed.reduce((sum, c) => sum + c.cabinet.quantity, 0),
      panelPieces,
      ...(lumberPieces > 0 ? { lumberPieces } : {}),
      laminatePieces,
      distinctCuts: lines.length,
    },
  };
}
