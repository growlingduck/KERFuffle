import type { CabinetSpec, CabinetType, ConstructionRules, Part, PartRole } from './types';
import { ticks } from './units';

/**
 * Linked tracing (interaction-design §5.5): which part dimensions move when an
 * input moves. The workspace uses this to tint the affected cells and parts.
 *
 * Keys are cabinet inputs (`w h box toe ctop d shelves fixed ends qty`) and
 * construction rules (`p cl sb wide lam`). `box` is the box height, which the
 * user changes through the overall height.
 *
 * engine/test/dependencies.test.ts derives every entry by nudging the input by
 * 1/64″ and checking which part dimensions change, so this map can't drift
 * from the formulas in calculate.ts.
 */
export type TraceKey =
  | 'w'
  | 'h'
  | 'box'
  | 'toe'
  | 'ctop'
  | 'd'
  | 'shelves'
  | 'fixed'
  | 'ends'
  | 'qty'
  | 'p'
  | 'cl'
  | 'sb'
  | 'wide'
  | 'lam';

export const TRACE_KEYS: readonly TraceKey[] = ['w', 'h', 'box', 'toe', 'ctop', 'd', 'shelves', 'fixed', 'ends', 'qty', 'p', 'cl', 'sb', 'wide', 'lam'];

/** A part's Length, Width, Thickness or Quantity, or its Features (method B's kick notch). */
export type PartField = 'L' | 'W' | 'T' | 'qty' | 'F';

export type DependencyMap = Readonly<Partial<Record<PartRole, readonly PartField[]>>>;

const BOX_HEIGHT: DependencyMap = {
  back: ['L'],
  'side-left': ['L'],
  'side-right': ['L'],
  front: ['L'],
  'laminate-side-left': ['L'],
  'laminate-side-right': ['L'],
  'laminate-front': ['L'],
};

const EVERY_QUANTITY: DependencyMap = {
  back: ['qty'],
  bottom: ['qty'],
  'side-left': ['qty'],
  'side-right': ['qty'],
  top: ['qty'],
  front: ['qty'],
  shelf: ['qty'],
  'laminate-side-left': ['qty'],
  'laminate-side-right': ['qty'],
  'laminate-front': ['qty'],
};

/** Dependencies for a base cabinet with the shop rules. */
export const DEPENDENCIES: Readonly<Record<TraceKey, DependencyMap>> = {
  w: { back: ['W'], bottom: ['L'], top: ['L'], front: ['W'], shelf: ['L'], 'laminate-front': ['W'] },
  h: BOX_HEIGHT,
  box: BOX_HEIGHT,
  toe: BOX_HEIGHT,
  ctop: BOX_HEIGHT,
  d: {
    bottom: ['W'],
    'side-left': ['W'],
    'side-right': ['W'],
    top: ['W'],
    shelf: ['W'],
    'laminate-side-left': ['W'],
    'laminate-side-right': ['W'],
  },
  shelves: { shelf: ['qty'] },
  // Fixed shelves are tall-cabinet only (see TALL_EXTRA).
  fixed: {},
  ends: { 'laminate-side-left': ['qty'], 'laminate-side-right': ['qty'] },
  qty: EVERY_QUANTITY,
  // Bottom and top stop at the back (D − p), so p moves their width too.
  p: {
    back: ['T'],
    bottom: ['L', 'W', 'T'],
    'side-left': ['W', 'T'],
    'side-right': ['W', 'T'],
    top: ['L', 'W', 'T'],
    front: ['T'],
    shelf: ['L', 'W'],
  },
  cl: { shelf: ['L'] },
  sb: { shelf: ['W'] },
  wide: { shelf: ['T'] },
  lam: {
    'laminate-side-left': ['L', 'W'],
    'laminate-side-right': ['L', 'W'],
    'laminate-front': ['L', 'W'],
  },
};

const NONE: DependencyMap = {};

/** What a tall cabinet's fixed shelves add: sized like the bottom, but stopping at the back. */
const TALL_EXTRA: Readonly<Partial<Record<TraceKey, DependencyMap>>> = {
  w: { 'fixed-shelf': ['L'] },
  d: { 'fixed-shelf': ['W'] },
  fixed: { 'fixed-shelf': ['qty'] },
  qty: { 'fixed-shelf': ['qty'] },
  p: { 'fixed-shelf': ['L', 'W', 'T'] },
};

/**
 * What a trace key moves on a cabinet of this type. Wall cabinets use their
 * full height, so toe kick and countertop move nothing on them. Tall cabinets
 * have no countertop; the toe kick moves their box height as on a base.
 */
export function dependenciesFor(key: TraceKey, type: CabinetType): DependencyMap {
  switch (type) {
    case 'wall':
      return key === 'toe' || key === 'ctop' ? NONE : DEPENDENCIES[key];
    case 'tall':
      return key === 'ctop' ? NONE : { ...DEPENDENCIES[key], ...TALL_EXTRA[key] };
    case 'base':
      return DEPENDENCIES[key];
  }
}

// ---------------------------------------------------------------------------
// Derived tracing: what a key moves under any construction method
// ---------------------------------------------------------------------------

/** One cabinet and the rules it is built with. */
export interface TraceCase {
  spec: CabinetSpec;
  rules: ConstructionRules;
}

/** Parts for a case, or null when the case doesn't calculate (an invalid nudge). */
export type TraceParts = (c: TraceCase) => readonly Part[] | null;

/** Keys whose input is a size: nudged both ways, and only what moves both ways counts. */
const SIZE_KEYS: ReadonlySet<TraceKey> = new Set(['w', 'h', 'box', 'toe', 'ctop', 'd', 'p', 'cl', 'sb', 'wide', 'lam']);

const nudge = (value: number, step: 1 | -1) => ticks(value + step);

/** Move one input by the smallest step (one tick), or flip it for finished ends. */
export function perturb(key: TraceKey, { spec, rules }: TraceCase, step: 1 | -1 = 1): TraceCase {
  const withRules = (patch: Partial<ConstructionRules>) => ({ spec, rules: { ...rules, ...patch } });
  const withSpec = (patch: Partial<CabinetSpec>) => ({ spec: { ...spec, ...patch }, rules });
  switch (key) {
    case 'w':
      return withSpec({ width: nudge(spec.width, step) });
    // Box height has no input of its own: it moves with the overall height.
    case 'h':
    case 'box':
      return withSpec({ height: nudge(spec.height, step) });
    case 'd':
      return withSpec({ depth: nudge(spec.depth, step) });
    case 'toe':
      return withRules({ toeKickHeight: nudge(rules.toeKickHeight, step) });
    case 'ctop':
      return withRules({ countertopThickness: nudge(rules.countertopThickness, step) });
    case 'p':
      return withRules({ panelThickness: nudge(rules.panelThickness, step) });
    case 'cl':
      return withRules({ shelfClearancePerSide: nudge(rules.shelfClearancePerSide, step) });
    case 'sb':
      return withRules({ shelfSetback: nudge(rules.shelfSetback, step) });
    // The wide-shelf rule picks between two thicknesses; nudge both.
    case 'wide':
      return withRules({ shelfThickness: nudge(rules.shelfThickness, step), wideShelfThickness: nudge(rules.wideShelfThickness, step) });
    case 'lam':
      return withRules({ laminateOversizePerEdge: nudge(rules.laminateOversizePerEdge, step) });
    case 'shelves':
      return withSpec({ shelfCount: spec.shelfCount + 1 });
    case 'fixed':
      return withSpec({ fixedShelfCount: (spec.fixedShelfCount ?? 0) + 1 });
    case 'qty':
      return withSpec({ quantity: spec.quantity + 1 });
    case 'ends': {
      const flipped = { none: 'both', both: 'none', left: 'right', right: 'left' } as const;
      return withSpec({ finishedEnds: flipped[spec.finishedEnds] });
    }
  }
}

const FIELD_ORDER: readonly PartField[] = ['L', 'W', 'T', 'qty', 'F'];

function featureKey(part: Part): string {
  return (part.features ?? []).map((f) => `${f.kind}:${f.corner}:${f.length}x${f.width}`).join(',');
}

/** Parts by role, numbered when a role repeats (a split platform has two front rails). */
function byPart(parts: readonly Part[]): Map<string, Part> {
  const seen = new Map<PartRole, number>();
  const out = new Map<string, Part>();
  for (const part of parts) {
    const n = seen.get(part.role) ?? 0;
    seen.set(part.role, n + 1);
    out.set(`${part.role}#${n}`, part);
  }
  return out;
}

/** Which fields moved between two parts lists, by role. A part that appears or goes counts as quantity. */
function moved(before: readonly Part[], after: readonly Part[]): Map<PartRole, Set<PartField>> {
  const a = byPart(before);
  const b = byPart(after);
  const out = new Map<PartRole, Set<PartField>>();
  const mark = (role: PartRole, field: PartField) => {
    let fields = out.get(role);
    if (!fields) out.set(role, (fields = new Set()));
    fields.add(field);
  };
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const pa = a.get(key);
    const pb = b.get(key);
    const role = (pa ?? pb)!.role;
    if (!pa || !pb) {
      mark(role, 'qty');
      continue;
    }
    if (pa.length !== pb.length) mark(role, 'L');
    if (pa.width !== pb.width) mark(role, 'W');
    if (pa.thickness !== pb.thickness) mark(role, 'T');
    if (pa.quantity !== pb.quantity) mark(role, 'qty');
    if (featureKey(pa) !== featureKey(pb)) mark(role, 'F');
  }
  return out;
}

/**
 * What a trace key moves on this cabinet with these rules, found the way
 * engine/test/dependencies.test.ts checks the fixed map: nudge the input by
 * one tick and see which part fields change. Works for every method, and for
 * parts a run shares when `partsOf` returns them.
 *
 * Sizes are nudged both ways and only fields that move both ways count, so a
 * cabinet sitting exactly on a threshold (the wide-shelf width) doesn't light
 * up the shelf thickness. Where one way is invalid (a setback of 0 can't go
 * lower), the other way decides.
 */
export function traceDependencies(key: TraceKey, base: TraceCase, partsOf: TraceParts): DependencyMap {
  const before = partsOf(base);
  if (!before) return {};
  const steps: (1 | -1)[] = SIZE_KEYS.has(key) ? [1, -1] : [1];
  let result: Map<PartRole, Set<PartField>> | null = null;
  for (const step of steps) {
    const after = partsOf(perturb(key, base, step));
    if (!after) continue;
    const found = moved(before, after);
    if (result === null) {
      result = found;
      continue;
    }
    for (const [role, fields] of result) {
      const other = found.get(role);
      for (const field of fields) if (!other?.has(field)) fields.delete(field);
      if (fields.size === 0) result.delete(role);
    }
  }
  if (!result) return {};
  return Object.fromEntries([...result].map(([role, fields]) => [role, FIELD_ORDER.filter((f) => fields.has(f))]));
}
