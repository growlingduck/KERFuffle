import { hasErrors, listedJobParts, runOf, runRef, traceDependencies } from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules, DependencyMap, ListedCabinet, Part, TraceKey, ValidationIssue } from '@kerfuffle/engine';
import { cabinetSpec } from '../data/jobSession';
import type { CabinetRecord } from '../data/types';
import { calculate } from './calc';
import type { Evaluation } from './calc';

/**
 * The base a cabinet stands on, when the job's construction lists one that
 * isn't the cabinet's own part: method A1's ladder base, shared by a run or
 * the cabinet's own platform. Kick boards (methods A2 and B) are cabinet parts
 * and come from the cabinet's own parts list.
 */
export interface CabinetBase {
  /** The run's name; null for the cabinet's own platform. */
  run: string | null;
  /** "Run: Sink wall", or the cabinet label. */
  ref: string;
  /** Labels of the cabinets standing on it, in list order (a run can hold several). */
  cabinets: string[];
  parts: Part[];
  /** Warnings and errors about this platform (a shallow cabinet, mixed depths). */
  issues: ValidationIssue[];
}

/** The job's valid cabinets as the engine lists them, with `live` in place of one of them. */
function listedCabinets(cabinets: readonly CabinetRecord[], rules: ConstructionRules, liveId: string | null, live: CabinetSpec | null): ListedCabinet[] {
  const listed: ListedCabinet[] = [];
  cabinets.forEach((cabinet, index) => {
    const spec = cabinet.id === liveId && live ? live : cabinetSpec(cabinet);
    if (!hasErrors(calculate(spec, rules).issues)) listed.push({ index, cabinet: spec });
  });
  return listed;
}

function platformParts(listed: readonly ListedCabinet[], rules: ConstructionRules, index: number, run: string | null) {
  const result = listedJobParts(listed, rules);
  const ref = run === null ? null : runRef(run);
  const parts = result.parts.filter((p) => (run === null ? p.cabinetIndex === index : p.part.run === run)).map((p) => p.part);
  const ownRef = listed.find((c) => c.index === index)?.cabinet.id;
  const issues = result.issues.filter((i) => i.ref === (ref ?? ownRef)).map((i) => i.issue);
  return { parts, issues };
}

/**
 * The base under one cabinet, from the whole job (a run's length depends on
 * every cabinet in it). `evaluation` supplies sizes being typed. Null when the
 * construction lists no separate base parts, or the cabinet isn't valid.
 */
export function cabinetBase(cabinets: readonly CabinetRecord[], rules: ConstructionRules, cabinetId: string, evaluation: Evaluation | null): CabinetBase | null {
  const index = cabinets.findIndex((c) => c.id === cabinetId);
  const cabinet = cabinets[index];
  if (!cabinet || cabinet.type !== 'base' || !evaluation?.valid) return null;
  const listed = listedCabinets(cabinets, rules, cabinetId, evaluation.spec);
  const run = runOf(cabinet);
  const { parts, issues } = platformParts(listed, rules, index, run);
  if (parts.length === 0 && issues.length === 0) return null;
  const members = run === null ? [cabinet] : cabinets.filter((c) => c.type === 'base' && runOf(c) === run);
  return {
    run,
    ref: run === null ? (cabinet.label.trim() || 'Unnamed') : runRef(run),
    cabinets: members.map((c) => c.label.trim() || 'Unnamed'),
    parts,
    issues,
  };
}

/**
 * What a trace key moves, on the cabinet's own parts and on the base it
 * stands on, for the job's construction method (derived by nudging, so every
 * method traces correctly).
 */
export function traceMap(
  key: TraceKey,
  cabinets: readonly CabinetRecord[],
  rules: ConstructionRules,
  cabinetId: string,
  evaluation: Evaluation,
): DependencyMap {
  if (!evaluation.valid) return {};
  const own = traceDependencies(key, { spec: evaluation.spec, rules }, ({ spec, rules: r }) => {
    const result = calculate(spec, r);
    return hasErrors(result.issues) ? null : result.parts;
  });
  const index = cabinets.findIndex((c) => c.id === cabinetId);
  const cabinet = cabinets[index];
  if (!cabinet || cabinet.type !== 'base') return own;
  const run = runOf(cabinet);
  const shared = traceDependencies(key, { spec: evaluation.spec, rules }, ({ spec, rules: r }) => {
    if (hasErrors(calculate(spec, r).issues)) return null;
    return platformParts(listedCabinets(cabinets, r, cabinetId, spec), r, index, run).parts;
  });
  return { ...shared, ...own };
}
