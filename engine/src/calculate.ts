import { methodOf, type JobPartsResult, type ListedCabinet } from './methods';
import { inRoleOrder } from './parts';
import type { CabinetSpec, CalculationResult, ConstructionRules, Part } from './types';
import { hasErrors, validate } from './validate';

export { PART_NAMES, PART_ORDER, ROLE_ORDER } from './parts';

/**
 * Turn a cabinet and construction rules into a parts list.
 *
 * Pure and deterministic. If validation finds any error, returns no parts and
 * the issues. The job's construction method decides which parts there are;
 * the box sizes come from one shared calculator (methods/box.ts). Dimensions
 * use `length` for the grain-wise direction: vertical for back, sides, front
 * and laminate; side to side for top, bottom, shelves and base parts.
 */
export function calculateParts(spec: CabinetSpec, rules: ConstructionRules): CalculationResult {
  const issues = validate(spec, rules);
  if (hasErrors(issues)) return { parts: [], issues };

  const parts = inRoleOrder(methodOf(rules).parts[spec.type](spec, rules));

  // Validation should make this unreachable; it guards against a formula
  // change that slips past it.
  const bad = parts.find(noSize);
  if (bad) return { parts: [], issues: [...issues, noSizeIssue(bad)] };

  return { parts, issues };
}

/**
 * Parts the job's cabinets share, such as method A1's ladder base for each
 * run. Cabinets with validation errors are left out, as on the cut list.
 */
export function jobParts(cabinets: readonly CabinetSpec[], rules: ConstructionRules): JobPartsResult {
  const listed: ListedCabinet[] = [];
  cabinets.forEach((cabinet, index) => {
    if (!hasErrors(validate(cabinet, rules))) listed.push({ index, cabinet });
  });
  return listedJobParts(listed, rules);
}

/** jobParts for cabinets already known to be valid. */
export function listedJobParts(listed: readonly ListedCabinet[], rules: ConstructionRules): JobPartsResult {
  if (listed.length === 0) return { parts: [], issues: [] };
  const result = methodOf(rules).jobParts?.(listed, rules) ?? { parts: [], issues: [] };
  const bad = result.parts.find(({ part }) => noSize(part));
  if (bad) {
    return {
      parts: result.parts.filter(({ part }) => part.cabinetId !== bad.part.cabinetId),
      issues: [...result.issues, { ref: bad.part.cabinetId, issue: noSizeIssue(bad.part) }],
    };
  }
  return result;
}

const noSize = (part: Part) => part.length <= 0 || part.width <= 0 || (part.thickness !== null && part.thickness <= 0);

function noSizeIssue(part: Part) {
  return {
    field: 'width',
    severity: 'error',
    message: `These sizes produce a ${part.name.toLowerCase()} with no size. Check the dimensions and rules.`,
  } as const;
}
