import { buildCutList, DEFAULT_CUT_LIST_OPTIONS, type CutList, type CutListOptions } from '../cutlist';
import type { JobMaterials } from '../materials';
import type { CabinetSpec, ConstructionRules } from '../types';
import type { Ticks } from '../units';
import {
  baseOrder,
  compareScores,
  costScore,
  fitsSheet,
  measure,
  packCost,
  packStrips,
  stripItems,
  timeScore,
  type CostParams,
  type Env,
  type Fill,
  type Frame,
  type PackType,
  type PNode,
  type SheetPlan,
} from './pack';
import { describe, expandLine, groupByMaterial, show, type MaterialGroup } from './pieces';
import { spacingFor, type SawProfile } from './profile';
import { createRng, type Rng } from './rng';
import { statsOf, toPatterns, type LineInfo } from './tree';
import type { JobLayout, LayoutOptions, LayoutProgress, MaterialLayout, Piece, UnplacedPiece } from './types';

/**
 * Bumped whenever a change could move a piece for the same input. Saved
 * layouts record it, so a file can always be regenerated exactly.
 */
export const ALGORITHM_VERSION = 1;

/** Improvement steps per material when the options don't say. */
export const DEFAULT_ITERATIONS = 120;

export const DEFAULT_LAYOUT_OPTIONS: Readonly<LayoutOptions> = Object.freeze({ mode: 'cost', seed: 1, timeLimitMs: 5000 });

const now = () => globalThis.performance?.now() ?? Date.now();

/** A string's FNV-1a hash: mixes a material into the seed, so each material's search is the same in every mode. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Prepared {
  group: MaterialGroup;
  types: PackType[];
  lines: LineInfo[];
  pieces: Piece[][];
  env: Env;
  trim: number;
  sheetArea: number;
  unplaced: UnplacedPiece[];
  small: string[];
}

function prepare(group: MaterialGroup, profile: SawProfile, mode: LayoutOptions['mode']): Prepared {
  const { material } = group;
  const spacing = spacingFor({ kind: 'saw', profile });
  const grained = material.grain !== 'none';
  const canRotate = !grained && mode !== 'grain';
  const length = material.length ?? 0;
  const width = material.width ?? 0;
  const env: Env = {
    ux: length - 2 * spacing.edge,
    uy: width - 2 * spacing.edge,
    kerf: spacing.between,
    frames: profile.firstCut === 'either' ? ['length', 'width'] : [profile.firstCut],
    keepLength: profile.keepLength,
    keepWidth: profile.keepWidth,
  };
  const types: PackType[] = [];
  const lines: LineInfo[] = [];
  const pieces: Piece[][] = [];
  const unplaced: UnplacedPiece[] = [];
  const small: string[] = [];
  for (const line of group.lines) {
    const list = expandLine(line, grained);
    const type: PackType = {
      length: line.length,
      width: line.width,
      count: list.length,
      canRotate,
      visible: line.visible,
      area: line.length * line.width,
    };
    types.push(type);
    lines.push({ mark: line.mark, lineKey: line.key, name: line.name, visible: line.visible, grainLocked: grained, features: line.features ?? [] });
    pieces.push(list);
    if (!fitsSheet(type, env)) {
      const turned = grained ? ' Its grain has to run along the sheet, so it can’t be turned.' : '';
      for (const piece of list) {
        unplaced.push({
          piece,
          reason: 'too-big',
          message: `${describe(piece)} is bigger than a trimmed sheet of ${material.name} (${show(env.ux as Ticks)} × ${show(env.uy as Ticks)}).${turned}`,
        });
      }
    } else if (Math.min(line.length, line.width) < profile.minPiece) {
      small.push(line.mark);
    }
  }
  return { group, types, lines, pieces, env, trim: spacing.edge, sheetArea: length * width, unplaced, small };
}

function finish(p: Prepared, plans: readonly SheetPlan[]): MaterialLayout {
  const patterns = toPatterns(plans, p.types, p.lines, p.pieces, p.env, p.trim, p.sheetArea);
  return {
    material: p.group.material,
    sheetLength: (p.group.material.length ?? 0) as Ticks,
    sheetWidth: (p.group.material.width ?? 0) as Ticks,
    pieces: p.pieces.flat(),
    patterns,
    unplaced: p.unplaced,
    small: p.small,
    stats: statsOf(plans, patterns, p.env, p.sheetArea),
  };
}

const NOISE = [0, 0.05, 0.15, 0.3] as const;
const TRIALS = [2, 4, 8] as const;
const SHEET_TRIALS = [1, 2, 4] as const;

function firstParams(p: Prepared, visibleFirst: boolean): CostParams {
  return { order: baseOrder(p.types, visibleFirst), orient: new Uint8Array(p.types.length), noise: 0, bandTrials: 8, sheetTrials: 1, visibleFirst };
}

/** A random neighbor of the best parameters: a few pieces moved in the order, some turned the other way. */
function neighbor(best: CostParams, p: Prepared, rng: Rng): CostParams {
  const order = [...best.order];
  const moves = 1 + rng.int(3);
  for (let m = 0; m < moves && order.length > 1; m++) {
    const i = rng.int(order.length);
    const j = rng.int(order.length);
    // Grain mode keeps every visible piece ahead of the rest.
    if (best.visibleFirst && p.types[order[i]!]!.visible !== p.types[order[j]!]!.visible) continue;
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const orient = best.orient.slice();
  p.types.forEach((t, i) => {
    if (t.canRotate && rng.next() < 0.1) orient[i] = rng.int(3);
  });
  return {
    order,
    orient,
    noise: NOISE[rng.int(NOISE.length)]!,
    bandTrials: TRIALS[rng.int(TRIALS.length)]!,
    sheetTrials: SHEET_TRIALS[rng.int(SHEET_TRIALS.length)]!,
    visibleFirst: best.visibleFirst,
  };
}

const placedArea = (plans: readonly SheetPlan[]) => plans.reduce((s, plan) => s + plan.area, 0);

interface Search {
  plans: SheetPlan[];
  iterations: number;
  complete: boolean;
}

/** Cost and grain: best fit first, then keep the best of `iterations` random neighbors. */
function searchCost(
  p: Prepared,
  visibleFirst: boolean,
  seed: number,
  iterations: number,
  deadline: number,
  improved: (plans: SheetPlan[]) => void,
): Search {
  const rng = createRng(seed ^ hash32(p.group.material.id));
  let params = firstParams(p, visibleFirst);
  let plans = packCost(p.types, p.env, params, rng);
  let score = costScore(measure(plans, p.env));
  let done = 0;
  for (; done < iterations; done++) {
    if (now() > deadline) return { plans, iterations: done, complete: false };
    const next = neighbor(params, p, rng);
    const candidate = packCost(p.types, p.env, next, rng);
    // A plan must place every piece that fits; one that doesn't is never better.
    if (placedArea(candidate) !== placedArea(plans)) continue;
    const s = costScore(measure(candidate, p.env));
    const cmp = compareScores(s, score);
    if (cmp <= 0) {
      params = next;
      plans = candidate;
      score = s;
      if (cmp < 0) improved(plans);
    }
  }
  return { plans, iterations: done, complete: true };
}

const FILLS: readonly Fill[] = ['greedy', 'exact', 'bfd'];
const FILL_PAIRS: readonly [Fill, Fill][] = FILLS.flatMap((a) => FILLS.map((b): [Fill, Fill] => [a, b]));
/** The first layout tries one way only. */
const QUICK_PAIRS: readonly [Fill, Fill][] = [['greedy', 'exact']];

/**
 * Time: strip layouts. Start with a strip for every width; then let the
 * smallest width classes ride in the next wider strip (trimmed to width)
 * while that brings the sheets within the allowance or saves setups. Keep the
 * layout with the fewest setups within the extra-sheet allowance over `cost`;
 * `cost` itself if no strip layout is.
 */
function chooseTime(p: Prepared, cost: readonly SheetPlan[], extra: number, thorough: boolean): SheetPlan[] {
  const limit = cost.length + Math.max(0, extra);
  const objective = (plans: readonly SheetPlan[]) => {
    const m = measure(plans, p.env);
    return [Math.max(0, m.sheets - limit), ...timeScore(m)];
  };
  let best: SheetPlan[] = [...cost];
  let bestScore = objective(best);
  for (const frame of p.env.frames as Frame[]) {
    const items = stripItems(p.types, p.env, frame);
    const classArea = new Map<number, number>();
    for (const it of items) classArea.set(it.c, (classArea.get(it.c) ?? 0) + it.a * it.c * it.left);
    // Smallest classes are the first to try riding along.
    const candidates = [...classArea.keys()].sort((x, y) => classArea.get(x)! - classArea.get(y)! || x - y);
    for (const [stripFill, sheetFill] of thorough ? FILL_PAIRS : QUICK_PAIRS) {
      let widths = [...classArea.keys()];
      let plans = packStrips(p.types, p.env, { frame, widths, stripFill, sheetFill });
      let score = objective(plans);
      for (let pass = 0, changed = true; changed && pass < (thorough ? 3 : 1); pass++) {
        changed = false;
        for (const w of candidates) {
          if (!widths.includes(w) || widths.every((x) => x <= w)) continue;
          const next = widths.filter((x) => x !== w);
          const nextPlans = packStrips(p.types, p.env, { frame, widths: next, stripFill, sheetFill });
          const s = objective(nextPlans);
          if (compareScores(s, score) < 0) {
            widths = next;
            plans = nextPlans;
            score = s;
            changed = true;
          }
        }
      }
      // Over the allowance: cut the emptiest few strip sheets' pieces best-fit instead.
      for (let k = 1; score[0]! > 0 && k <= Math.min(TAIL_SHEETS, plans.length); k++) {
        const hybrid = repackTail(p, plans, k);
        const s = objective(hybrid);
        if (compareScores(s, score) < 0) {
          plans = hybrid;
          score = s;
        }
      }
      if (score[0] === 0 && compareScores(score, bestScore) < 0) {
        best = plans;
        bestScore = score;
      }
    }
  }
  return best;
}

/** The most strip sheets time mode gives up to best-fit packing to stay within the allowance. */
const TAIL_SHEETS = 6;

/** The plan with its `k` emptiest sheets' pieces laid out again best-fit, after the rest. */
function repackTail(p: Prepared, plans: readonly SheetPlan[], k: number): SheetPlan[] {
  const emptiest = new Set(
    plans
      .map((plan, i) => ({ area: plan.area, i }))
      .sort((x, y) => x.area - y.area || y.i - x.i)
      .slice(0, k)
      .map((s) => s.i),
  );
  const counts = p.types.map(() => 0);
  const count = (n: PNode) => {
    if (n.t === 'p') counts[n.type]! += 1;
    else n.children.forEach(count);
  };
  plans.forEach((plan, i) => emptiest.has(i) && count(plan.root));
  const rest = p.types.map((t, i) => ({ ...t, count: counts[i]! }));
  const repacked = packCost(rest, p.env, firstParams(p, false), createRng(1));
  return [...plans.filter((_, i) => !emptiest.has(i)), ...repacked];
}

/**
 * Lay the job's pieces out on stock sheets, one layout per material.
 *
 * - Pieces are the cut list's lines, one per unit of quantity, grouped by the
 *   material they're cut from (`materials` fills in lines without their own).
 * - Every cut is a guillotine cut; each sheet keeps its cut tree.
 * - Deterministic: the same input, profile, mode and seed give the same
 *   layout (unless `timeLimitMs` stops the search first; `search.complete`
 *   says so).
 * - `onProgress` hears the fast first layout, then each improvement.
 */
export function layoutJob(
  cutList: CutList,
  materials: JobMaterials,
  profile: SawProfile,
  options: LayoutOptions,
  onProgress?: (progress: LayoutProgress) => void,
): JobLayout {
  const started = now();
  const deadline = started + Math.max(0, options.timeLimitMs);
  const iterations = Math.max(0, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const { groups, unplaced } = groupByMaterial(cutList, materials);
  const prepared = groups.map((g) => prepare(g, profile, options.mode));
  const visibleFirst = options.mode === 'grain';

  // The fast first layout: best fit (cost, grain) or strips (time, against the best-fit sheet count).
  const firstCost = prepared.map((p) => packCost(p.types, p.env, firstParams(p, visibleFirst), createRng(options.seed)));
  const current = prepared.map((p, i) =>
    options.mode === 'time' ? chooseTime(p, firstCost[i]!, profile.extraSheets, false) : firstCost[i]!,
  );
  let total = 0;
  let complete = true;
  const result = (): JobLayout => ({
    algorithmVersion: ALGORITHM_VERSION,
    mode: options.mode,
    seed: options.seed,
    profile: { ...profile },
    materials: prepared.map((p, i) => finish(p, current[i]!)),
    unplaced,
    search: { iterations: total, complete },
  });
  onProgress?.({ phase: 'first', layout: result() });

  prepared.forEach((p, i) => {
    const report = options.mode === 'time' ? () => {} : (plans: SheetPlan[]) => {
      current[i] = plans;
      onProgress?.({ phase: 'improved', layout: result() });
    };
    const search = searchCost(p, visibleFirst, options.seed, iterations, deadline, report);
    total += search.iterations;
    complete &&= search.complete;
    if (options.mode === 'time') {
      const next = chooseTime(p, search.plans, profile.extraSheets, true);
      const changed = compareScores(timeScore(measure(next, p.env)), timeScore(measure(current[i]!, p.env))) !== 0;
      current[i] = next;
      if (changed) onProgress?.({ phase: 'improved', layout: result() });
    } else {
      current[i] = search.plans;
    }
  });
  return result();
}

/** Everything a layout is made from, so it can be re-run with an allowance changed (sensitivity). */
export interface LayoutInput {
  cabinets: readonly CabinetSpec[];
  rules: ConstructionRules;
  materials: JobMaterials;
  /** Which lines are laid out: fronts or not. Mode and sort don't matter. Default: every line. */
  cutListOptions?: CutListOptions;
  profile: SawProfile;
  options: LayoutOptions;
}

export function cutListFor(input: Pick<LayoutInput, 'cabinets' | 'rules' | 'materials' | 'cutListOptions'>): CutList {
  const options = { ...(input.cutListOptions ?? DEFAULT_CUT_LIST_OPTIONS), mode: 'merged' as const };
  return buildCutList(input.cabinets, input.rules, options, input.materials);
}

/** Build the cut list and lay it out. */
export function layoutInput(input: LayoutInput, onProgress?: (progress: LayoutProgress) => void): JobLayout {
  return layoutJob(cutListFor(input), input.materials, input.profile, input.options, onProgress);
}
