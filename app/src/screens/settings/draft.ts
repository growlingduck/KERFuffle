import {
  applyConstructionChoice,
  boxGeometry,
  calculateParts,
  CONSTRUCTION_CHOICES,
  constructionChoiceOf,
  DEFAULT_RULES,
  inches,
  jobParts,
  sleeperCount,
  ticks,
} from '@kerfuffle/engine';
import type {
  BackType,
  BaseTop,
  CabinetSpec,
  ConstructionChoice,
  ConstructionRules,
  MethodSettings,
  JobSlot,
  Part,
  PartRole,
  SawProfile,
  ShelfThickComparison,
  Ticks,
  ValidationIssue,
} from '@kerfuffle/engine';
import { BUILT_IN_ESTIMATE, MAX_WASTE_PERCENT } from '../../data/materials';
import type { EstimateSettings } from '../../data/materials';
import { sawProfileIssues } from '../../data/sawProfiles';
import type { SawLengthField, SawSettings } from '../../data/sawProfiles';
import type { BackupSettings, RoundTo } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import type { GlossaryKey } from '../../lib/glossary';

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

/** Detail drawings A–F (interaction-design §8), and G–K for the construction method. */
export type DetailKey = 'panel' | 'toeKick' | 'countertop' | 'clearance' | 'setback' | 'laminate' | 'wide' | 'construction' | 'back' | 'top' | 'kick' | 'base';

export interface RuleRow {
  field: RuleField;
  label: string;
  help: string;
  detail: DetailKey;
  /** The glossary entry its info tip shows. */
  term: GlossaryKey;
}

export const RULE_GROUPS: readonly { label: string; rows: readonly RuleRow[] }[] = [
  { label: 'Panels', rows: [{ field: 'panelThickness', label: 'Panel thickness', help: 'Backs, sides, top, bottom and front.', detail: 'panel', term: 'panelThickness' }] },
  {
    label: 'Base allowances',
    rows: [
      { field: 'toeKickHeight', label: 'Toe-kick height', help: 'Base cabinets only.', detail: 'toeKick', term: 'toeKick' },
      { field: 'countertopThickness', label: 'Countertop thickness', help: 'Base cabinets only.', detail: 'countertop', term: 'countertop' },
    ],
  },
  {
    label: 'Shelves',
    rows: [
      { field: 'shelfThickness', label: 'Shelf thickness', help: 'Shelves in narrower cabinets.', detail: 'wide', term: 'shelfThickness' },
      { field: 'wideShelfThickness', label: 'Wide-shelf thickness', help: 'Shelves in wide cabinets.', detail: 'wide', term: 'wideShelves' },
      { field: 'shelfThickWidthThreshold', label: 'Wide-shelf cabinet width', help: 'Cabinet width where wide shelves start.', detail: 'wide', term: 'wideShelves' },
      { field: 'shelfClearancePerSide', label: 'Shelf clearance, each side', help: 'Gap at each end; the shelf loses twice this. 0 is allowed.', detail: 'clearance', term: 'shelfClearance' },
      { field: 'shelfSetback', label: 'Shelf setback', help: 'How far shelves sit back from the front. 0 is allowed.', detail: 'setback', term: 'shelfSetback' },
    ],
  },
  {
    label: 'Laminate',
    rows: [{ field: 'laminateOversizePerEdge', label: 'Laminate oversize, each edge', help: 'Extra past every edge, trimmed after gluing.', detail: 'laminate', term: 'laminateOversize' }],
  },
];

export const RULE_FIELDS: readonly RuleField[] = RULE_GROUPS.flatMap((g) => g.rows.map((r) => r.field));

// ---------------------------------------------------------------------------
// Construction method settings (plan §1.3)
// ---------------------------------------------------------------------------

/** Method settings that are sizes. */
export type MethodLengthKey =
  | 'backThickness'
  | 'backGrooveDepth'
  | 'backDadoInset'
  | 'nailerWidth'
  | 'stretcherWidth'
  | 'kickDepth'
  | 'kickSkinThickness'
  | 'sleeperSpacingMax'
  | 'platformLengthMax'
  | 'legWidthThreshold';
/** Method settings that are counts. */
export type MethodCountKey = 'legsPerBox' | 'legsPerWideBox';
export type MethodRowKey = MethodLengthKey | MethodCountKey;
/** Method settings chosen from a list. The method and base type are chosen together, as a construction. */
export type MethodChoiceKey = 'backType' | 'baseTop';

/** A method setting as a draft field (unreadable text, Reset): "method.kickDepth". */
export type MethodDraftField = `method.${MethodLengthKey}`;
/** A saw profile's size as a draft field: "saw.table-saw.kerf". */
export type SawDraftField = `saw.${string}.${SawLengthField}`;
export const sawField = (id: string, field: SawLengthField): SawDraftField => `saw.${id}.${field}`;
export type DraftField = RuleField | MethodDraftField | 'estimate.edgeTrim' | SawDraftField;

export interface MethodRow {
  key: MethodRowKey;
  label: string;
  help: string;
  term: GlossaryKey;
  /** Shown only when the default construction uses it; hidden values are kept. */
  shown: (m: MethodSettings) => boolean;
}

export interface MethodChoiceRow<K extends MethodChoiceKey = MethodChoiceKey> {
  key: K;
  label: string;
  help: string;
  term: GlossaryKey;
  options: readonly [MethodSettings[K], string][];
}

export interface MethodGroup {
  label: 'Back' | 'Top' | 'Toe kick' | 'Base';
  detail: DetailKey;
  choice?: MethodChoiceRow;
  rows: readonly MethodRow[];
  /** The whole group is hidden for constructions that don't use it. */
  shown: (m: MethodSettings) => boolean;
}

const always = () => true;
const inset = (m: MethodSettings) => m.backType !== 'applied';
const ladder = (m: MethodSettings) => m.id === 'A' && m.baseType === 'ladder';
const legs = (m: MethodSettings) => m.id === 'A' && m.baseType === 'legs';

const BACK_CHOICE: MethodChoiceRow<'backType'> = {
  key: 'backType',
  label: 'How the back fits',
  term: 'back',
  help: 'An inset back sits in a groove in the sides, top and bottom, and adds a nailer under the top.',
  options: [
    ['applied', 'Applied, full width'],
    ['dado', 'Inset in a dado'],
    ['rabbet', 'Inset in a rabbet'],
  ] satisfies [BackType, string][],
};

const TOP_CHOICE: MethodChoiceRow<'baseTop'> = {
  key: 'baseTop',
  label: 'Base cabinet top',
  term: 'baseTop',
  help: 'Base cabinets only; wall cabinets always get a full top.',
  options: [
    ['full', 'Full top panel'],
    ['stretchers', 'Two stretchers'],
  ] satisfies [BaseTop, string][],
};

/** Every method setting, grouped (plan §1.3). */
export const METHOD_GROUPS: readonly MethodGroup[] = [
  {
    label: 'Back',
    detail: 'back',
    choice: BACK_CHOICE,
    shown: always,
    rows: [
      { key: 'backThickness', term: 'backThickness', label: 'Back thickness', help: 'A thin back (1/4″) usually goes in a dado or rabbet.', shown: always },
      { key: 'backGrooveDepth', term: 'backGroove', label: 'Groove depth', help: 'How deep the back sits in the sides, top and bottom.', shown: inset },
      { key: 'backDadoInset', term: 'backDadoInset', label: 'Dado in from the back edge', help: 'Dado backs only.', shown: (m) => m.backType === 'dado' },
      { key: 'nailerWidth', term: 'nailer', label: 'Nailer height', help: 'The hanging rail under the top, behind an inset back.', shown: inset },
    ],
  },
  {
    label: 'Top',
    detail: 'top',
    choice: TOP_CHOICE,
    shown: always,
    rows: [{ key: 'stretcherWidth', term: 'baseTop', label: 'Stretcher width', help: 'Front to back, each.', shown: (m) => m.baseTop === 'stretchers' }],
  },
  {
    label: 'Toe kick',
    detail: 'kick',
    shown: always,
    rows: [
      { key: 'kickDepth', term: 'kickDepth', label: 'Kick depth', help: 'How far the kick face sits back from the cabinet front.', shown: always },
      { key: 'kickSkinThickness', term: 'kickSkin', label: 'Kick skin thickness', help: 'The finished face over the ladder base’s front rail.', shown: ladder },
    ],
  },
  {
    label: 'Base',
    detail: 'base',
    shown: (m) => m.id === 'A',
    rows: [
      { key: 'sleeperSpacingMax', term: 'sleeperSpacing', label: 'Sleeper spacing, most', help: 'Center to center. Sleepers are added to stay under it.', shown: ladder },
      { key: 'platformLengthMax', term: 'platformLength', label: 'Longest platform', help: 'Longer runs are split, at a cabinet joint where possible.', shown: ladder },
      { key: 'legsPerBox', term: 'legs', label: 'Legs per box', help: 'Leveling legs under each cabinet.', shown: legs },
      { key: 'legsPerWideBox', term: 'legs', label: 'Legs per wide box', help: 'For cabinets wider than the width below.', shown: legs },
      { key: 'legWidthThreshold', term: 'legs', label: 'Wide box, wider than', help: 'Cabinets wider than this get the extra legs.', shown: legs },
    ],
  },
];

export const METHOD_ROWS: readonly MethodRow[] = METHOD_GROUPS.flatMap((g) => g.rows);
const COUNT_KEYS: ReadonlySet<MethodRowKey> = new Set<MethodRowKey>(['legsPerBox', 'legsPerWideBox']);
export const isCountKey = (key: MethodRowKey): key is MethodCountKey => COUNT_KEYS.has(key);
export const methodField = (key: MethodLengthKey): MethodDraftField => `method.${key}`;

/** Method settings the shop sets here, for "what changed". listBase only marks old jobs. */
const METHOD_KEYS = (Object.keys(DEFAULT_RULES.method) as (keyof MethodSettings)[]).filter((k) => k !== 'listBase');

/** Every field validation can point at on this screen. */
export type SettingsField = RuleField | 'shelfThickComparison' | `method.${keyof MethodSettings}`;

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
  /** Waste, edge trim and the default material per slot (Settings → Materials). */
  estimate: EstimateSettings;
  /** The shop's saw profiles and the default for new jobs (Settings → Saw profiles). */
  saw: SawSettings;
}

export interface SettingsDraft {
  saved: SettingsValues;
  current: SettingsValues;
  /** Size fields whose text doesn't read as a size yet; `current` keeps their last good value. */
  unparsed: ReadonlySet<DraftField>;
  /** Bumped when every input must show `current` again (Discard, load). */
  generation: number;
  /** Bumped per field by Reset, so only that input shows the default again. */
  resets: Readonly<Partial<Record<DraftField, number>>>;
}

export type DraftAction =
  | { type: 'loaded'; values: SettingsValues }
  | { type: 'rule'; field: RuleField; value: Ticks | null }
  | { type: 'comparison'; value: ShelfThickComparison }
  | { type: 'roundTo'; value: RoundTo }
  | { type: 'keep'; value: number }
  | { type: 'folder'; value: string | null }
  | { type: 'reset'; field: RuleField }
  | { type: 'methodLength'; field: MethodLengthKey; value: Ticks | null }
  | { type: 'methodCount'; field: MethodCountKey; value: number }
  | { type: 'methodChoice'; field: MethodChoiceKey; value: string }
  | { type: 'construction'; choice: ConstructionChoice }
  | { type: 'methodReset'; field: MethodRowKey | MethodChoiceKey | 'construction' }
  | { type: 'wastePercent'; value: number }
  | { type: 'edgeTrim'; value: Ticks | null }
  | { type: 'slotDefault'; slot: JobSlot; materialId: string | null }
  | { type: 'sawField'; id: string; patch: Partial<Pick<SawProfile, 'name' | 'firstCut' | 'extraSheets'>> }
  | { type: 'sawLength'; id: string; field: SawLengthField; value: Ticks | null }
  /** Add a profile (new or a duplicate), after `after` or last. */
  | { type: 'sawAdd'; profile: SawProfile; after?: string }
  | { type: 'sawRemove'; id: string }
  | { type: 'sawDefault'; id: string }
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

const withMethod = (values: SettingsValues, patch: Partial<MethodSettings>): SettingsValues =>
  withRule(values, { method: { ...values.rules.method, ...patch } });

const withProfile = (values: SettingsValues, id: string, patch: Partial<SawProfile>): SettingsValues => ({
  ...values,
  saw: { ...values.saw, profiles: values.saw.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) },
});

function without(set: ReadonlySet<DraftField>, field: DraftField): ReadonlySet<DraftField> {
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
    case 'methodLength': {
      const key = methodField(action.field);
      if (action.value === null) {
        if (draft.unparsed.has(key)) return draft;
        return { ...draft, unparsed: new Set(draft.unparsed).add(key) };
      }
      const unparsed = without(draft.unparsed, key);
      if (draft.current.rules.method[action.field] === action.value && unparsed === draft.unparsed) return draft;
      return { ...draft, unparsed, current: withMethod(draft.current, { [action.field]: action.value }) };
    }
    case 'methodCount':
      return { ...draft, current: withMethod(draft.current, { [action.field]: action.value }) };
    case 'methodChoice':
      return { ...draft, current: withMethod(draft.current, { [action.field]: action.value }) };
    case 'construction': {
      const method = applyConstructionChoice(draft.current.rules.method, action.choice);
      return { ...draft, current: withMethod(draft.current, { id: method.id, baseType: method.baseType }) };
    }
    case 'methodReset': {
      const builtIn = BUILT_IN_RULES.method;
      if (action.field === 'construction') return { ...draft, current: withMethod(draft.current, { id: builtIn.id, baseType: builtIn.baseType }) };
      const patch = { [action.field]: builtIn[action.field] };
      if (action.field === 'backType' || action.field === 'baseTop' || isCountKey(action.field)) {
        return { ...draft, current: withMethod(draft.current, patch) };
      }
      const key = methodField(action.field);
      return {
        ...draft,
        unparsed: without(draft.unparsed, key),
        current: withMethod(draft.current, patch),
        resets: { ...draft.resets, [key]: (draft.resets[key] ?? 0) + 1 },
      };
    }
    case 'wastePercent': {
      const value = Math.min(MAX_WASTE_PERCENT, Math.max(0, Math.round(action.value)));
      return { ...draft, current: { ...draft.current, estimate: { ...draft.current.estimate, wastePercent: value } } };
    }
    case 'edgeTrim': {
      const field = 'estimate.edgeTrim';
      if (action.value === null) {
        if (draft.unparsed.has(field)) return draft;
        return { ...draft, unparsed: new Set(draft.unparsed).add(field) };
      }
      const unparsed = without(draft.unparsed, field);
      if (draft.current.estimate.edgeTrim === action.value && unparsed === draft.unparsed) return draft;
      return { ...draft, unparsed, current: { ...draft.current, estimate: { ...draft.current.estimate, edgeTrim: action.value } } };
    }
    case 'slotDefault': {
      const defaults = { ...draft.current.estimate.defaults };
      if (action.materialId === null) delete defaults[action.slot];
      else defaults[action.slot] = action.materialId;
      return { ...draft, current: { ...draft.current, estimate: { ...draft.current.estimate, defaults } } };
    }
    case 'sawField':
      return { ...draft, current: withProfile(draft.current, action.id, action.patch) };
    case 'sawLength': {
      const key = sawField(action.id, action.field);
      if (action.value === null) {
        if (draft.unparsed.has(key)) return draft;
        return { ...draft, unparsed: new Set(draft.unparsed).add(key) };
      }
      const unparsed = without(draft.unparsed, key);
      const profile = draft.current.saw.profiles.find((p) => p.id === action.id);
      if (!profile || (profile[action.field] === action.value && unparsed === draft.unparsed)) return draft;
      return { ...draft, unparsed, current: withProfile(draft.current, action.id, { [action.field]: action.value }) };
    }
    case 'sawAdd': {
      const profiles = [...draft.current.saw.profiles];
      const at = action.after === undefined ? -1 : profiles.findIndex((p) => p.id === action.after);
      profiles.splice(at < 0 ? profiles.length : at + 1, 0, action.profile);
      return { ...draft, current: { ...draft.current, saw: { ...draft.current.saw, profiles } } };
    }
    case 'sawRemove': {
      // The last profile, and the default, stay.
      const { saw } = draft.current;
      if (saw.profiles.length <= 1 || saw.defaultId === action.id) return draft;
      const unparsed = new Set([...draft.unparsed].filter((f) => !f.startsWith(`saw.${action.id}.`)));
      return { ...draft, unparsed, current: { ...draft.current, saw: { ...saw, profiles: saw.profiles.filter((p) => p.id !== action.id) } } };
    }
    case 'sawDefault':
      if (!draft.current.saw.profiles.some((p) => p.id === action.id)) return draft;
      return { ...draft, current: { ...draft.current, saw: { ...draft.current.saw, defaultId: action.id } } };
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
  if (constructionChoiceOf(saved.rules.method) !== constructionChoiceOf(current.rules.method)) changed.push('construction');
  for (const key of METHOD_KEYS) {
    if (key === 'id' || key === 'baseType') continue;
    const unreadable = draft.unparsed.has(`method.${key}` as MethodDraftField);
    if (saved.rules.method[key] !== current.rules.method[key] || unreadable) changed.push(`method.${key}`);
  }
  if (saved.roundTo !== current.roundTo) changed.push('roundTo');
  if (saved.estimate.wastePercent !== current.estimate.wastePercent) changed.push('wastePercent');
  if (saved.estimate.edgeTrim !== current.estimate.edgeTrim || draft.unparsed.has('estimate.edgeTrim')) changed.push('edgeTrim');
  for (const slot of DEFAULT_SLOTS) {
    if ((saved.estimate.defaults[slot] ?? null) !== (current.estimate.defaults[slot] ?? null)) changed.push(`default.${slot}`);
  }
  if (sawChanged(draft) || [...draft.unparsed].some((f) => f.startsWith('saw.'))) changed.push('sawProfiles');
  if (saved.backups.keep !== current.backups.keep) changed.push('keep');
  if ((saved.backups.folder ?? null) !== (current.backups.folder ?? null)) changed.push('folder');
  return changed;
}

export const isDirty = (draft: SettingsDraft): boolean => changedSettings(draft).length > 0;

export const rulesChanged = (draft: SettingsDraft): boolean =>
  RULE_FIELDS.some((f) => draft.saved.rules[f] !== draft.current.rules[f]) ||
  draft.saved.rules.shelfThickComparison !== draft.current.rules.shelfThickComparison ||
  METHOD_KEYS.some((k) => draft.saved.rules.method[k] !== draft.current.rules.method[k]);

const DEFAULT_SLOTS = Object.keys(BUILT_IN_ESTIMATE.defaults) as JobSlot[];

export const estimateChanged = (draft: SettingsDraft): boolean =>
  draft.saved.estimate.wastePercent !== draft.current.estimate.wastePercent ||
  draft.saved.estimate.edgeTrim !== draft.current.estimate.edgeTrim ||
  DEFAULT_SLOTS.some((slot) => (draft.saved.estimate.defaults[slot] ?? null) !== (draft.current.estimate.defaults[slot] ?? null));

export const sawChanged = (draft: SettingsDraft): boolean => JSON.stringify(draft.saved.saw) !== JSON.stringify(draft.current.saw);

/** Each profile's problems, by profile id. Only profiles with problems are listed. */
export function sawIssues(draft: SettingsDraft): Record<string, ReturnType<typeof sawProfileIssues>> {
  const out: Record<string, ReturnType<typeof sawProfileIssues>> = {};
  for (const p of draft.current.saw.profiles) {
    const issues = sawProfileIssues(p);
    if (Object.keys(issues).length > 0) out[p.id] = issues;
  }
  return out;
}

export const backupsChanged = (draft: SettingsDraft): boolean =>
  draft.saved.backups.keep !== draft.current.backups.keep || (draft.saved.backups.folder ?? null) !== (draft.current.backups.folder ?? null);

/** Differs from the built-in default (the "◆ Changed from 3/4″" mark). */
export function differsFromDefault(rules: ConstructionRules, field: RuleField): boolean {
  return rules[field] !== BUILT_IN_RULES[field];
}

export function methodDiffers(rules: ConstructionRules, key: MethodRowKey | MethodChoiceKey | 'construction'): boolean {
  if (key === 'construction') return constructionChoiceOf(rules.method) !== constructionChoiceOf(BUILT_IN_RULES.method);
  return rules.method[key] !== BUILT_IN_RULES.method[key];
}

/** The rules as each construction would build: the shop's settings, every method. */
export function rulesForEachConstruction(rules: ConstructionRules): ConstructionRules[] {
  return CONSTRUCTION_CHOICES.map((choice) => ({ ...rules, method: { ...applyConstructionChoice(rules.method, choice), listBase: true } }));
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

/**
 * The engine's issues for the draft rules, by the field they belong beside.
 * Each job picks its own construction, so the settings are checked as every
 * construction would use them, not just the default one.
 */
export function ruleIssues(draft: SettingsDraft): FieldIssues {
  const { rules } = draft.current;
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const each of rulesForEachConstruction(rules)) {
    const found = [...calculateParts(REFERENCE_CABINET, each).issues, ...jobParts([REFERENCE_CABINET], each).issues.map((i) => i.issue)];
    for (const issue of found) {
      const key = `${issue.field}|${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
  }
  const byField: FieldIssues = {};
  const add = (field: SettingsField, issue: ValidationIssue) => (byField[field] ??= []).push(issue);
  for (const issue of issues) {
    if (issue.field === 'shelfThickComparison' || issue.field.startsWith('method.') || (RULE_FIELDS as readonly string[]).includes(issue.field)) {
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
  return (
    isDirty(draft) &&
    draft.unparsed.size === 0 &&
    !hasRuleErrors(issues) &&
    keepIsValid(draft.current.backups.keep) &&
    Object.keys(sawIssues(draft)).length === 0
  );
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
      return `${show(ref.height)} base → box height ${show(boxGeometry(ref, rules).boxHeight)}`;
    case 'clearance':
      return p.shelf ? `${show(ref.width)} cabinet → shelf ${show(p.shelf.length)} long` : null;
    case 'setback':
      return p.shelf ? `${show(ref.depth)} deep → shelf ${show(p.shelf.width)} wide` : null;
    case 'laminate': {
      const face = p.front;
      const lam = p['laminate-front'];
      return face && lam ? `${show(face.width)} × ${show(face.length)} face → laminate ${show(lam.width)} × ${show(lam.length)}` : null;
    }
    default:
      return methodEffect(key, rules, p, show);
  }
}

/** Effect lines for the construction details, from the engine on the reference cabinet. */
function methodEffect(key: DetailKey, rules: ConstructionRules, p: Partial<Record<PartRole, Part>>, show: (v: Ticks) => string): string | null {
  const ref = REFERENCE_CABINET;
  const m = rules.method;
  const size = (part: Part | undefined) => (part ? `${show(part.length)} × ${show(part.width)}` : '?');
  switch (key) {
    case 'construction':
    case 'kick': {
      if (m.id === 'B') {
        const side = p['side-left'];
        return side ? `${show(ref.height)} base → sides ${show(side.length)} long, notched ${show(rules.toeKickHeight)} × ${show(m.kickDepth)}` : null;
      }
      if (m.baseType === 'legs') {
        const legs = ref.width > m.legWidthThreshold ? m.legsPerWideBox : m.legsPerBox;
        return `${show(ref.width)} base → kick board ${size(p['kick-board'])}, ${show(m.kickDepth)} back · ${legs} legs`;
      }
      const base = jobParts([ref], rules).parts.map((j) => j.part);
      const sleepers = base.find((b) => b.role === 'base-sleeper');
      const rail = base.find((b) => b.role === 'base-rail-front');
      return rail && sleepers
        ? `${show(ref.width)} base → rails ${show(rail.length)} long, ${show(m.kickDepth)} back · ${sleepers.quantity} sleepers ${show(sleepers.length)}`
        : null;
    }
    case 'back': {
      const back = p.back;
      if (!back?.thickness) return null;
      const nailer = p.nailer ? ` · nailer ${size(p.nailer)}` : '';
      return `${show(ref.width)} base → back ${size(back)} × ${show(back.thickness)}${nailer}`;
    }
    case 'top':
      return m.baseTop === 'stretchers'
        ? `${show(ref.width)} base → two stretchers ${size(p['stretcher-front'])}`
        : `${show(ref.width)} base → top ${size(p.top)}`;
    case 'base': {
      if (m.id !== 'A') return null;
      if (m.baseType === 'legs') return `${show(m.legWidthThreshold)} box → ${m.legsPerBox} legs · wider → ${m.legsPerWideBox}`;
      return `${show(m.platformLengthMax)} platform → ${sleeperCount(m.platformLengthMax, rules)} sleepers · longer runs split`;
    }
    default:
      return null;
  }
}

