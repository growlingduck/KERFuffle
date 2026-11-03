import type { PartFeature } from '../types';
import type { Ticks } from '../units';
import { measure, signature, type Env, type PackType, type PNode, type SheetPlan } from './pack';
import type { Cut, CutNode, CutStage, LayoutStats, Offcut, Piece, Placement, PlacedFeature, SheetPattern } from './types';

const tk = (n: number) => n as Ticks;

/**
 * A feature's rectangle on the sheet. Part coordinates: u along the part's
 * length, v along its width, v = width at the front edge. Unturned, u runs
 * along x; turned a quarter turn, (u, v) → (width − v, u).
 */
export function placeFeature(f: PartFeature, px: number, py: number, partLength: number, partWidth: number, rotated: boolean): PlacedFeature {
  const start = f.corner.startsWith('start');
  const front = f.corner.endsWith('front');
  const u0 = start ? 0 : partLength - f.length;
  const v0 = front ? partWidth - f.width : 0;
  const u1 = u0 + f.length;
  const v1 = v0 + f.width;
  if (!rotated) return { kind: f.kind, x: tk(px + u0), y: tk(py + v0), length: tk(f.length), width: tk(f.width), part: f };
  return { kind: f.kind, x: tk(px + partWidth - v1), y: tk(py + u0), length: tk(v1 - v0), width: tk(u1 - u0), part: f };
}

export interface LineInfo {
  mark: string;
  lineKey: string;
  name: string;
  visible: boolean;
  grainLocked: boolean;
  features: readonly PartFeature[];
}

interface Built {
  cutTree: CutNode;
  cuts: Cut[];
  placements: Placement[];
  offcuts: Offcut[];
  /** Type of each placement, in order. */
  types: number[];
}

/** Sheet coordinates of a plan: walk the tree, place pieces, number the cuts. */
function build(plan: SheetPlan, types: readonly PackType[], lines: readonly LineInfo[], env: Env, trim: number): Built {
  const placements: Placement[] = [];
  const offcuts: Offcut[] = [];
  const order: number[] = [];
  const pending: { cut: Omit<Cut, 'n'>; seq: number }[] = [];
  const keep = (x: number, y: number) =>
    (x >= env.keepLength && y >= env.keepWidth) || (x >= env.keepWidth && y >= env.keepLength);
  // Frame → sheet: with the first cuts along the length, a is x and c is y.
  const toSheet = (a: number, c: number, ea: number, ec: number) =>
    plan.frame === 'length' ? { x: a, y: c, length: ea, width: ec } : { x: c, y: a, length: ec, width: ea };
  let seq = 0;

  const walk = (n: PNode, a0: number, c0: number): CutNode => {
    if (n.t === 'p') {
      const r = toSheet(a0, c0, n.a, n.c);
      const t = types[n.type]!;
      const info = lines[n.type]!;
      placements.push({
        mark: info.mark,
        lineKey: info.lineKey,
        name: info.name,
        x: tk(r.x),
        y: tk(r.y),
        length: tk(r.length),
        width: tk(r.width),
        rotated: n.rotated,
        partLength: tk(t.length),
        partWidth: tk(t.width),
        visible: info.visible,
        grainLocked: info.grainLocked,
        features: info.features.map((f) => placeFeature(f, r.x, r.y, t.length, t.width, n.rotated)),
      });
      order.push(n.type);
      return { kind: 'piece', x: tk(r.x), y: tk(r.y), length: tk(r.length), width: tk(r.width), placement: placements.length - 1 };
    }
    const r = toSheet(a0, c0, n.a, n.c);
    // Children stack along a (dir 0) or c (dir 1); the cuts between them run the other way.
    const stackAxis: 'x' | 'y' = (n.dir === 0) === (plan.frame === 'length') ? 'x' : 'y';
    const along: 'x' | 'y' = stackAxis === 'x' ? 'y' : 'x';
    const extent = n.dir === 0 ? n.a : n.c;
    const start = n.dir === 0 ? a0 : c0;
    const lineFrom = stackAxis === 'x' ? r.y : r.x;
    const lineTo = lineFrom + (stackAxis === 'x' ? r.width : r.length);
    const children: CutNode[] = [];
    const cutIds: number[] = [];
    let pos = start;
    n.children.forEach((ch, i) => {
      const thick = n.dir === 0 ? ch.a : ch.c;
      children.push(walk(ch, n.dir === 0 ? pos : a0, n.dir === 0 ? c0 : pos));
      pos += thick;
      const last = i === n.children.length - 1;
      if (!last || pos < start + extent) {
        const stage: CutStage = n.depth >= 3 ? 'trim' : along === 'x' ? 'rip' : 'crosscut';
        // In frame terms the kerf starts at `pos` on the stacking axis; on the sheet that's x or y.
        const at = pos;
        pending.push({
          cut: { stage, depth: n.depth, along, at: tk(at), from: tk(lineFrom), to: tk(lineTo), setting: tk(thick) },
          seq: seq++,
        });
        cutIds.push(pending.length - 1);
      }
      pos += env.kerf;
    });
    const left = start + extent - pos;
    if (left > 0) {
      const oa = n.dir === 0 ? pos : a0;
      const oc = n.dir === 0 ? c0 : pos;
      const o = toSheet(oa, oc, n.dir === 0 ? left : n.a, n.dir === 0 ? n.c : left);
      offcuts.push({ x: tk(o.x), y: tk(o.y), length: tk(o.length), width: tk(o.width), keepable: keep(o.length, o.width) });
      children.push({ kind: 'offcut', x: tk(o.x), y: tk(o.y), length: tk(o.length), width: tk(o.width), offcut: offcuts.length - 1 });
    }
    return { kind: 'split', x: tk(r.x), y: tk(r.y), length: tk(r.length), width: tk(r.width), axis: stackAxis, depth: n.depth, children, cuts: cutIds };
  };

  const cutTree = walk(plan.root, trim, trim);
  // Cut order: every first-stage cut, then the second stage strip by strip, and so on.
  const sorted = pending.map((p, i) => ({ ...p, i })).sort((x, y) => x.cut.depth - y.cut.depth || x.seq - y.seq);
  const number = new Map<number, number>();
  const cuts: Cut[] = sorted.map((p, k) => {
    number.set(p.i, k);
    return { n: k + 1, ...p.cut };
  });
  const renumber = (node: CutNode) => {
    if (node.kind !== 'split') return;
    node.cuts = node.cuts.map((i) => number.get(i)!);
    node.children.forEach(renumber);
  };
  renumber(cutTree);
  return { cutTree, cuts, placements, offcuts, types: order };
}

/** Identical sheets merged into patterns, numbered pattern by pattern; each sheet's pieces taken in cabinet order. */
export function toPatterns(
  plans: readonly SheetPlan[],
  types: readonly PackType[],
  lines: readonly LineInfo[],
  pieces: readonly (readonly Piece[])[],
  env: Env,
  trim: number,
  sheetArea: number,
): SheetPattern[] {
  const groups = new Map<string, SheetPlan[]>();
  for (const plan of plans) {
    const sig = signature(plan);
    const list = groups.get(sig);
    if (list) list.push(plan);
    else groups.set(sig, [plan]);
  }
  const queues = pieces.map((list) => [...list]);
  const patterns: SheetPattern[] = [];
  let sheet = 0;
  for (const list of groups.values()) {
    const built = build(list[0]!, types, lines, env, trim);
    const area = built.placements.reduce((s, p) => s + p.partLength * p.partWidth, 0);
    patterns.push({
      id: patterns.length + 1,
      count: list.length,
      firstCut: list[0]!.frame,
      placements: built.placements,
      cutTree: built.cutTree,
      cuts: built.cuts,
      offcuts: built.offcuts,
      sheets: list.map(() => ({ number: ++sheet, pieceIds: built.types.map((t) => queues[t]!.shift()!.id) })),
      yieldPercent: round1((100 * area) / sheetArea),
    });
  }
  return patterns;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function statsOf(plans: readonly SheetPlan[], patterns: readonly SheetPattern[], env: Env, sheetArea: number): LayoutStats {
  const m = measure(plans, env);
  const pieces = patterns.reduce((s, p) => s + p.count * p.placements.length, 0);
  return {
    sheets: m.sheets,
    pieces,
    yieldPercent: m.sheets === 0 ? 0 : round1((100 * m.area) / (m.sheets * sheetArea)),
    fenceSettings: m.fenceSettings,
    crosscutStops: m.crosscutStops,
    patterns: m.patterns,
    cuts: m.cuts,
    keepableOffcuts: patterns.reduce((s, p) => s + p.count * p.offcuts.filter((o) => o.keepable).length, 0),
  };
}
