import type { CutList, CutListLine } from '../cutlist';
import type { ConstructionRules } from '../types';
import { formatDimension, inches, type Ticks } from '../units';
import type { JobMaterials } from '../materials';
import { cutListFor, layoutJob, type LayoutInput } from './layout';
import { lineMaterial } from './pieces';
import type { SawProfile } from './profile';
import type { CutNode, JobLayout, MaterialLayout } from './types';

/**
 * How sensitive a layout is to small allowances (plan §2.4). Everything here
 * is a suggestion in plain words; nothing is changed.
 *
 * - Near misses: an allowance moved by 1/64″ steps (up to 1/8″), or the
 *   pieces closest to a strip boundary made slightly smaller, saves a sheet.
 * - Fragile strips: a strip with almost no slack, and the kerf or edge trim
 *   that would break it.
 * - Risks: an allowance moved the other way costs a sheet.
 * - A light last sheet.
 */

export type SensitivityAllowance = 'kerf' | 'edgeTrim' | 'laminateOversize' | 'shelfClearance';

export interface NearMiss {
  materialId: string;
  materialName: string;
  /** What to change: an allowance, or one cut-list line's size. */
  change:
    | { kind: 'allowance'; allowance: SensitivityAllowance; from: Ticks; to: Ticks }
    | { kind: 'piece'; mark: string; dimension: 'length' | 'width'; from: Ticks; to: Ticks };
  sheetsSaved: number;
  message: string;
}

export interface FragileStrip {
  materialId: string;
  pattern: number;
  /** The first sheet cut to the pattern, and how many are. */
  sheet: number;
  sheets: number;
  /** 1-based strip on the sheet; null: the strips together, across the sheet. */
  strip: number | null;
  slack: Ticks;
  /** A kerf over this won't fit. Null when the kerf doesn't matter here. */
  kerfLimit: Ticks | null;
  /** An edge trim over this won't fit. Null when the trim doesn't matter here. */
  trimLimit: Ticks | null;
  message: string;
}

export interface AllowanceRisk {
  materialId: string;
  allowance: SensitivityAllowance;
  from: Ticks;
  /** The smallest change that costs a sheet (every bigger step costs one too). */
  to: Ticks;
  extraSheets: number;
  message: string;
}

export interface LightSheet {
  materialId: string;
  sheet: number;
  yieldPercent: number;
  pieces: number;
  message: string;
}

export interface Sensitivity {
  nearMisses: NearMiss[];
  fragile: FragileStrip[];
  risks: AllowanceRisk[];
  lightSheets: LightSheet[];
}

export const SENSITIVITY_LIMITS = Object.freeze({
  /** Allowances move by this much at a time… */
  step: inches(1 / 64),
  /** …up to this far. */
  reach: inches(1 / 8),
  /** The most a piece is made smaller to fit one more across. */
  shrink: inches(1 / 4),
  /** How many of the closest pieces are tried. */
  shrinkCandidates: 4,
  /** Strips with less slack than this are fragile. */
  fragileSlack: inches(1 / 16),
  /** A last sheet used less than this, in percent, is light. */
  lightSheetPercent: 50,
  /** Improvement steps for each re-run. */
  iterations: 4,
});

const exact = (value: number) => `${formatDimension(value as Ticks, { denominator: 64, inchMark: false }).text}″`;
const sheets = (n: number) => (n === 1 ? '1 sheet' : `${n} sheets`);
const sheetsOn = (first: number, count: number) => (count > 1 ? `sheets ${first}–${first + count - 1}` : `sheet ${first}`);

const NAMES: Readonly<Record<SensitivityAllowance, { name: string; per: string }>> = {
  kerf: { name: 'kerf', per: '' },
  edgeTrim: { name: 'edge trim', per: '' },
  laminateOversize: { name: 'laminate oversize', per: ' per edge' },
  shelfClearance: { name: 'shelf clearance', per: ' per side' },
};

function allowanceValue(input: LayoutInput, allowance: SensitivityAllowance): Ticks {
  switch (allowance) {
    case 'kerf':
      return input.profile.kerf;
    case 'edgeTrim':
      return input.profile.edgeTrim;
    case 'laminateOversize':
      return input.rules.laminateOversizePerEdge;
    case 'shelfClearance':
      return input.rules.shelfClearancePerSide;
  }
}

function withAllowance(input: LayoutInput, allowance: SensitivityAllowance, value: Ticks): LayoutInput {
  const profile: SawProfile = { ...input.profile };
  let rules: ConstructionRules = input.rules;
  if (allowance === 'kerf') profile.kerf = value;
  else if (allowance === 'edgeTrim') profile.edgeTrim = value;
  else if (allowance === 'laminateOversize') rules = { ...rules, laminateOversizePerEdge: value };
  else rules = { ...rules, shelfClearancePerSide: value };
  return { ...input, profile, rules };
}

const sheetCount = (layout: JobLayout) => new Map(layout.materials.map((m) => [m.material.id, m.stats.sheets]));

/**
 * The materials an allowance can change: laminate oversize only laminate,
 * shelf clearance only what shelves are cut from; null for every material.
 * Each material lays out on its own, so the rest needn't be re-run.
 */
function affected(cutList: CutList, materials: JobMaterials, allowance: SensitivityAllowance): ReadonlySet<string> | null {
  const of = (pick: (l: CutListLine) => boolean) =>
    new Set(cutList.lines.filter(pick).flatMap((l) => lineMaterial(l, materials)?.id ?? []));
  if (allowance === 'laminateOversize') return of((l) => l.category === 'laminate');
  if (allowance === 'shelfClearance') return of((l) => l.roles.includes('shelf'));
  return null;
}

/** Lay out just the lines cut from `ids` (all of them for null), with a short search. */
function rerun(input: LayoutInput, cutList: CutList, ids: ReadonlySet<string> | null): JobLayout {
  const quick = { ...input.options, iterations: Math.min(input.options.iterations ?? Infinity, SENSITIVITY_LIMITS.iterations) };
  const lines = ids === null ? cutList.lines : cutList.lines.filter((l) => ids.has(lineMaterial(l, input.materials)?.id ?? ''));
  return layoutJob({ ...cutList, lines }, input.materials, input.profile, quick);
}

export function sensitivity(input: LayoutInput, result: JobLayout): Sensitivity {
  const run = (next: LayoutInput, ids: ReadonlySet<string> | null = null) => rerun(next, cutListFor(next), ids);
  const cutList = cutListFor(input);
  const actual = sheetCount(result);
  // Re-runs search less than the real layout, so a "costs a sheet" is judged against a re-run of the input as it is.
  const baseline = sheetCount(run(input));
  const names = new Map(result.materials.map((m) => [m.material.id, m.material.name]));

  const nearMisses: NearMiss[] = [];
  const risks: AllowanceRisk[] = [];
  const allowances: SensitivityAllowance[] = ['kerf', 'edgeTrim', 'laminateOversize', 'shelfClearance'];
  for (const allowance of allowances) {
    const ids = affected(cutList, input.materials, allowance);
    if (ids !== null && ids.size === 0) continue;
    const from = allowanceValue(input, allowance);
    for (const sign of [-1, 1] as const) {
      const steps: { to: number; counts: Map<string, number> }[] = [];
      for (let d: number = SENSITIVITY_LIMITS.step; d <= SENSITIVITY_LIMITS.reach; d += SENSITIVITY_LIMITS.step) {
        const to = from + sign * d;
        if (to < 0) break;
        steps.push({ to, counts: sheetCount(run(withAllowance(input, allowance, to as Ticks), ids)) });
      }
      const { name, per } = NAMES[allowance];
      const verb = sign < 0 ? 'Reducing' : 'Raising';
      for (const [id, now] of actual) {
        if (ids !== null && !ids.has(id)) continue;
        const material = names.get(id) ?? id;
        // The smallest change that saves a sheet.
        const save = steps.find((s) => (s.counts.get(id) ?? now) < now);
        if (save && !nearMisses.some((n) => n.materialId === id && n.change.kind === 'allowance' && n.change.allowance === allowance)) {
          const saved = now - save.counts.get(id)!;
          nearMisses.push({
            materialId: id,
            materialName: material,
            change: { kind: 'allowance', allowance, from, to: save.to as Ticks },
            sheetsSaved: saved,
            message: `${verb} the ${name} from ${exact(from)} to ${exact(save.to)}${per} saves ${sheets(saved)} of ${material}.`,
          });
        }
        // The smallest change from which every bigger step costs a sheet.
        const base = Math.max(now, baseline.get(id) ?? now);
        let k = steps.length;
        while (k > 0 && (steps[k - 1]!.counts.get(id) ?? base) > base) k -= 1;
        if (k < steps.length) {
          const step = steps[k]!;
          const extra = (step.counts.get(id) ?? base) - base;
          const what = allowance === 'kerf' ? `A ${exact(step.to)} kerf` : `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} of ${exact(step.to)}${per}`;
          risks.push({
            materialId: id,
            allowance,
            from,
            to: step.to as Ticks,
            extraSheets: extra,
            message: `${what} or ${sign < 0 ? 'less' : 'more'} needs ${extra === 1 ? '1 more sheet' : `${extra} more sheets`} of ${material}.`,
          });
        }
      }
    }
  }

  nearMisses.push(...shrinkMisses(input, result, cutList));
  return {
    nearMisses: nearMisses.sort((a, b) => b.sheetsSaved - a.sheetsSaved || changeSize(a) - changeSize(b)),
    fragile: result.materials.flatMap((m) => fragileStrips(m, input.profile)),
    risks,
    lightSheets: result.materials.flatMap(lightSheet),
  };
}

const changeSize = (n: NearMiss) => Math.abs(n.change.from - n.change.to);

/**
 * The pieces closest to fitting one more across the sheet (or along it):
 * how much smaller each would have to be, the closest few tried for real.
 */
function shrinkMisses(input: LayoutInput, result: JobLayout, cutList: CutList): NearMiss[] {
  const { kerf, edgeTrim } = input.profile;
  const candidates: { line: CutListLine; layout: MaterialLayout; dimension: 'length' | 'width'; to: number; weight: number }[] = [];
  for (const layout of result.materials) {
    const keys = new Set(layout.pieces.map((p) => p.lineKey));
    const extent = { length: layout.sheetLength - 2 * edgeTrim, width: layout.sheetWidth - 2 * edgeTrim };
    for (const line of cutList.lines) {
      if (!keys.has(line.key)) continue;
      for (const dimension of ['length', 'width'] as const) {
        const size = line[dimension];
        const room = extent[dimension];
        const across = Math.floor((room + kerf) / (size + kerf));
        if (across < 1) continue;
        const to = Math.floor((room + kerf) / (across + 1)) - kerf;
        if (to <= 0 || size - to > SENSITIVITY_LIMITS.shrink) continue;
        candidates.push({ line, layout, dimension, to, weight: line.length * line.width * line.quantity });
      }
    }
  }
  candidates.sort((a, b) => a.line[a.dimension] - a.to - (b.line[b.dimension] - b.to) || b.weight - a.weight);

  const misses: NearMiss[] = [];
  for (const c of candidates.slice(0, SENSITIVITY_LIMITS.shrinkCandidates)) {
    const id = c.layout.material.id;
    const now = c.layout.stats.sheets;
    const changed = cutList.lines.map((l) => (l.key === c.line.key ? { ...l, [c.dimension]: c.to as Ticks } : l));
    const after = rerun(input, { ...cutList, lines: changed }, new Set([id]));
    const next = after.materials.find((m) => m.material.id === id)?.stats.sheets ?? now;
    if (next >= now) continue;
    const from = c.line[c.dimension];
    const by = from - c.to;
    const word = c.dimension === 'width' ? 'narrower' : 'shorter';
    misses.push({
      materialId: id,
      materialName: c.layout.material.name,
      change: { kind: 'piece', mark: c.line.mark, dimension: c.dimension, from, to: c.to as Ticks },
      sheetsSaved: now - next,
      message: `Making ${c.line.mark} ${c.line.name} ${exact(by)} ${word} (${exact(c.to)} instead of ${exact(from)}) saves ${sheets(now - next)} of ${c.layout.material.name}.`,
    });
  }
  return misses;
}

interface Tightness {
  slack: number;
  kerfLimit: number | null;
}

/** The tightest split in a subtree: its slack, and the kerf over which it no longer fits. */
function tightest(node: CutNode, kerf: number): Tightness | null {
  if (node.kind !== 'split') return null;
  const content = node.children.filter((c) => c.kind !== 'offcut');
  const along = (c: CutNode) => (node.axis === 'x' ? c.length : c.width);
  const extent = along(node);
  const used = content.reduce((s, c) => s + along(c), 0) + kerf * (content.length - 1);
  let best: Tightness | null =
    content.length > 1 ? { slack: extent - used, kerfLimit: kerf + Math.floor((extent - used) / (content.length - 1)) } : null;
  for (const child of content) {
    const t = tightest(child, kerf);
    if (t && t.kerfLimit !== null && (!best || best.kerfLimit === null || t.kerfLimit < best.kerfLimit)) best = t;
  }
  return best;
}

export function fragileStrips(m: MaterialLayout, profile: SawProfile): FragileStrip[] {
  const out: FragileStrip[] = [];
  const { kerf, edgeTrim } = profile;
  const limit = SENSITIVITY_LIMITS.fragileSlack;
  for (const pattern of m.patterns) {
    const root = pattern.cutTree;
    if (root.kind !== 'split') continue;
    const first = pattern.sheets[0]?.number ?? 1;
    const where = sheetsOn(first, pattern.count);
    const strips = root.children.filter((c) => c.kind !== 'offcut');
    const along = (node: CutNode, axis: 'x' | 'y') => (axis === 'x' ? node.length : node.width);
    const report = (strip: number | null, slack: number, kerfLimit: number | null, trimLimit: number | null) => {
      const limits = [
        kerfLimit === null ? null : `a kerf over ${exact(kerfLimit)}`,
        trimLimit === null ? null : `an edge trim over ${exact(trimLimit)}`,
      ].filter((s): s is string => s !== null);
      const many = strip === null;
      const room = slack === 0 ? `${many ? 'have' : 'has'} no room left` : `${many ? 'leave' : 'has'} ${exact(slack)}${many ? '' : ' left'}`;
      const subject = many ? `The strips on ${where}` : `Strip ${strip} on ${where}`;
      const tail = limits.length > 0 ? ` With ${limits.join(' or ')}, ${many ? 'they' : 'it'} won’t fit.` : '';
      out.push({
        materialId: m.material.id,
        pattern: pattern.id,
        sheet: first,
        sheets: pattern.count,
        strip,
        slack: slack as Ticks,
        kerfLimit: kerfLimit as Ticks | null,
        trimLimit: trimLimit as Ticks | null,
        message: `${m.material.name}: ${subject} ${room} across ${strip === null ? 'the sheet' : 'its length'}.${tail}`,
      });
    };

    // Across the sheet: the strips together, against the trimmed width; edge trim counts twice.
    const acrossUsed = strips.reduce((s, c) => s + along(c, root.axis), 0) + kerf * (strips.length - 1);
    const acrossSlack = along(root, root.axis) - acrossUsed;
    if (acrossSlack < limit) {
      report(
        null,
        acrossSlack,
        strips.length > 1 ? kerf + Math.floor(acrossSlack / (strips.length - 1)) : null,
        edgeTrim + Math.floor(acrossSlack / 2),
      );
    }
    // Each strip: along its length (which the trim shortens too), and anything cut from it.
    strips.forEach((strip, i) => {
      if (strip.kind !== 'split') return;
      const t = tightest(strip, kerf);
      const content = strip.children.filter((c) => c.kind !== 'offcut');
      const own = along(strip, strip.axis) - content.reduce((s, c) => s + along(c, strip.axis), 0) - kerf * (content.length - 1);
      const slack = Math.min(own, t?.slack ?? Infinity);
      if (slack >= limit) return;
      report(i + 1, slack, t?.kerfLimit ?? null, edgeTrim + Math.floor(own / 2));
    });
  }
  return out;
}

export function lightSheet(m: MaterialLayout): LightSheet[] {
  const last = m.patterns.flatMap((p) => p.sheets.map((s) => ({ p, number: s.number }))).sort((a, b) => b.number - a.number)[0];
  if (!last || last.p.yieldPercent >= SENSITIVITY_LIMITS.lightSheetPercent) return [];
  const pieces = last.p.placements.length;
  return [
    {
      materialId: m.material.id,
      sheet: last.number,
      yieldPercent: last.p.yieldPercent,
      pieces,
      message: `The last sheet of ${m.material.name} is ${Math.round(last.p.yieldPercent)}% used (${pieces === 1 ? '1 piece' : `${pieces} pieces`}).`,
    },
  ];
}
