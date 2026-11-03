import type { Rng } from './rng';

/**
 * Guillotine packing, in an abstract frame: `a` runs along the sheet's first
 * cuts and `c` across them. With the first cuts along the sheet's length,
 * a = x and c = y; crosscut first, a = y and c = x. Sizes are plain integer
 * ticks here; tree.ts turns a plan into sheet coordinates.
 *
 * A sheet is a tree of splits. A split's children lie side by side along
 * `dir` (0: along a, so its cuts run along c; 1: along c, so its cuts run
 * along a), one kerf apart; each child spans the split's full extent the
 * other way. A piece leaf fills its slot exactly; a piece that doesn't is
 * wrapped in a split one level down whose leftover is trimmed off.
 */

/** Which way a sheet's first cuts run: along its length (x) or its width (y). */
export type Frame = 'length' | 'width';

/** Pieces of one cut-list line: identical, so interchangeable while packing. */
export interface PackType {
  /** Part length and width; unrotated, length lies along the sheet's x. */
  length: number;
  width: number;
  count: number;
  canRotate: boolean;
  visible: boolean;
  area: number;
}

export type PNode = PLeaf | PSplit;
export interface PLeaf {
  t: 'p';
  type: number;
  rotated: boolean;
  a: number;
  c: number;
}
export interface PSplit {
  t: 's';
  dir: 0 | 1;
  /** The split's region. */
  a: number;
  c: number;
  depth: number;
  children: PNode[];
}

export interface SheetPlan {
  frame: Frame;
  root: PSplit;
  area: number;
}

/** The trimmed sheet and the gap between pieces. */
export interface Env {
  /** Usable extent along x (sheet length) and y (sheet width). */
  ux: number;
  uy: number;
  kerf: number;
  frames: readonly Frame[];
  keepLength: number;
  keepWidth: number;
}

/** Splits that are filled with several children go this deep: rip, crosscut, trim. One more level only trims a single piece. */
const MAX_FILL_DEPTH = 3;

/** A piece's extent along a and c, in a frame. */
export function dims(t: PackType, rotated: boolean, frame: Frame): [number, number] {
  const ex = rotated ? t.width : t.length;
  const ey = rotated ? t.length : t.width;
  return frame === 'length' ? [ex, ey] : [ey, ex];
}

export function usable(env: Env, frame: Frame): [number, number] {
  return frame === 'length' ? [env.ux, env.uy] : [env.uy, env.ux];
}

/** Whether a piece fits on an empty trimmed sheet at all, in some allowed way. */
export function fitsSheet(t: PackType, env: Env): boolean {
  const ok = (rotated: boolean) => {
    const [x, y] = rotated ? [t.width, t.length] : [t.length, t.width];
    return x <= env.ux && y <= env.uy;
  };
  return ok(false) || (t.canRotate && ok(true));
}

/** How the best-fit packer chooses. The search varies these. */
export interface CostParams {
  /** Rank of each type: earlier wins ties (and first-fit choices). */
  order: readonly number[];
  /** Per type: 0 either way, 1 never turned, 2 always turned (only for types that may turn). */
  orient: Uint8Array;
  /** Chance that a choice takes the first piece that fits, in order, instead of the best fit. */
  noise: number;
  /** How many strip widths to try out before ripping each strip. */
  bandTrials: number;
  /** How many ways to fill each sheet (the first as the params say, the rest with more noise); the fullest is kept. */
  sheetTrials: number;
  /** Grain mode: visible pieces before any others. */
  visibleFirst: boolean;
}

interface Choice {
  type: number;
  rotated: boolean;
  a: number;
  c: number;
}

interface Ctx {
  types: readonly PackType[];
  counts: Int32Array;
  env: Env;
  frame: Frame;
  /** Type indexes in order. */
  seq: number[];
  allowed: (readonly boolean[])[];
  params: CostParams;
  rng: Rng;
  area: number;
  /** The noise of the fill in progress. */
  noise: number;
}

function orientations(ctx: Ctx, i: number): readonly boolean[] {
  return ctx.allowed[i]!;
}

/**
 * The ways each type may lie: per the params' preference, but never a way that
 * leaves a piece unable to fit a sheet it would fit turned.
 */
function allowedOrientations(types: readonly PackType[], env: Env, orient: Uint8Array): (readonly boolean[])[] {
  return types.map((t, i) => {
    if (!t.canRotate) return NOT_TURNED;
    const o = orient[i] ?? 0;
    const pick = o === 1 ? NOT_TURNED : o === 2 ? TURNED : EITHER;
    const fits = pick.some((rotated) => {
      const [x, y] = rotated ? [t.width, t.length] : [t.length, t.width];
      return x <= env.ux && y <= env.uy;
    });
    return fits ? pick : EITHER;
  });
}
const NOT_TURNED = [false] as const;
const TURNED = [true] as const;
const EITHER = [false, true] as const;

/**
 * The next piece for a split along `dir` with `rem` left and `other` across.
 * Best fit: the piece that fills the slot across most closely, then the
 * thickest; grain mode puts visible pieces first.
 */
function choose(ctx: Ctx, dir: 0 | 1, rem: number, other: number, only?: number): Choice | null {
  const firstFit = ctx.noise > 0 && ctx.rng.next() < ctx.noise;
  let best: Choice | null = null;
  let bestTier = 2;
  let bestWaste = Infinity;
  let bestThick = -1;
  for (const i of ctx.seq) {
    if (ctx.counts[i]! <= 0) continue;
    const t = ctx.types[i]!;
    const tier = ctx.params.visibleFirst && !t.visible ? 1 : 0;
    if (tier > bestTier) continue;
    for (const rotated of orientations(ctx, i)) {
      const [a, c] = dims(t, rotated, ctx.frame);
      const d = dir === 0 ? a : c;
      const o = dir === 0 ? c : a;
      if (d > rem || o > other) continue;
      if (only !== undefined && d !== only) continue;
      const waste = other - o;
      if (firstFit) {
        if (tier < bestTier) {
          best = { type: i, rotated, a, c };
          bestTier = tier;
        }
        break;
      }
      if (tier < bestTier || waste < bestWaste || (waste === bestWaste && d > bestThick)) {
        best = { type: i, rotated, a, c };
        bestTier = tier;
        bestWaste = waste;
        bestThick = d;
      }
    }
    if (firstFit && best && bestTier === 0) break;
  }
  return best;
}

/**
 * The next strip across the sheet: try the strip widths the remaining pieces
 * offer (the widest few), fill each, and keep the one that fills best.
 */
function chooseStrip(ctx: Ctx, rem: number, other: number): Choice | null {
  const thick = new Set<number>();
  let anyVisible = false;
  for (const i of ctx.seq) {
    if (ctx.counts[i]! <= 0) continue;
    const t = ctx.types[i]!;
    for (const rotated of orientations(ctx, i)) {
      const [a, c] = dims(t, rotated, ctx.frame);
      if (c <= rem && a <= other) {
        thick.add(c);
        if (t.visible) anyVisible = true;
      }
    }
  }
  if (thick.size === 0) return null;
  const widths = [...thick].sort((x, y) => y - x).slice(0, Math.max(1, ctx.params.bandTrials));
  if (widths.length === 1) return choose(ctx, 1, rem, other, widths[0]);

  let best: Choice | null = null;
  let bestScore = -1;
  for (const width of widths) {
    const lead = choose(ctx, 1, rem, other, width);
    if (!lead) continue;
    if (ctx.params.visibleFirst && anyVisible && !ctx.types[lead.type]!.visible) continue;
    const saved = ctx.counts.slice();
    const savedArea = ctx.area;
    ctx.counts[lead.type]! -= 1;
    ctx.area += ctx.types[lead.type]!.area;
    child(ctx, lead, 1, other, 1);
    const fill = (ctx.area - savedArea) / (width * other);
    ctx.counts.set(saved);
    ctx.area = savedArea;
    if (fill > bestScore + 1e-12) {
      best = lead;
      bestScore = fill;
    }
  }
  return best ?? choose(ctx, 1, rem, other);
}

function leaf(ch: Choice): PLeaf {
  return { t: 'p', type: ch.type, rotated: ch.rotated, a: ch.a, c: ch.c };
}

/** A child of a split along `dir` at `depth`: the piece, or the piece and whatever else fits beside it. */
function child(ctx: Ctx, ch: Choice, dir: 0 | 1, other: number, depth: number): PNode {
  const across = dir === 0 ? ch.c : ch.a;
  if (across === other) return leaf(ch);
  const a = dir === 0 ? ch.a : other;
  const c = dir === 0 ? other : ch.c;
  const next = dir === 0 ? 1 : 0;
  if (depth + 1 <= MAX_FILL_DEPTH) return fill(ctx, a, c, next, depth + 1, ch);
  return { t: 's', dir: next, a, c, depth: depth + 1, children: [leaf(ch)] };
}

/** Fill a region with a split along `dir`, starting with `first` if given. */
function fill(ctx: Ctx, a: number, c: number, dir: 0 | 1, depth: number, first: Choice | null): PSplit {
  const extent = dir === 0 ? a : c;
  const other = dir === 0 ? c : a;
  const kerf = ctx.env.kerf;
  const children: PNode[] = [];
  let used = 0;
  if (first) {
    children.push(leaf(first));
    used = dir === 0 ? first.a : first.c;
  }
  for (;;) {
    const rem = extent - used - (children.length > 0 ? kerf : 0);
    if (rem <= 0) break;
    const ch = depth === 1 ? chooseStrip(ctx, rem, other) : choose(ctx, dir, rem, other);
    if (!ch) break;
    ctx.counts[ch.type]! -= 1;
    ctx.area += ctx.types[ch.type]!.area;
    used += (children.length > 0 ? kerf : 0) + (dir === 0 ? ch.a : ch.c);
    children.push(child(ctx, ch, dir, other, depth));
  }
  return { t: 's', dir, a, c, depth, children };
}

/** The search order: biggest pieces first (visible first in grain mode), as type indexes. */
export function baseOrder(types: readonly PackType[], visibleFirst: boolean): number[] {
  return types
    .map((_, i) => i)
    .sort((x, y) => {
      const a = types[x]!;
      const b = types[y]!;
      return (
        (visibleFirst ? Number(b.visible) - Number(a.visible) : 0) ||
        Math.max(b.length, b.width) - Math.max(a.length, a.width) ||
        b.area - a.area ||
        x - y
      );
    });
}

/** Extra sheet fills choose first-fit this often. */
const TRIAL_NOISE = 0.2;

/** Cost and grain modes: fill sheet after sheet, best fit, until every piece that fits is placed. */
export function packCost(types: readonly PackType[], env: Env, params: CostParams, rng: Rng): SheetPlan[] {
  const counts = Int32Array.from(types.map((t) => (fitsSheet(t, env) ? t.count : 0)));
  const ctx: Ctx = { types, counts, env, frame: env.frames[0]!, seq: [...params.order], params, rng, area: 0, noise: params.noise,
    allowed: allowedOrientations(types, env, params.orient) };
  const sheets: SheetPlan[] = [];
  while (ctx.counts.some((n) => n > 0)) {
    let best: { plan: SheetPlan; counts: Int32Array } | null = null;
    const start = ctx.counts.slice();
    for (const frame of env.frames) {
      for (let trial = 0; trial < Math.max(1, params.sheetTrials); trial++) {
        ctx.counts.set(start);
        ctx.area = 0;
        ctx.frame = frame;
        ctx.noise = trial === 0 ? params.noise : Math.max(params.noise, TRIAL_NOISE);
        const [ua, uc] = usable(env, frame);
        const root = fill(ctx, ua, uc, 1, 1, null);
        if (!best || ctx.area > best.plan.area) best = { plan: { frame, root, area: ctx.area }, counts: ctx.counts.slice() };
      }
    }
    if (!best || best.plan.area === 0) break;
    ctx.counts.set(best.counts);
    sheets.push(best.plan);
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// Time mode: strips of a few widths, repeated
// ---------------------------------------------------------------------------

/**
 * Fill one length `cap` from item kinds (each with a count left), one kerf
 * between items. Greedy, longest first; each kind gets a turn as the opener
 * and the fullest fill wins. Returns how many of each kind.
 */
function greedyFill(kinds: readonly { a: number; left: number }[], cap: number, kerf: number): number[] {
  let best: number[] = kinds.map(() => 0);
  let bestUsed = -1;
  const openers = kinds.map((_, i) => i).filter((i) => kinds[i]!.left > 0).slice(0, 12);
  for (const opener of openers) {
    const take = kinds.map(() => 0);
    let used = -kerf;
    for (const i of [opener, ...kinds.map((_, i) => i).filter((i) => i !== opener)]) {
      const k = kinds[i]!;
      while (take[i]! < k.left && used + kerf + k.a <= cap) {
        take[i]! += 1;
        used += kerf + k.a;
      }
    }
    if (used > bestUsed) {
      best = take;
      bestUsed = used;
    }
  }
  return best;
}

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));

/**
 * The same, exact: a bounded knapsack for the fullest fill. Each item costs
 * its size plus a kerf, against `cap` plus a kerf.
 */
function exactFill(kinds: readonly { a: number; left: number }[], cap: number, kerf: number): number[] {
  const take = kinds.map(() => 0);
  const live = kinds
    .map((k, i) => ({ i, cost: k.a + kerf, n: Math.min(k.left, Math.floor((cap + kerf) / (k.a + kerf))) }))
    .filter((k) => k.n > 0);
  if (live.length === 0) return take;
  // In units of the sizes' common divisor: usually 1/16 inch or coarser, so the table stays small.
  const g = live.reduce((acc, k) => gcd(acc, k.cost), 0);
  const size = Math.floor((cap + kerf) / g);
  // Binary chunks turn each bounded kind into a few 0/1 items.
  const chunks: { kind: number; n: number; w: number }[] = [];
  for (const k of live) {
    let left = k.n;
    for (let m = 1; left > 0; m *= 2) {
      const n = Math.min(m, left);
      chunks.push({ kind: k.i, n, w: (n * k.cost) / g });
      left -= n;
    }
  }
  // by[c]: the chunk that first reached c (-1: not reachable).
  const by = new Int32Array(size + 1).fill(-1);
  const prev = new Int32Array(size + 1);
  by[0] = chunks.length;
  chunks.forEach((chunk, j) => {
    for (let c = size; c >= chunk.w; c--) {
      if (by[c] === -1 && by[c - chunk.w] !== -1) {
        by[c] = j;
        prev[c] = c - chunk.w;
      }
    }
  });
  let c = size;
  while (c > 0 && by[c] === -1) c--;
  while (c > 0) {
    const chunk = chunks[by[c]!]!;
    take[chunk.kind]! += chunk.n;
    c = prev[c]!;
  }
  return take;
}

/**
 * How a run of bins (strip lengths, sheet widths) is filled. `greedy` and
 * `exact` fill one bin as full as they can, then repeat it while the pieces
 * last (repeats make patterns); `bfd` is best-fit decreasing, item by item.
 */
export type Fill = 'greedy' | 'exact' | 'bfd';

/** How many times a pattern (counts per kind) can repeat from what's left. */
function repeats(take: readonly number[], left: readonly number[]): number {
  let n = Infinity;
  take.forEach((k, i) => {
    if (k > 0) n = Math.min(n, Math.floor(left[i]! / k));
  });
  return n === Infinity ? 0 : n;
}

/** Bins of capacity `cap` holding every item: each bin is a count per kind. Kinds come longest first. */
function binsOf(kinds: readonly { a: number; left: number }[], cap: number, kerf: number, fill: Fill): number[][] {
  const left = kinds.map((k) => k.left);
  const bins: number[][] = [];
  if (fill === 'bfd') {
    const room: number[] = [];
    kinds.forEach((k, i) => {
      for (let q = 0; q < left[i]!; q++) {
        let best = -1;
        for (let b = 0; b < bins.length; b++) {
          if (room[b]! >= k.a + kerf && (best < 0 || room[b]! < room[best]!)) best = b;
        }
        if (best < 0) {
          bins.push(kinds.map(() => 0));
          room.push(cap + kerf);
          best = bins.length - 1;
        }
        bins[best]![i]! += 1;
        room[best]! -= k.a + kerf;
      }
    });
    return bins;
  }
  const one = fill === 'greedy' ? greedyFill : exactFill;
  while (left.some((n) => n > 0)) {
    const take = one(
      kinds.map((k, i) => ({ a: k.a, left: left[i]! })),
      cap,
      kerf,
    );
    if (take.every((n) => n === 0)) break;
    const n = Math.max(1, repeats(take, left));
    take.forEach((k, i) => (left[i]! -= k * n));
    for (let r = 0; r < n; r++) bins.push(take);
  }
  return bins;
}

export interface StripItem {
  type: number;
  rotated: boolean;
  a: number;
  c: number;
  left: number;
}

/** Time mode's pieces, each turned (where it may turn) so widths across the strips repeat as much as possible. */
export function stripItems(types: readonly PackType[], env: Env, frame: Frame): StripItem[] {
  const [ua, uc] = usable(env, frame);
  const fits = (a: number, c: number) => a <= ua && c <= uc;
  const freq = new Map<number, number>();
  types.forEach((t) => {
    for (const rotated of t.canRotate ? EITHER : NOT_TURNED) {
      const [a, c] = dims(t, rotated, frame);
      if (fits(a, c)) freq.set(c, (freq.get(c) ?? 0) + t.count);
    }
  });
  const items: StripItem[] = [];
  types.forEach((t, type) => {
    if (t.count === 0) return;
    let pick: { rotated: boolean; a: number; c: number } | null = null;
    for (const rotated of t.canRotate ? EITHER : NOT_TURNED) {
      const [a, c] = dims(t, rotated, frame);
      if (!fits(a, c)) continue;
      if (!pick || (freq.get(c) ?? 0) > (freq.get(pick.c) ?? 0)) pick = { rotated, a, c };
    }
    if (pick) items.push({ type, ...pick, left: t.count });
  });
  return items;
}

export interface StripPlan {
  frame: Frame;
  /**
   * The widths ripped as strips. A piece of another width rides in the next
   * wider strip and is trimmed to width, so every width is set on the fence
   * at one stage only.
   */
  widths: readonly number[];
  /** How strip lengths and sheet widths are filled. */
  stripFill: Fill;
  sheetFill: Fill;
}

interface Strip {
  c: number;
  items: readonly StripItem[];
  take: readonly number[];
  key: string;
}

/**
 * Time mode: rip strips of a few widths, crosscut them, trim the pieces that
 * ride in a wider strip; repeat identical strips and identical sheets as often
 * as possible.
 */
export function packStrips(types: readonly PackType[], env: Env, plan: StripPlan): SheetPlan[] {
  const { frame } = plan;
  const [ua, uc] = usable(env, frame);
  const kerf = env.kerf;
  const items = stripItems(types, env, frame);
  if (items.length === 0) return [];
  const widths = [...new Set(plan.widths)].sort((x, y) => x - y);
  const stripOf = (c: number) => widths.find((w) => w >= c) ?? c;

  // Strips, widest first; in each, the longest pieces first.
  const byStrip = new Map<number, StripItem[]>();
  for (const it of items) {
    const w = stripOf(it.c);
    const list = byStrip.get(w);
    if (list) list.push(it);
    else byStrip.set(w, [it]);
  }
  const strips: Strip[] = [];
  for (const width of [...byStrip.keys()].sort((x, y) => y - x)) {
    const own = byStrip.get(width)!.sort((x, y) => y.a - x.a || y.c - x.c || x.type - y.type);
    for (const take of binsOf(own, ua, kerf, plan.stripFill)) {
      const key = `${width}:${own.map((it, k) => (take[k] ? `${it.type}x${take[k]};` : '')).join('')}`;
      strips.push({ c: width, items: own, take, key });
    }
  }

  // Sheets: strips stacked across, identical sheets repeated.
  const kinds = new Map<string, { strip: Strip; left: number }>();
  for (const s of strips) {
    const k = kinds.get(s.key);
    if (k) k.left += 1;
    else kinds.set(s.key, { strip: s, left: 1 });
  }
  const list = [...kinds.values()].sort((x, y) => y.strip.c - x.strip.c || (x.strip.key < y.strip.key ? -1 : 1));
  const stripNode = (s: Strip): { node: PSplit; area: number } => {
    const children: PNode[] = [];
    let area = 0;
    s.items.forEach((it, k) => {
      for (let q = 0; q < s.take[k]!; q++) {
        area += types[it.type]!.area;
        const piece: PLeaf = { t: 'p', type: it.type, rotated: it.rotated, a: it.a, c: it.c };
        children.push(it.c === s.c ? piece : { t: 's', dir: 1, a: it.a, c: s.c, depth: 3, children: [piece] });
      }
    });
    return { node: { t: 's', dir: 0, a: ua, c: s.c, depth: 2, children }, area };
  };
  const bins = binsOf(
    list.map((k) => ({ a: k.strip.c, left: k.left })),
    uc,
    kerf,
    plan.sheetFill,
  );
  // Identical sheets next to each other, so they read as one pattern.
  const order = bins.map((take, i) => ({ take, i, key: take.join(',') }));
  const firstSeen = new Map<string, number>();
  for (const o of order) if (!firstSeen.has(o.key)) firstSeen.set(o.key, o.i);
  order.sort((x, y) => firstSeen.get(x.key)! - firstSeen.get(y.key)! || x.i - y.i);
  return order.map(({ take }) => {
    const children: PNode[] = [];
    let area = 0;
    list.forEach((k, i) => {
      for (let q = 0; q < take[i]!; q++) {
        const s = stripNode(k.strip);
        children.push(s.node);
        area += s.area;
      }
    });
    return { frame, root: { t: 's', dir: 1, a: ua, c: uc, depth: 1, children }, area };
  });
}

// ---------------------------------------------------------------------------
// Measuring a plan
// ---------------------------------------------------------------------------

export interface Measure {
  sheets: number;
  area: number;
  fenceSettings: number;
  crosscutStops: number;
  patterns: number;
  cuts: number;
  largestKeepable: number;
  keepable: number;
}

function extentAlong(node: PNode, dir: 0 | 1): number {
  return dir === 0 ? node.a : node.c;
}

/** A sheet's identity: same signature, same sheet. */
export function signature(plan: SheetPlan): string {
  const walk = (n: PNode): string =>
    n.t === 'p' ? `${n.type}${n.rotated ? 'r' : ''}` : `(${n.dir}${n.a}x${n.c}:${n.children.map(walk).join(',')})`;
  return `${plan.frame}${walk(plan.root)}`;
}

/** Stats a search compares plans by. Settings and offcuts are counted per pattern; cuts per sheet. */
export function measure(plans: readonly SheetPlan[], env: Env): Measure {
  const settings = new Map<string, Set<number>>();
  const seen = new Map<string, number>();
  let cuts = 0;
  let area = 0;
  let largestKeepable = 0;
  let keepable = 0;
  const keep = (x: number, y: number) =>
    (x >= env.keepLength && y >= env.keepWidth) || (x >= env.keepWidth && y >= env.keepLength);

  for (const plan of plans) {
    area += plan.area;
    const sig = signature(plan);
    const repeat = seen.has(sig);
    seen.set(sig, (seen.get(sig) ?? 0) + 1);
    const walk = (n: PNode) => {
      if (n.t === 'p') return;
      const extent = extentAlong(n, n.dir);
      const other = extentAlong(n, n.dir === 0 ? 1 : 0);
      let used = -env.kerf;
      for (const ch of n.children) used += env.kerf + extentAlong(ch, n.dir);
      const rest = extent - used;
      const count = n.children.length - 1 + (rest > 0 ? 1 : 0);
      cuts += count;
      if (!repeat) {
        // Cuts run along a when children stack along c (dir 1).
        const runsAlongX = (n.dir === 1) === (plan.frame === 'length');
        const key = `${runsAlongX ? 'x' : 'y'}${n.depth}`;
        let set = settings.get(key);
        if (!set) settings.set(key, (set = new Set()));
        n.children.forEach((ch, i) => {
          if (i < n.children.length - 1 || rest > 0) set.add(extentAlong(ch, n.dir));
        });
        const left = rest - env.kerf;
        if (left > 0 && keep(left, other)) {
          keepable += 1;
          largestKeepable = Math.max(largestKeepable, left * other);
        }
      }
      for (const ch of n.children) walk(ch);
    };
    walk(plan.root);
  }
  let fenceSettings = 0;
  let crosscutStops = 0;
  for (const [key, set] of settings) {
    if (key.startsWith('x')) fenceSettings += set.size;
    else crosscutStops += set.size;
  }
  return { sheets: plans.length, area, fenceSettings, crosscutStops, patterns: seen.size, cuts, largestKeepable, keepable };
}

/** Lexicographic: lower is better. */
export function compareScores(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - y[i]!;
    if (d !== 0) return d;
  }
  return 0;
}

/** Cost: fewest sheets, then the largest keepable offcut, then fewest cuts. */
export const costScore = (m: Measure) => [m.sheets, -m.largestKeepable, m.cuts];
/** Time: fewest fence settings, crosscut stops, patterns and cuts; then sheets. */
export const timeScore = (m: Measure) => [m.fenceSettings, m.crosscutStops, m.patterns, m.cuts, m.sheets];
