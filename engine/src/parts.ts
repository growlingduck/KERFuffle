import type { CabinetSpec, Part, PartCategory, PartFeature, PartRole } from './types';
import type { Ticks } from './units';

/** Every part role, in cut-list order: box panels, base parts, then laminate. */
export const ROLE_ORDER: readonly PartRole[] = [
  'back',
  'bottom',
  'side-left',
  'side-right',
  'top',
  'stretcher-front',
  'stretcher-back',
  'nailer',
  'kick-board',
  'front',
  'shelf',
  'fixed-shelf',
  'base-rail-front',
  'base-rail-back',
  'base-sleeper',
  'kick-skin',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
];

/** The parts of a standard box (method A, applied back, full top), in order. */
export const PART_ORDER: readonly PartRole[] = [
  'back',
  'bottom',
  'side-left',
  'side-right',
  'top',
  'front',
  'shelf',
  'laminate-side-left',
  'laminate-side-right',
  'laminate-front',
];

export const PART_NAMES: Readonly<Record<PartRole, string>> = {
  back: 'Back',
  bottom: 'Bottom',
  'side-left': 'Left side',
  'side-right': 'Right side',
  top: 'Top',
  'stretcher-front': 'Front stretcher',
  'stretcher-back': 'Back stretcher',
  nailer: 'Nailer',
  'kick-board': 'Kick board',
  front: 'Front (door/laminate size)',
  shelf: 'Shelf',
  'fixed-shelf': 'Fixed shelf',
  'base-rail-front': 'Base rail, front',
  'base-rail-back': 'Base rail, back',
  'base-sleeper': 'Base sleeper',
  'kick-skin': 'Kick skin',
  'laminate-side-left': 'Laminate, left side',
  'laminate-side-right': 'Laminate, right side',
  'laminate-front': 'Laminate, front',
};

const ROLE_RANK: ReadonlyMap<PartRole, number> = new Map(ROLE_ORDER.map((role, i) => [role, i]));

export function roleRank(role: PartRole): number {
  return ROLE_RANK.get(role) ?? ROLE_ORDER.length;
}

/** Parts in cut-list order. Stable, so parts of one role keep their order. */
export function inRoleOrder(parts: readonly Part[]): Part[] {
  return [...parts].sort((a, b) => roleRank(a.role) - roleRank(b.role));
}

export interface PartSize {
  category: PartCategory;
  length: Ticks;
  width: Ticks;
  thickness: Ticks | null;
  optional?: boolean;
  features?: PartFeature[];
}

/** A part of one cabinet: `perCabinet` is multiplied by the cabinet quantity. */
export function cabinetPart(spec: CabinetSpec, role: PartRole, size: PartSize, perCabinet: number): Part {
  const part: Part = {
    cabinetId: spec.id,
    role,
    category: size.category,
    name: PART_NAMES[role],
    length: size.length,
    width: size.width,
    thickness: size.thickness,
    quantity: perCabinet * spec.quantity,
    optional: size.optional ?? false,
  };
  if (size.features && size.features.length > 0) part.features = size.features;
  return part;
}
