import { inches, type CutList, type CutListLine, type Material, type PartFeature, type Ticks } from '../../src/index';

let serial = 0;

export interface LineSpec {
  mark?: string;
  name?: string;
  /** Inches. */
  length: number;
  width: number;
  quantity: number;
  material: Material | null;
  visible?: boolean;
  features?: PartFeature[];
  /** Cabinet labels, each taking an equal share; default one cabinet "C1". */
  refs?: string[];
  category?: CutListLine['category'];
}

/** A cut-list line built by hand, with only what the optimizer reads filled in meaningfully. */
export function line(spec: LineSpec): CutListLine {
  serial += 1;
  const length = inches(spec.length);
  const width = inches(spec.width);
  const refs = spec.refs ?? ['C1'];
  const share = Math.floor(spec.quantity / refs.length);
  const counts = refs.map((cabinetId, i) => ({ cabinetId, quantity: share + (i < spec.quantity - share * refs.length ? 1 : 0) }));
  const mark = spec.mark ?? `P${serial}`;
  return {
    key: `test|${mark}|${length}|${width}|${spec.material?.id ?? '-'}`,
    mark,
    category: spec.category ?? 'panel',
    names: [spec.name ?? 'Part'],
    name: spec.name ?? 'Part',
    roles: ['side-left'],
    length,
    width,
    thickness: spec.material?.thickness ?? inches(3 / 4),
    quantity: spec.quantity,
    refs: counts.filter((r) => r.quantity > 0),
    optional: false,
    grain: 'vertical',
    slots: ['box'],
    material: spec.material,
    banding: 0 as Ticks,
    visible: spec.visible ?? false,
    ...(spec.features ? { features: spec.features } : {}),
  };
}

/** A cut list holding just these lines (the optimizer reads only `lines`). */
export function cutListOf(lines: CutListLine[]): CutList {
  return {
    options: { mode: 'merged', includeFronts: true, sort: { key: 'length', dir: 'desc' } },
    groups: [],
    sections: [],
    runSections: [],
    lines,
    blocked: [],
    jobIssues: [],
    materialIssues: [],
    hardware: [],
    totals: { boxes: 0, panelPieces: lines.reduce((n, l) => n + l.quantity, 0), laminatePieces: 0, distinctCuts: lines.length },
  };
}
