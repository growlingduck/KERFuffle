import type { CutList, CutListLine } from '../cutlist';
import type { JobMaterials, Material } from '../materials';
import { formatDimension, type Ticks } from '../units';
import type { Piece, UnplacedPiece } from './types';

/** A cut-list line's pieces, one per unit of quantity, in cabinet order. */
export function expandLine(line: CutListLine, grainLocked: boolean): Piece[] {
  const pieces: Piece[] = [];
  let n = 0;
  for (const ref of line.refs) {
    for (let i = 0; i < ref.quantity; i++) {
      n += 1;
      pieces.push({
        id: `${line.mark}-${n}`,
        mark: line.mark,
        lineKey: line.key,
        name: line.name,
        ref: ref.cabinetId,
        length: line.length,
        width: line.width,
        visible: line.visible,
        grainLocked,
        features: line.features ?? [],
      });
    }
  }
  return pieces;
}

/** The material a line is cut from: its own, or the job's for its first slot. */
export function lineMaterial(line: CutListLine, materials: JobMaterials): Material | null {
  if (line.material) return line.material;
  const slot = line.slots[0];
  return slot ? (materials[slot] ?? null) : null;
}

export interface MaterialGroup {
  material: Material;
  lines: CutListLine[];
}

export interface Grouped {
  groups: MaterialGroup[];
  /** Pieces that can't be laid out on any sheet: no material, no sheet size, or solid stock. */
  unplaced: UnplacedPiece[];
}

export const show = (value: Ticks) => formatDimension(value, { inchMark: false, denominator: 64 }).text;
/** "P1 Side (30 1/2 × 23 1/4)". */
export const describe = (p: Pick<Piece, 'mark' | 'name' | 'length' | 'width'>) =>
  `${p.mark} ${p.name} (${show(p.length)} × ${show(p.width)})`;

const KIND_RANK: Readonly<Record<Material['kind'], number>> = { sheet: 0, laminate: 1, banding: 2, hardware: 3 };

/**
 * Group the cut list's lines by the material they're cut from: sheet goods
 * thinnest first, then laminate, each by name. Lines that can't go on a sheet
 * are reported with the reason.
 */
export function groupByMaterial(cutList: CutList, materials: JobMaterials): Grouped {
  const byId = new Map<string, MaterialGroup>();
  const unplaced: UnplacedPiece[] = [];
  const report = (line: CutListLine, reason: UnplacedPiece['reason'], why: (p: Piece) => string) => {
    for (const piece of expandLine(line, false)) unplaced.push({ piece, reason, message: why(piece) });
  };
  for (const line of cutList.lines) {
    if (line.category === 'lumber') {
      report(line, 'solid-stock', (p) => `${describe(p)} is solid stock, which isn't laid out on sheets yet.`);
      continue;
    }
    const material = lineMaterial(line, materials);
    if (!material) {
      report(line, 'no-material', (p) => `${describe(p)} has no material chosen, so it can't be laid out.`);
      continue;
    }
    if (material.length === null || material.width === null || material.length <= 0 || material.width <= 0) {
      report(line, 'no-sheet-size', (p) => `${describe(p)}: ${material.name} has no sheet size, so it can't be laid out.`);
      continue;
    }
    let group = byId.get(material.id);
    if (!group) byId.set(material.id, (group = { material, lines: [] }));
    group.lines.push(line);
  }
  const groups = [...byId.values()].sort(
    (a, b) =>
      KIND_RANK[a.material.kind] - KIND_RANK[b.material.kind] ||
      (a.material.thickness ?? 0) - (b.material.thickness ?? 0) ||
      a.material.name.localeCompare(b.material.name, 'en') ||
      a.material.id.localeCompare(b.material.id),
  );
  return { groups, unplaced };
}
