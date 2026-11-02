import { backThicknessOf, featureNote, hasErrors, listedJobParts } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, ListedCabinet, Part, Ticks } from '@kerfuffle/engine';
import { cabinetSpec } from '../data/jobSession';
export { withConstruction } from '../data/rules';
import type { CabinetRecord, JobStatus } from '../data/types';
import { displayInches } from '../lib/dimensions';
import { calculate } from './calc';

/**
 * Choosing how a job is built: in the New job dialog, and in the workspace
 * while the job is a draft. One place for what a choice does to the rules and
 * what it does to the cut list.
 */

/** Whether the construction can still change: only while the job is a draft. */
export function constructionLocked(status: JobStatus): boolean {
  return status !== 'draft';
}

export const LOCKED_REASON = 'Locked once the job is ready to cut. Duplicate the job to try another method.';

export interface ConstructionDiff {
  changed: number;
  added: number;
  removed: number;
}

/** Every part in the job, keyed so the same part can be found under other rules. */
function jobPartMap(cabinets: readonly CabinetRecord[], rules: ConstructionRules): Map<string, Part> {
  const out = new Map<string, Part>();
  const listed: ListedCabinet[] = [];
  const keep = (prefix: string, parts: readonly Part[]) => {
    const seen = new Map<string, number>();
    for (const part of parts) {
      const n = seen.get(part.role) ?? 0;
      seen.set(part.role, n + 1);
      out.set(`${prefix}|${part.role}#${n}`, part);
    }
  };
  cabinets.forEach((cabinet, index) => {
    const spec = cabinetSpec(cabinet);
    const result = calculate(spec, rules);
    if (hasErrors(result.issues)) return;
    listed.push({ index, cabinet: spec });
    keep(`c${index}`, result.parts);
  });
  const shared = listedJobParts(listed, rules).parts;
  const byRef = new Map<string, Part[]>();
  for (const { part } of shared) byRef.set(part.cabinetId, [...(byRef.get(part.cabinetId) ?? []), part]);
  for (const [ref, parts] of byRef) keep(`j${ref}`, parts);
  return out;
}

const same = (a: Part, b: Part) =>
  a.length === b.length &&
  a.width === b.width &&
  a.thickness === b.thickness &&
  a.quantity === b.quantity &&
  featureNote(a.features ?? []) === featureNote(b.features ?? []);

/** How many of the job's parts a change of rules changes, adds and removes. */
export function diffConstruction(cabinets: readonly CabinetRecord[], before: ConstructionRules, after: ConstructionRules): ConstructionDiff {
  const a = jobPartMap(cabinets, before);
  const b = jobPartMap(cabinets, after);
  let changed = 0;
  let added = 0;
  let removed = 0;
  for (const [key, part] of b) {
    const was = a.get(key);
    if (!was) added += 1;
    else if (!same(was, part)) changed += 1;
  }
  for (const key of a.keys()) if (!b.has(key)) removed += 1;
  return { changed, added, removed };
}

/** "12 parts changed, 4 added, 2 removed", or "No parts changed". */
export function diffText({ changed, added, removed }: ConstructionDiff): string {
  const bits: string[] = [];
  if (changed > 0) bits.push(`${changed} ${changed === 1 ? 'part' : 'parts'} changed`);
  if (added > 0) bits.push(bits.length === 0 ? `${added} ${added === 1 ? 'part' : 'parts'} added` : `${added} added`);
  if (removed > 0) bits.push(bits.length === 0 ? `${removed} ${removed === 1 ? 'part' : 'parts'} removed` : `${removed} removed`);
  return bits.length === 0 ? 'No parts changed' : bits.join(', ');
}


const BACK_WORDS = { applied: 'Applied', dado: 'Inset in a dado', rabbet: 'Inset in a rabbet' } as const;

/**
 * The method's settings in words, for the rules panels: only the ones this
 * construction uses, and on wall cabinets only the ones walls use.
 */
export function methodRows(rules: ConstructionRules, type: CabinetType | 'any' = 'any'): [string, string][] {
  const m = rules.method;
  const show = (value: Ticks) => displayInches(value);
  const base = type !== 'wall';
  const rows: [string, string][] = [[`Back`, `${BACK_WORDS[m.backType]}, ${show(backThicknessOf(rules))}`]];
  if (m.backType !== 'applied') rows.push(['Nailer', show(m.nailerWidth)]);
  if (!base) return rows;
  rows.push(['Base top', m.baseTop === 'full' ? 'Full panel' : `Two ${show(m.stretcherWidth)} stretchers`]);
  rows.push(['Kick depth', show(m.kickDepth)]);
  if (m.id === 'A' && !m.listBase) rows.push(['Base', 'Not on the cut list (job made before construction methods)']);
  else if (m.id === 'A' && m.baseType === 'ladder') {
    rows.push(['Ladder base', `Sleepers ≤ ${show(m.sleeperSpacingMax)} apart, platforms ≤ ${show(m.platformLengthMax)}`]);
  } else if (m.id === 'A') {
    rows.push(['Legs', `${m.legsPerBox} per box, ${m.legsPerWideBox} over ${show(m.legWidthThreshold)}`]);
  }
  return rows;
}
