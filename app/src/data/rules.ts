import { applyConstructionChoice, constructionChoiceOf, DEFAULT_METHOD, DEFAULT_RULES, upgradeVersion1Rules } from '@kerfuffle/engine';
import type { ConstructionChoice, ConstructionRules, MethodSettings } from '@kerfuffle/engine';
import { StorageError } from './errors';

/** Version of the ConstructionRules JSON stored with each job (`RULES_VERSION` in Rust). */
export const RULES_VERSION = 3;

type RuleKey = Exclude<keyof ConstructionRules, 'method'>;
type MethodKey = keyof MethodSettings;

const BOOLEAN_FIELDS: readonly string[] = ['legacyWallBackDeductsBaseAllowances', 'legacyWallLaminateDeductsBaseAllowances', 'listBase'];
const ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
  shelfThickComparison: ['gt', 'gte'],
  id: ['A', 'B'],
  backType: ['applied', 'dado', 'rabbet'],
  baseTop: ['full', 'stretchers'],
  baseType: ['ladder', 'legs'],
};
/** Lengths that may be null ("same as the panels"). */
const NULLABLE_FIELDS: readonly string[] = ['backThickness'];

const RULE_KEYS = (Object.keys(DEFAULT_RULES) as (keyof ConstructionRules)[]).filter((k): k is RuleKey => k !== 'method');
/** Rules added in version 3; older snapshots don't have them. */
const ADDED_IN_3: readonly RuleKey[] = ['tallFixedShelfAbove'];
const METHOD_KEYS = Object.keys(DEFAULT_METHOD) as MethodKey[];

/**
 * Read a stored rules snapshot. When a rule field is added, bump RULES_VERSION
 * and upgrade older snapshots here with the value that reproduces their old
 * behavior, never the current shop default.
 *
 * - Version 1 had no construction method. It is upgraded to method A1 with the
 *   base left off (`listBase: false`), which gives exactly the parts it always did.
 * - Version 2 adds the `method` block.
 * - Version 3 adds `tallFixedShelfAbove`, the tall-cabinet rule. It only sets
 *   how many fixed shelves a new tall cabinet starts with, and older jobs have
 *   no tall cabinets, so they get the shop default (72″): no part changes.
 */
export function parseRules(raw: unknown, version: number): ConstructionRules {
  if (version > RULES_VERSION) {
    throw new StorageError(
      'newerDatabase',
      'This job was saved by a newer version of KERFuffle. Update KERFuffle to open it.',
    );
  }
  if (!Number.isSafeInteger(version) || version < 1 || typeof raw !== 'object' || raw === null) {
    throw corrupt(`rules version ${version}`);
  }
  const source = raw as Record<string, unknown>;
  const keys = version < 3 ? RULE_KEYS.filter((k) => !ADDED_IN_3.includes(k)) : RULE_KEYS;
  const rules = {
    ...(version < 3 ? { tallFixedShelfAbove: DEFAULT_RULES.tallFixedShelfAbove } : {}),
    ...readFields(source, keys, 'rule'),
  } as Omit<ConstructionRules, 'method'>;
  if (version === 1) return upgradeVersion1Rules(rules);
  if (typeof source.method !== 'object' || source.method === null) throw corrupt('rule method is missing');
  const method = readFields(source.method as Record<string, unknown>, METHOD_KEYS, 'method setting') as unknown as MethodSettings;
  return { ...rules, method };
}

/**
 * Read the shop's default rules. The shop setting has no version of its own:
 * one saved before construction methods has no `method` block, and new jobs
 * made from it get the default method, base listed. One saved before tall
 * cabinets has no `tallFixedShelfAbove` and gets the default.
 */
export function parseShopRules(raw: unknown): ConstructionRules {
  const hasMethod = typeof raw === 'object' && raw !== null && 'method' in raw;
  // Saved before tall cabinets: it gains the default fixed-shelf rule.
  const hasTall = typeof raw === 'object' && raw !== null && 'tallFixedShelfAbove' in raw;
  if (hasMethod) return parseRules(raw, hasTall ? RULES_VERSION : 2);
  return { ...parseRules(raw, 1), method: { ...DEFAULT_METHOD } };
}

function readFields(source: Record<string, unknown>, keys: readonly string[], what: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    const allowed = ENUM_FIELDS[key];
    const ok = BOOLEAN_FIELDS.includes(key)
      ? typeof value === 'boolean'
      : allowed
        ? typeof value === 'string' && allowed.includes(value)
        : Number.isSafeInteger(value) || (value === null && NULLABLE_FIELDS.includes(key));
    if (!ok) throw corrupt(`${what} ${key} is ${JSON.stringify(value)}`);
    out[key] = value;
  }
  return out;
}

function corrupt(detail: string): StorageError {
  return new StorageError(
    'corrupt',
    'This job’s construction settings couldn’t be read. Restore a backup from Settings.',
    detail,
  );
}

/**
 * The rules with another construction. Every other setting is kept, so going
 * back restores them. A job made before construction methods never listed its
 * base; choosing a construction for it on purpose lists it from now on.
 */
export function withConstruction(rules: ConstructionRules, choice: ConstructionChoice): ConstructionRules {
  if (constructionChoiceOf(rules.method) === choice && rules.method.listBase) return rules;
  return { ...rules, method: { ...applyConstructionChoice(rules.method, choice), listBase: true } };
}
