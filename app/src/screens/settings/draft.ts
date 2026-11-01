import { calculateParts, DEFAULT_RULES, inches, ticks } from '@kerfuffle/engine';
import type { CabinetSpec, ConstructionRules, Part, PartRole, ShelfThickComparison, Ticks, ValidationIssue } from '@kerfuffle/engine';
import type { BackupSettings, RoundTo } from '../../data/types';
import { displayInches } from '../../lib/dimensions';

/**
 * The Settings screen's working copy: what's saved, what's on screen, and
 * everything derived from the two (what changed, what's wrong, what a rule
 * does). Pure, so the rules of the screen are tested without rendering it.
 */

/** The rules the shop sets on this screen. The legacy-reproduction flags are not among them. */
export type RuleField =
  | 'panelThickness'
  | 'toeKickHeight'
  | 'countertopThickness'
  | 'shelfThickness'
  | 'wideShelfThickness'
  | 'shelfThickWidthThreshold'
  | 'shelfClearancePerSide'
  | 'shelfSetback'
  | 'laminateOversizePerEdge';

/** Detail drawings A–F (interaction-design §8). */
export type DetailKey = 'panel' | 'toeKick' | 'countertop' | 'clearance' | 'setback' | 'laminate' | 'wide';

export interface RuleRow {
  field: RuleField;
  label: string;
  help: string;
  detail: DetailKey;
}

export const RULE_GROUPS: readonly { label: string; rows: readonly RuleRow[] }[] = [
  { label: 'Panels', rows: [{ field: 'panelThickness', label: 'Panel thickness', help: 'Backs, sides, top, bottom and front.', detail: 'panel' }] },
  {
    label: 'Base allowances',
    rows: [
      { field: 'toeKickHeight', label: 'Toe-kick height', help: 'Base cabinets only.', detail: 'toeKick' },
      { field: 'countertopThickness', label: 'Countertop thickness', help: 'Base cabinets only.', detail: 'countertop' },
    ],
  },
  {
    label: 'Shelves',
    rows: [
      { field: 'shelfThickness', label: 'Shelf thickness', help: 'Shelves in narrower cabinets.', detail: 'wide' },
      { field: 'wideShelfThickness', label: 'Wide-shelf thickness', help: 'Shelves in wide cabinets.', detail: 'wide' },
      { field: 'shelfThickWidthThreshold', label: 'Wide-shelf cabinet width', help: 'Cabinet width where wide shelves start.', detail: 'wide' },
      { field: 'shelfClearancePerSide', label: 'Shelf clearance, each side', help: 'Gap at each end; the shelf loses twice this. 0 is allowed.', detail: 'clearance' },
      { field: 'shelfSetback', label: 'Shelf setback', help: 'How far shelves sit back from the front. 0 is allowed.', detail: 'setback' },
    ],
  },
  {
    label: 'Laminate',
    rows: [{ field: 'laminateOversizePerEdge', label: 'Laminate oversize, each edge', help: 'Extra past every edge, trimmed after gluing.', detail: 'laminate' }],
  },
];

export const RULE_FIELDS: readonly RuleField[] = RULE_GROUPS.flatMap((g) => g.rows.map((r) => r.field));

/** Every field validation can point at on this screen. */
export type SettingsField = RuleField | 'shelfThickComparison';

/** The built-in defaults "Reset" goes back to. */
export const BUILT_IN_RULES: Readonly<ConstructionRules> = DEFAULT_RULES;

/**
 * The cabinet the draft rules are checked and demonstrated on: a standard
 * 30″ × 34 1/2″ × 24″ base with one shelf and both ends finished.
 */
export const REFERENCE_CABINET: CabinetSpec = Object.freeze({
  id: 'Test',
  type: 'base',
  width: inches(30),
  height: inches(34.5),
  depth: inches(24),
  shelfCount: 1,
  finishedEnds: 'both',
  quantity: 1,
});

export const MIN_KEEP = 1;
export const MAX_KEEP = 365;

export interface SettingsValues {
  rules: ConstructionRules;
  roundTo: RoundTo;
  backups: BackupSettings;
}

export interface SettingsDraft {
  saved: SettingsValues;
  current: SettingsValues;
  /** Rule fields whose text doesn't read as a size yet; `current` keeps their last good value. */
  unparsed: ReadonlySet<RuleField>;
  /** Bumped when every input must show `current` again (Discard, load). */
  generation: number;
  /** Bumped per field by Reset, so only that input shows the default again. */
  resets: Readonly<Partial<Record<RuleField, number>>>;
}

export type DraftAction =
  | { type: 'loaded'; values: SettingsValues }
  | { type: 'rule'; field: RuleField; value: Ticks | null }
  | { type: 'comparison'; value: ShelfThickComparison }
  | { type: 'roundTo'; value: RoundTo }
  | { type: 'keep'; value: number }
  | { type: 'folder'; value: string | null }
  | { type: 'reset'; field: RuleField }
  | { type: 'discard' }
  /** Some or all of `current` is now stored. */
  | { type: 'saved'; part: Partial<SettingsValues> };

export function createDraft(values: SettingsValues): SettingsDraft {
  return { saved: values, current: values, unparsed: new Set(), generation: 0, resets: {} };
}

const withRule = (values: SettingsValues, patch: Partial<ConstructionRules>): SettingsValues => ({
  ...values,
  rules: { ...values.rules, ...patch },
});

function without(set: ReadonlySet<RuleField>, field: RuleField): ReadonlySet<RuleField> {
  if (!set.has(field)) return set;
  const next = new Set(set);
  next.delete(field);
  return next;
}

export function draftReducer(draft: SettingsDraft, action: DraftAction): SettingsDraft {
  switch (action.type) {
    case 'loaded':
      return { ...createDraft(action.values), generation: draft.generation + 1 };
    case 'rule': {
      if (action.value === null) {
        if (draft.unparsed.has(action.field)) return draft;
        return { ...draft, unparsed: new Set(draft.unparsed).add(action.field) };
      }
      const unparsed = without(draft.unparsed, action.field);
      if (draft.current.rules[action.field] === action.value && unparsed === draft.unparsed) return draft;
      return { ...draft, unparsed, current: withRule(draft.current, { [action.field]: action.value }) };
    }
    case 'comparison':
      return { ...draft, current: withRule(draft.current, { shelfThickComparison: action.value }) };
    case 'roundTo':
      return { ...draft, current: { ...draft.current, roundTo: action.value } };
    case 'keep':
      return { ...draft, current: { ...draft.current, backups: { ...draft.current.backups, keep: action.value } } };
    case 'folder':
      return { ...draft, current: { ...draft.current, backups: { ...draft.current.backups, folder: action.value } } };
    case 'reset':
      return {
        ...draft,
        unparsed: without(draft.unparsed, action.field),
        current: withRule(draft.current, { [action.field]: BUILT_IN_RULES[action.field] }),
        resets: { ...draft.resets, [action.field]: (draft.resets[action.field] ?? 0) + 1 },
      };
    case 'discard':
      return { ...draft, current: draft.saved, unparsed: new Set(), generation: draft.generation + 1 };
    case 'saved': {
      const saved = { ...draft.saved, ...action.part };
      return { ...draft, saved };
    }
  }
}

/** Names of the settings that differ from what's saved, for the dirty bar. */
export function changedSettings(draft: SettingsDraft): string[] {
  const { saved, current } = draft;
  const changed: string[] = [];
  for (const field of RULE_FIELDS) {
    if (saved.rules[field] !== current.rules[field] || draft.unparsed.has(field)) changed.push(field);
  }
  if (saved.rules.shelfThickComparison !== current.rules.shelfThickComparison) changed.push('shelfThickComparison');
  if (saved.roundTo !== current.roundTo) changed.push('roundTo');
  if (saved.backups.keep !== current.backups.keep) changed.push('keep');
  if ((saved.backups.folder ?? null) !== (current.backups.folder ?? null)) changed.push('folder');
  return changed;
}

export const isDirty = (draft: SettingsDraft): boolean => changedSettings(draft).length > 0;

export const rulesChanged = (draft: SettingsDraft): boolean =>
  RULE_FIELDS.some((f) => draft.saved.rules[f] !== draft.current.rules[f]) ||
  draft.saved.rules.shelfThickComparison !== draft.current.rules.shelfThickComparison;

export const backupsChanged = (draft: SettingsDraft): boolean =>
  draft.saved.backups.keep !== draft.current.backups.keep || (draft.saved.backups.folder ?? null) !== (draft.current.backups.folder ?? null);

/** Differs from the built-in default (the "◆ Changed from 3/4″" mark). */
export function differsFromDefault(rules: ConstructionRules, field: RuleField): boolean {
  return rules[field] !== BUILT_IN_RULES[field];
}

// ---------------------------------------------------------------------------
// Validation: the engine, on the reference cabinet
// ---------------------------------------------------------------------------

/**
 * Cabinet-size messages come from the rules that cause them. When several
 * rules could, the message goes to the ones that were changed.
 */
const CAUSES: Partial<Record<keyof CabinetSpec, readonly RuleField[]>> = {
  width: ['panelThickness', 'shelfClearancePerSide'],
  depth: ['panelThickness', 'shelfSetback'],
  height: ['toeKickHeight', 'countertopThickness'],
};

export type FieldIssues = Partial<Record<SettingsField, ValidationIssue[]>>;

/** The engine's issues for the draft rules, by the field they belong beside. */
export function ruleIssues(draft: SettingsDraft): FieldIssues {
  const { rules } = draft.current;
  const { issues } = calculateParts(REFERENCE_CABINET, rules);
  const byField: FieldIssues = {};
  const add = (field: SettingsField, issue: ValidationIssue) => (byField[field] ??= []).push(issue);
  for (const issue of issues) {
    if (issue.field === 'shelfThickComparison' || (RULE_FIELDS as readonly string[]).includes(issue.field)) {
      add(issue.field as SettingsField, issue);
      continue;
    }
    const causes = CAUSES[issue.field as keyof CabinetSpec] ?? ['panelThickness'];
    const changed = causes.filter((f) => rules[f] !== draft.saved.rules[f]);
    const message = `On a 30″ × 34 1/2″ × 24″ base: ${issue.message}`;
    for (const field of changed.length > 0 ? changed : causes.slice(0, 1)) add(field, { ...issue, message });
  }
  return byField;
}

export function hasRuleErrors(issues: FieldIssues): boolean {
  return Object.values(issues).some((list) => list?.some((i) => i.severity === 'error'));
}

export function keepIsValid(keep: number): boolean {
  return Number.isInteger(keep) && keep >= MIN_KEEP && keep <= MAX_KEEP;
}

/** Save is allowed only with changes, every field readable, and no engine errors. */
export function canSave(draft: SettingsDraft, issues: FieldIssues = ruleIssues(draft)): boolean {
  return isDirty(draft) && draft.unparsed.size === 0 && !hasRuleErrors(issues) && keepIsValid(draft.current.backups.keep);
}

// ---------------------------------------------------------------------------
// Effect lines: what a rule does, computed by the engine
// ---------------------------------------------------------------------------

function parts(spec: CabinetSpec, rules: ConstructionRules): Partial<Record<PartRole, Part>> | null {
  const result = calculateParts(spec, rules);
  if (result.parts.length === 0) return null;
  return Object.fromEntries(result.parts.map((p) => [p.role, p]));
}

/** The two cabinets either side of the wide-shelf switch: [wide, narrow]. */
export function wideShelfPair(rules: ConstructionRules): [CabinetSpec, CabinetSpec] {
  const t = rules.shelfThickWidthThreshold;
  const quarter = inches(0.25);
  const [wide, narrow] = rules.shelfThickComparison === 'gte' ? [t, ticks(Math.max(0, t - quarter))] : [ticks(t + quarter), t];
  return [
    { ...REFERENCE_CABINET, width: wide },
    { ...REFERENCE_CABINET, width: narrow },
  ];
}

/**
 * One line per detail, e.g. `30″ cabinet → shelf 28 1/4″ long`. Every size
 * comes from calculateParts on the reference cabinet with the draft rules.
 * Null when the draft rules don't calculate.
 */
export function effectLine(key: DetailKey, rules: ConstructionRules, roundTo: RoundTo): string | null {
  const show = (v: Ticks) => displayInches(v, roundTo);
  const ref = REFERENCE_CABINET;
  if (key === 'wide') {
    const [wideSpec, narrowSpec] = wideShelfPair(rules);
    const wide = parts(wideSpec, rules)?.shelf;
    const narrow = parts(narrowSpec, rules)?.shelf;
    if (!wide?.thickness || !narrow?.thickness) return null;
    return `${show(wideSpec.width)} cabinet → ${show(wide.thickness)} shelves · ${show(narrowSpec.width)} → ${show(narrow.thickness)}`;
  }
  const p = parts(ref, rules);
  if (!p) return null;
  switch (key) {
    case 'panel':
      return p.bottom ? `${show(ref.width)} cabinet → bottom ${show(p.bottom.length)} long` : null;
    case 'toeKick':
    case 'countertop':
      return p['side-left'] ? `${show(ref.height)} base → box height ${show(p['side-left'].length)}` : null;
    case 'clearance':
      return p.shelf ? `${show(ref.width)} cabinet → shelf ${show(p.shelf.length)} long` : null;
    case 'setback':
      return p.shelf ? `${show(ref.depth)} deep → shelf ${show(p.shelf.width)} wide` : null;
    case 'laminate': {
      const face = p.front;
      const lam = p['laminate-front'];
      return face && lam ? `${show(face.width)} × ${show(face.length)} face → laminate ${show(lam.width)} × ${show(lam.length)}` : null;
    }
  }
}
