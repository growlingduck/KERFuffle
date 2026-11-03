import { ALGORITHM_VERSION, cutListFor, type LayoutInput } from './layout';
import { groupByMaterial } from './pieces';

/**
 * A cache key for a layout: a hash of everything the layout reads (each
 * piece's mark, size, cabinet, visibility and features; each material's size
 * and grain), the saw profile, the mode and seed, and ALGORITHM_VERSION.
 * Anything else (prices, names of things not on the sheet) doesn't change it.
 */
export function layoutKey(input: LayoutInput): string {
  const cutList = cutListFor(input);
  const { groups, unplaced } = groupByMaterial(cutList, input.materials);
  const { mode, seed, iterations } = input.options;
  const p = input.profile;
  const parts: unknown[] = [
    ALGORITHM_VERSION,
    mode,
    seed,
    iterations ?? null,
    [p.kerf, p.edgeTrim, p.minPiece, p.keepLength, p.keepWidth, p.firstCut, p.extraSheets],
    groups.map(({ material: m, lines }) => [
      m.id,
      m.name,
      m.length,
      m.width,
      m.grain,
      lines.map((l) => [l.key, l.mark, l.name, l.length, l.width, l.visible, l.features ?? [], l.refs.map((r) => [r.cabinetId, r.quantity])]),
    ]),
    unplaced.map((u) => [u.piece.id, u.reason]),
  ];
  return hash(JSON.stringify(parts));
}

/**
 * What each material's layout is cut from, by material id: a hash of its
 * pieces (mark, size, cabinet, visibility, features), its sheet size and
 * grain, and the seed. The saw profile, the mode and ALGORITHM_VERSION are
 * left out: a saved layout keeps those itself, so the app can say which of
 * them changed. "Cut list changed" is this hash changing.
 */
export function materialInputKeys(input: LayoutInput): Record<string, string> {
  const { groups } = groupByMaterial(cutListFor(input), input.materials);
  const keys: Record<string, string> = {};
  for (const { material: m, lines } of groups) {
    keys[m.id] = hash(
      JSON.stringify([
        input.options.seed,
        input.options.iterations ?? null,
        [m.id, m.length, m.width, m.grain],
        lines.map((l) => [l.key, l.mark, l.name, l.length, l.width, l.visible, l.features ?? [], l.refs.map((r) => [r.cabinetId, r.quantity])]),
      ]),
    );
  }
  return keys;
}

/** cyrb53-style: two 32-bit lanes, 16 hex digits. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h2) + hex(h1);
}
