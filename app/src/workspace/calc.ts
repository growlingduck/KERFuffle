import { calculateParts, hasErrors } from '@kerfuffle/engine';
import type { CabinetSpec, CalculationResult, ConstructionRules, Part, PartRole, Ticks, ValidationIssue } from '@kerfuffle/engine';
import { cabinetSpec } from '../data/jobSession';
import type { CabinetRecord } from '../data/types';
import type { DimensionField } from './commands';

/**
 * Memoized engine results. calculateParts is pure, so a result is reused for
 * as long as the same spec meets the same rules object. Typing in one field
 * recalculates one cabinet; the rest of the job comes from the cache.
 */

/** Cache entries per rules object before it's emptied (a long session of typing). */
const MAX_ENTRIES = 4000;
const cache = new WeakMap<ConstructionRules, Map<string, CalculationResult>>();

function specKey(spec: CabinetSpec): string {
  return `${spec.id}\u0000${spec.type}|${spec.width}|${spec.height}|${spec.depth}|${spec.shelfCount}|${spec.finishedEnds}|${spec.quantity}|${spec.fixedShelfCount ?? 0}|${spec.midNailer === true}|${spec.splitBack === true}`;
}

export function calculate(spec: CabinetSpec, rules: ConstructionRules): CalculationResult {
  let byRules = cache.get(rules);
  if (!byRules) {
    byRules = new Map();
    cache.set(rules, byRules);
  }
  const key = specKey(spec);
  let result = byRules.get(key);
  if (!result) {
    if (byRules.size >= MAX_ENTRIES) byRules.clear();
    result = calculateParts(spec, rules);
    byRules.set(key, result);
  }
  return result;
}

/** A dimension being typed but not committed yet. `value` is null while the text doesn't parse. */
export interface Draft {
  cabinetId: string;
  field: DimensionField;
  value: Ticks | null;
  /** The parser's message while `value` is null. */
  message?: string;
}

export interface Evaluation {
  spec: CabinetSpec;
  parts: readonly Part[];
  issues: readonly ValidationIssue[];
  /** No errors: parts and drawing are shown. */
  valid: boolean;
  byRole: Partial<Record<PartRole, Part>>;
}

/** A cabinet as the screen shows it right now: committed values plus anything being typed. */
export function evaluateCabinet(cabinet: CabinetRecord, rules: ConstructionRules, draft: Draft | null = null): Evaluation {
  const live = draft && draft.cabinetId === cabinet.id ? draft : null;
  const spec = cabinetSpec(cabinet);
  if (live && live.value !== null) spec[live.field] = live.value;
  const result = calculate(spec, rules);
  let issues: readonly ValidationIssue[] = result.issues;
  if (live && live.value === null) {
    issues = [{ field: live.field, severity: 'error', message: live.message ?? 'Enter a size, like 23 3/4' }, ...issues];
  }
  const valid = !hasErrors(issues);
  const parts = valid ? result.parts : [];
  return { spec, parts, issues, valid, byRole: Object.fromEntries(parts.map((p) => [p.role, p])) };
}

export type FieldKey = DimensionField | 'shelfCount' | 'fixedShelfCount' | 'splitBack' | 'quantity' | 'label' | 'run';

/** Where an engine issue is shown: the field the user would change to fix it. */
export function issueField(issue: ValidationIssue): FieldKey | null {
  switch (issue.field) {
    case 'width':
    case 'height':
    case 'depth':
    case 'shelfCount':
    case 'fixedShelfCount':
    case 'splitBack':
    case 'quantity':
      return issue.field;
    case 'id':
      return 'label';
    // "Shelf setback leaves no shelf": fixed by making the cabinet deeper.
    case 'shelfSetback':
      return 'depth';
    case 'shelfThickness':
      return 'shelfCount';
    default:
      return null;
  }
}

export function issueFor(issues: readonly ValidationIssue[], field: FieldKey, severity: 'error' | 'warning'): string | undefined {
  return issues.find((i) => i.severity === severity && issueField(i) === field)?.message;
}

/** The first field with an error, in the editor's order. For "Go to width". */
export function firstInvalidField(issues: readonly ValidationIssue[]): FieldKey | null {
  const order: FieldKey[] = ['width', 'height', 'depth', 'shelfCount', 'fixedShelfCount', 'splitBack', 'quantity', 'label'];
  const bad = new Set(issues.filter((i) => i.severity === 'error').map(issueField));
  return order.find((f) => bad.has(f)) ?? (bad.size > 0 ? 'width' : null);
}
