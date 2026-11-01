import { DEFAULT_RULES } from '@kerfuffle/engine';
import type { ConstructionRules } from '@kerfuffle/engine';
import { StorageError } from './errors';

/** Version of the ConstructionRules JSON stored with each job (`RULES_VERSION` in Rust). */
export const RULES_VERSION = 1;

type RuleKey = keyof ConstructionRules;

const BOOLEAN_FIELDS: readonly RuleKey[] = ['legacyWallBackDeductsBaseAllowances', 'legacyWallLaminateDeductsBaseAllowances'];
const ENUM_FIELDS: Partial<Record<RuleKey, readonly string[]>> = { shelfThickComparison: ['gt', 'gte'] };
const RULE_KEYS = Object.keys(DEFAULT_RULES) as RuleKey[];

/**
 * Read a stored rules snapshot. Version 1 is the current shape. When a rule field
 * is added, bump RULES_VERSION and upgrade older snapshots here with the value
 * that reproduces their old behavior, never the current shop default.
 */
export function parseRules(raw: unknown, version: number): ConstructionRules {
  if (version > RULES_VERSION) {
    throw new StorageError(
      'newerDatabase',
      'This job was saved by a newer version of KERFuffle. Update KERFuffle to open it.',
    );
  }
  if (version !== RULES_VERSION || typeof raw !== 'object' || raw === null) {
    throw corrupt(`rules version ${version}`);
  }
  const source = raw as Record<string, unknown>;
  const rules: Record<string, unknown> = {};
  for (const key of RULE_KEYS) {
    const value = source[key];
    const allowed = ENUM_FIELDS[key];
    const ok = BOOLEAN_FIELDS.includes(key)
      ? typeof value === 'boolean'
      : allowed
        ? typeof value === 'string' && allowed.includes(value)
        : Number.isSafeInteger(value);
    if (!ok) throw corrupt(`rule ${key} is ${JSON.stringify(value)}`);
    rules[key] = value;
  }
  return rules as unknown as ConstructionRules;
}

function corrupt(detail: string): StorageError {
  return new StorageError(
    'corrupt',
    'This job’s construction settings couldn’t be read. Restore a backup from Settings.',
    detail,
  );
}
