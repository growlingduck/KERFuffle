import { Fragment, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { backThicknessOf, CONSTRUCTION_NAMES, constructionChoiceOf, inches } from '@kerfuffle/engine';
import type { ShelfThickComparison, Ticks } from '@kerfuffle/engine';
import { Button } from '../components/Button';
import { ConstructionPicker } from '../components/ConstructionPicker';
import { Dialog } from '../components/Dialog';
import { InfoTip, SymbolMark } from '../components/InfoTip';
import { DimensionInput } from '../components/DimensionInput';
import { Sheet } from '../components/Sheet';
import { Stepper } from '../components/Stepper';
import { ViewTitle } from '../components/ViewTitle';
import { Segmented } from '../components/Segmented';
import { setThemeChoice, THEME_CHOICES, THEME_LABELS, useThemeChoice } from '../theme';
import { backupsStore, estimateBackupBytes, formatBytes, saveBackupSettings, useBackups } from '../data/backups';
import { getStorageClient } from '../data/client';
import { confirmDefaults } from '../data/storage';
import { toStorageError } from '../data/errors';
import { BUILT_IN_ESTIMATE, estimateSettingValue, parseEstimateSettings } from '../data/materials';
import type { RoundTo } from '../data/types';
import { BUILT_IN_SAW, parseSawSettings, sawSettingValue } from '../data/sawProfiles';
import { DISPLAY_SETTING, ESTIMATE_SETTING, parseDisplaySettings, ROUND_TO_OPTIONS, RULES_SETTING, SAW_PROFILES_SETTING } from '../data/types';
import { setSawSettings } from '../state/sawProfiles';
import { useShortcutScope } from '../keyboard/shortcuts';
import { displayInches, exactInches } from '../lib/dimensions';
import type { GlossaryKey } from '../lib/glossary';
import { cx } from '../lib/interaction';
import { useReducedMotion } from '../motion';
import { formatEdited } from '../lib/relativeDate';
import { chooseBackupFolder, hasFileSystem, openBackupFolder } from '../platform/files';
import { APP_VERSION, checkForUpdates, restartToUpdate, useUpdates } from '../platform/updates';
import { setNavigationGuard } from '../routes';
import type { SettingsSection } from '../routes';
import { displayStore, setDisplaySettings } from '../state/display';
import { loadMaterials, setEstimateSettings } from '../state/materials';
import { showToast } from '../state/toast';
import styles from './Screen.module.css';
import { DETAILS, DetailDrawing } from './settings/DetailDrawing';
import { HelpSection, QuickStartSheet } from './settings/HelpSection';
import { MaterialsSection } from './settings/MaterialsSection';
import { SawProfilesSection } from './settings/SawProfilesSection';
import { goToSection, useSectionLink } from './settings/sectionLink';
import type {
  DetailKey,
  DraftAction,
  FieldIssues,
  MethodChoiceRow,
  MethodGroup,
  MethodLengthKey,
  MethodRow,
  RuleRow,
  SettingsDraft,
  SettingsValues,
} from './settings/draft';
import {
  backupsChanged,
  BUILT_IN_RULES,
  canSave,
  changedSettings,
  createDraft,
  differsFromDefault,
  draftReducer,
  effectLine,
  estimateChanged,
  hasRuleErrors,
  isCountKey,
  MAX_KEEP,
  CONSTRUCTION_ORDER,
  methodDiffers,
  methodField,
  MIN_KEEP,
  ruleIssues,
  rulesChanged,
  sawChanged,
} from './settings/draft';
import s from './settings/Settings.module.css';

/** `advanced`: most shops never change it. Tagged in the nav, never hidden or moved. */
const SECTIONS: readonly { id: SectionId; num: string; label: string; advanced?: true }[] = [
  { id: 'construction', num: '01', label: 'Construction' },
  { id: 'materials', num: '02', label: 'Materials' },
  { id: 'saws', num: '03', label: 'Saw profiles', advanced: true },
  { id: 'display', num: '04', label: 'Display', advanced: true },
  { id: 'backups', num: '05', label: 'Backups' },
  { id: 'about', num: '06', label: 'About' },
  { id: 'help', num: '07', label: 'Help' },
];
type SectionId = SettingsSection;

const ROUND_LABELS: Record<RoundTo, string> = { 8: '1/8″', 16: '1/16″ (shop)', 32: '1/32″' };

const SAMPLES: readonly [string, Ticks][] = [
  ['28 7/16″ part', inches(28 + 7 / 16)],
  ['23/32″ plywood', inches(23 / 32)],
  ['Shelf, 3/64″ off', inches(28.25 + 3 / 64)],
];

const NO_FILE_SYSTEM = 'Only in the desktop app';

type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string };

/**
 * Light · Dark · System. Takes effect at once and is kept on this PC only, so it
 * is not part of the draft, Save, backups or job files.
 */
function ThemeRow() {
  const choice = useThemeChoice();
  return (
    <div className={s.themeRow}>
      <span className={cx('cap', s.themeLabel)}>
        Theme
      </span>
      <Segmented
        label="Theme"
        options={THEME_CHOICES.map((value) => ({ value, label: THEME_LABELS[value] }))}
        value={choice}
        onChange={setThemeChoice}
      />
      <span className={s.themeNote}>{choice === 'system' ? 'Follows Windows. ' : ''}This PC only.</span>
    </div>
  );
}

/** Shop settings (interaction-design §8): construction defaults, display, backups, about. Opens at `section` when a link names one. */
export function SettingsScreen({ section }: { section?: SettingsSection | undefined }) {
  useShortcutScope('settings');
  useShortcutScope('fields');

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, dispatch] = useReducer(draftReducer, undefined, () =>
    createDraft({ rules: BUILT_IN_RULES, roundTo: 16, backups: { folder: null, keep: 14 }, estimate: BUILT_IN_ESTIMATE, saw: BUILT_IN_SAW }),
  );
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);

  useEffect(() => {
    let live = true;
    const client = getStorageClient();
    Promise.all([client.getShopSettings(), client.backupOverview(), loadMaterials()])
      .then(([settings, overview]) => {
        backupsStore.dispatch({ overview, error: null });
        if (!live) return;
        const values: SettingsValues = {
          rules: settings.rules,
          roundTo: parseDisplaySettings(settings.other[DISPLAY_SETTING]).roundTo,
          backups: { folder: overview.folder === overview.defaultFolder ? null : overview.folder, keep: overview.keep },
          estimate: parseEstimateSettings(settings.other[ESTIMATE_SETTING]),
          saw: parseSawSettings(settings.other[SAW_PROFILES_SETTING]),
        };
        dispatch({ type: 'loaded', values });
        setLoad({ kind: 'ready' });
      })
      .catch((error: unknown) => {
        if (live) setLoad({ kind: 'failed', message: toStorageError(error).message });
      });
    return () => {
      live = false;
    };
  }, []);

  const issues = useMemo(() => ruleIssues(draft), [draft]);
  const changed = changedSettings(draft);
  const dirty = changed.length > 0;
  const saveable = canSave(draft, issues);
  const blocked = draft.unparsed.size > 0 || hasRuleErrors(issues);

  // Leaving with unsaved changes asks first.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(
    () =>
      setNavigationGuard((to, proceed) => {
        // Moving to another section of Settings doesn't leave it.
        if (!dirtyRef.current || to?.name === 'settings') return false;
        setLeaving({ proceed });
        return true;
      }),
    [],
  );

  /** Store what changed. Each part that saves is marked saved, even if a later part fails. */
  const save = async (): Promise<boolean> => {
    if (!canSave(draft)) return false;
    const { current } = draft;
    const client = getStorageClient();
    setSaving(true);
    try {
      if (backupsChanged(draft)) {
        await saveBackupSettings(current.backups);
        dispatch({ type: 'saved', part: { backups: current.backups } });
      }
      if (rulesChanged(draft)) {
        await client.setShopSetting(RULES_SETTING, current.rules);
        dispatch({ type: 'saved', part: { rules: current.rules } });
        // Saving Construction counts as checking it (the Jobs banner goes).
        await confirmDefaults();
      }
      if (estimateChanged(draft)) {
        await client.setShopSetting(ESTIMATE_SETTING, estimateSettingValue(current.estimate));
        setEstimateSettings(current.estimate);
        dispatch({ type: 'saved', part: { estimate: current.estimate } });
      }
      if (sawChanged(draft)) {
        const saw = { ...current.saw, profiles: current.saw.profiles.map((p) => ({ ...p, name: p.name.trim() })) };
        await client.setShopSetting(SAW_PROFILES_SETTING, sawSettingValue(saw));
        setSawSettings(saw);
        dispatch({ type: 'saved', part: { saw: current.saw } });
      }
      if (draft.saved.roundTo !== current.roundTo) {
        // Kept with the rest of the display setting (the dismissed tracing hint).
        const display = { ...displayStore.getState(), roundTo: current.roundTo };
        await client.setShopSetting(DISPLAY_SETTING, display);
        setDisplaySettings(display);
        dispatch({ type: 'saved', part: { roundTo: current.roundTo } });
      }
      showToast(rulesChanged(draft) ? 'Shop defaults saved. Existing jobs are unchanged.' : 'Settings saved.');
      return true;
    } catch (error) {
      showToast(toStorageError(error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Settings never prints itself: printing here prints the quick start (Help).
  return (
    <div className={cx(styles.page, s.printPage)}>
      <div className={styles.pageHead} data-screen-only>
        <div>
          <div className={cx('cap', styles.eyebrow)}>Shop</div>
          <h1 className={styles.h1}>Settings</h1>
        </div>
      </div>
      <QuickStartSheet />
      {load.kind === 'ready' ? (
        <SettingsBody draft={draft} dispatch={dispatch} issues={issues} openAt={section}>
          {dirty && (
            <div className={s.dirty} role="region" aria-label="Unsaved changes">
              <span className={s.dirtyText} role="status">
                <span className={s.diamond} aria-hidden="true" />
                {changed.length === 1 ? '1 unsaved change' : `${changed.length} unsaved changes`}
                {blocked ? ' · fix the marked field first' : ' · applies to new jobs only'}
              </span>
              <Button className={s.dirtyGhost} onClick={() => dispatch({ type: 'discard' })}>
                Discard
              </Button>
              <Button variant="primary" disabled={!saveable} disabledReason="Fix the marked field first" busy={saving} onClick={() => void save()}>
                Save defaults
              </Button>
            </div>
          )}
        </SettingsBody>
      ) : (
        <p className={s.loading} role="status" data-screen-only>
          {load.kind === 'failed' ? `Settings couldn’t be read. ${load.message}` : 'Loading settings…'}
        </p>
      )}

      <Dialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title="Unsaved settings"
        mark="!"
        width={460}
        footer={
          <>
            <Button onClick={() => setLeaving(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const next = leaving;
                dispatch({ type: 'discard' });
                setLeaving(null);
                next?.proceed();
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              data-autofocus
              disabled={!saveable}
              disabledReason="Fix the marked field first"
              busy={saving}
              onClick={() => {
                const next = leaving;
                void save().then((ok) => {
                  if (!ok) return;
                  setLeaving(null);
                  next?.proceed();
                });
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p>
          {changed.length === 1 ? 'One setting has' : `${changed.length} settings have`} changed and {changed.length === 1 ? 'isn’t' : 'aren’t'} saved.
          {blocked ? ' Fix the marked field to save, or discard the changes.' : ' Save before leaving?'}
        </p>
      </Dialog>
    </div>
  );
}

interface BodyProps {
  draft: SettingsDraft;
  dispatch: Dispatch<DraftAction>;
  issues: FieldIssues;
  /** The section a link opened Settings at. */
  openAt: SectionId | undefined;
  /** The dirty bar, at the end of the main column. */
  children: ReactNode;
}

function SettingsBody({ draft, dispatch, issues, openAt, children }: BodyProps) {
  const reduced = useReducedMotion();
  const [section, setSection] = useState<SectionId>(openAt ?? 'construction');

  // A link such as "Settings → Materials" opens at its section (the observer then follows the scroll).
  useEffect(() => {
    if (openAt) goToSection(openAt, true);
  }, [openAt]);
  const [hover, setHover] = useState<DetailKey | null>(null);
  const [focus, setFocus] = useState<DetailKey | null>(null);
  const [last, setLast] = useState<DetailKey>('panel');
  const active = hover ?? focus ?? last;
  const { current } = draft;

  // Highlight the section being read (where the browser can tell).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setSection(visible.target.id as SectionId);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const point = (key: DetailKey) => ({
    onPointerEnter: () => {
      setHover(key);
      setLast(key);
    },
    onPointerLeave: () => setHover(null),
  });
  const focusOn = (key: DetailKey) => ({
    onFocus: () => {
      setFocus(key);
      setLast(key);
    },
    onBlur: () => setFocus(null),
  });

  const effect = effectLine(active, current.rules, current.roundTo);
  const info = DETAILS[active];

  return (
    <div className={s.layout} data-screen-only>
      <nav className={s.nav} aria-label="Settings sections">
        <div className={cx('cap', s.navLabel)} aria-hidden="true">
          Settings
        </div>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={s.navItem}
            aria-current={section === item.id ? 'true' : undefined}
            onClick={() => {
              setSection(item.id);
              goToSection(item.id, reduced);
            }}
          >
            <span className={s.navNum}>{item.num}</span>
            {item.label}
            {item.advanced && <span className={s.navTag}>Advanced</span>}
          </button>
        ))}
      </nav>

      <div className={s.main}>
        <ThemeRow />

        <Sheet id="construction"className={s.section} aria-labelledby="set-construction">
          <div className={s.sectionHead}>
            <ViewTitle id="set-construction" mark="1" title="Construction defaults" sub="USED BY NEW JOBS" />
            <p className={s.banner}>
              New jobs copy these. <strong>Existing jobs keep their own copy</strong>, so changing a default never changes a cut list you already made.
            </p>
          </div>
          {/* The way the cabinets are built first, then the box from the outside in, then what goes inside it. */}
          <MethodPicker draft={draft} dispatch={dispatch} issues={issues} active={active} point={point} focusOn={focusOn} />
          {CONSTRUCTION_ORDER.map((item) =>
            item.kind === 'rules' ? (
              <div key={item.group.label} role="group" aria-label={item.group.label}>
                <div className={cx('cap', s.groupLabel)} aria-hidden="true">
                  {item.group.label}
                </div>
                {item.group.rows.map((row) => (
                  <Fragment key={row.field}>
                    <RuleRowView
                      row={row}
                      draft={draft}
                      dispatch={dispatch}
                      issues={issues}
                      hot={active === row.detail}
                      pointer={point(row.detail)}
                      focusHandlers={focusOn(row.detail)}
                    />
                    {/* Where wide shelves start: next to the width it compares against. */}
                    {row.field === 'shelfThickWidthThreshold' && (
                      <ComparisonRow draft={draft} dispatch={dispatch} hot={active === 'wide'} pointer={point('wide')} focusHandlers={focusOn('wide')} />
                    )}
                  </Fragment>
                ))}
              </div>
            ) : (
              <MethodGroupView key={item.group.label} group={item.group} draft={draft} dispatch={dispatch} issues={issues} active={active} point={point} focusOn={focusOn} />
            ),
          )}
        </Sheet>

        <MaterialsSection draft={draft} dispatch={dispatch} />

        <SawProfilesSection draft={draft} dispatch={dispatch} />

        <Sheet id="display" className={s.section} aria-labelledby="set-display">
          <ViewTitle id="set-display" mark="4" title="Display" sub="HOW SIZES ARE SHOWN" />
          <div className={s.displayControls} style={{ marginTop: 14 }}>
            <fieldset className={s.choices}>
              <legend className={s.choiceLabel}>Units</legend>
              <Choice name="units" checked label="Inches" onChange={() => {}} />
              <Choice name="units" checked={false} disabled label="Millimetres · later" onChange={() => {}} />
            </fieldset>
            <fieldset className={s.choices}>
              <legend className={s.choiceLabel}>Round shown sizes to</legend>
              {ROUND_TO_OPTIONS.map((value) => (
                <Choice
                  key={value}
                  name="round-to"
                  checked={current.roundTo === value}
                  label={ROUND_LABELS[value]}
                  onChange={() => dispatch({ type: 'roundTo', value })}
                />
              ))}
            </fieldset>
          </div>
          <div className={s.samples} aria-label="Samples" role="group">
            {SAMPLES.map(([what, value]) => (
              <div key={what} className={s.sample}>
                <div className={cx('cap', s.sampleWhat)}>{what}</div>
                <div className={s.sampleShown}>{displayInches(value, current.roundTo)}</div>
                <div className={s.sampleExact}>exact {exactInches(value)}</div>
              </div>
            ))}
          </div>
          <p className={s.footnote}>
            Sizes are always stored exactly (to 1/64″). Rounding changes only what you see and print, and <span className="mono">≈</span> marks
            any size that was rounded. Applies everywhere as soon as it’s saved.
          </p>
        </Sheet>

        <BackupsSection draft={draft} dispatch={dispatch} />

        <AboutSection />

        <HelpSection />

        {children}
      </div>

      <Sheet as="aside" className={s.detail} padding="sm" aria-labelledby="set-detail">
        <ViewTitle id="set-detail" mark={info.letter} title={`Detail · ${info.title}`} sub={info.scale} />
        <DetailDrawing detail={active} rules={current.rules} roundTo={current.roundTo} effect={effect} />
        <p className={s.detailText}>{info.text}</p>
        <div className={cx(s.effect, !effect && s.effectBlocked)} role="status">
          {effect ?? 'Fix the marked setting to see what it does.'}
        </div>
        <p className={s.detailHint}>Point at or edit a setting to see its detail. The drawing redraws as you type.</p>
      </Sheet>
    </div>
  );
}

interface RowProps {
  row: RuleRow;
  draft: SettingsDraft;
  dispatch: Dispatch<DraftAction>;
  issues: FieldIssues;
  hot: boolean;
  pointer: { onPointerEnter: () => void; onPointerLeave: () => void };
  focusHandlers: { onFocus: () => void; onBlur: () => void };
}

function RuleRowView({ row, draft, dispatch, issues, hot, pointer, focusHandlers }: RowProps) {
  const { field, label, help } = row;
  const value = draft.current.rules[field];
  const found = issues[field] ?? [];
  const error = found.find((i) => i.severity === 'error')?.message;
  const warning = found.find((i) => i.severity === 'warning')?.message;
  const unparsed = draft.unparsed.has(field);
  const modified = unparsed || differsFromDefault(draft.current.rules, field);
  const def = exactInches(BUILT_IN_RULES[field]);
  const noteId = `set-${field}-note`;
  return (
    <div className={s.row} data-hot={hot || undefined} {...pointer}>
      <DimensionInput
        // Discard, load or this field's Reset puts the stored value back in the field.
        key={`${field}-${draft.generation}-${draft.resets[field] ?? 0}`}
        id={`set-${field}`}
        label={label}
        info={<InfoTip term={row.term} />}
        value={value}
        // The field's message line is one fixed line; the engine's full message goes beside it.
        error={error ? 'Can’t be saved like this' : null}
        warning={warning ? 'Check the note beside this field' : null}
        describedBy={error || warning ? noteId : undefined}
        className={cx(modified && s.modified)}
        onLiveChange={(next) => dispatch({ type: 'rule', field, value: next })}
        onCommit={(next) => dispatch({ type: 'rule', field, value: next })}
        {...focusHandlers}
      />
      <div className={s.side}>
        {error || warning ? (
          <div id={noteId} className={error ? s.noteError : s.noteWarning}>
            <SymbolMark symbol={error ? 'needsFix' : 'warning'} /> {error ?? warning}
          </div>
        ) : (
          <div className={s.help}>{help}</div>
        )}
        <div className={s.status}>
          {modified ? (
            <>
              <span className={s.diamond} aria-hidden="true" />
              <span>
                Changed from <span className="mono">{def}</span>
              </span>
              <button type="button" className={s.link} aria-label={`Reset ${label} to ${def}`} onClick={() => dispatch({ type: 'reset', field })}>
                Reset
              </button>
            </>
          ) : (
            <span className={s.statusDefault}>
              Default <span className="mono">{def}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({
  draft,
  dispatch,
  hot,
  pointer,
  focusHandlers,
}: Pick<RowProps, 'draft' | 'dispatch' | 'hot' | 'pointer' | 'focusHandlers'>) {
  const at = displayInches(draft.current.rules.shelfThickWidthThreshold);
  const options: [ShelfThickComparison, string][] = [
    ['gte', `${at} and wider`],
    ['gt', `Wider than ${at}`],
  ];
  const value = draft.current.rules.shelfThickComparison;
  const fallback = BUILT_IN_RULES.shelfThickComparison;
  const legendId = useId();
  return (
    <div className={cx(s.row, s.choiceRow)} data-hot={hot || undefined} style={{ display: 'block' }} {...pointer}>
      <fieldset className={s.choices} aria-labelledby={legendId}>
        <ChoiceLegend id={legendId} term="wideShelves">
          Wide shelves start at
        </ChoiceLegend>
        <p className={s.choiceHelp}>Whether a cabinet exactly at the wide-shelf width gets the wide shelf.</p>
        {options.map(([option, label]) => (
          <Choice
            key={option}
            name="wide-comparison"
            checked={value === option}
            label={label}
            onChange={() => dispatch({ type: 'comparison', value: option })}
            {...focusHandlers}
          />
        ))}
      </fieldset>
      {value !== fallback && (
        <div className={s.status}>
          <span className={s.diamond} aria-hidden="true" />
          <span>Changed from {options.find(([option]) => option === fallback)?.[1].toLowerCase()}</span>
          <button type="button" className={s.link} onClick={() => dispatch({ type: 'comparison', value: fallback })}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/** Status under a setting: the built-in default, or what it was changed from and a Reset. */
function DefaultStatus({ modified, def, label, onReset }: { modified: boolean; def: string; label: string; onReset: () => void }) {
  return (
    <div className={s.status}>
      {modified ? (
        <>
          <span className={s.diamond} aria-hidden="true" />
          <span>
            Changed from <span className="mono">{def}</span>
          </span>
          <button type="button" className={s.link} aria-label={`Reset ${label} to ${def}`} onClick={onReset}>
            Reset
          </button>
        </>
      ) : (
        <span className={s.statusDefault}>
          Default <span className="mono">{def}</span>
        </span>
      )}
    </div>
  );
}

interface MethodViewProps {
  draft: SettingsDraft;
  dispatch: Dispatch<DraftAction>;
  issues: FieldIssues;
  active: DetailKey;
  point: (key: DetailKey) => RowProps['pointer'];
  focusOn: (key: DetailKey) => RowProps['focusHandlers'];
}

/** The construction method new jobs start with. It decides which method settings below are shown. */
function MethodPicker({ draft, dispatch, issues, active, point, focusOn }: MethodViewProps) {
  const choice = constructionChoiceOf(draft.current.rules.method);
  const builtIn = constructionChoiceOf(BUILT_IN_RULES.method);
  const pickerIssues = [...(issues['method.id'] ?? []), ...(issues['method.baseType'] ?? [])];
  return (
    <div role="group" aria-label="Construction method">
      <div className={cx('cap', s.groupLabel)} aria-hidden="true">
        Construction method
      </div>
      <div className={cx(s.row, s.choiceRow)} data-hot={active === 'construction' || undefined} style={{ display: 'block' }} {...point('construction')} {...focusOn('construction')}>
        <ConstructionPicker
          legend="Default for new jobs"
          hint="The New job dialog starts with this. Each job keeps its own, and a draft job can change it. Sizes below are checked on a 30″ × 34 1/2″ × 24″ base built every way."
          value={choice}
          onChange={(next) => dispatch({ type: 'construction', choice: next })}
        />
        {pickerIssues.map((issue) => (
          <div key={issue.message} className={s.noteError}>
            <SymbolMark symbol="needsFix" /> {issue.message}
          </div>
        ))}
        <DefaultStatus
          modified={methodDiffers(draft.current.rules, 'construction')}
          def={CONSTRUCTION_NAMES[builtIn].short}
          label="the default construction"
          onReset={() => dispatch({ type: 'methodReset', field: 'construction' })}
        />
      </div>
    </div>
  );
}

/**
 * One group of method settings. Settings the default construction doesn't use
 * are hidden while it's the default, and keep their values.
 */
function MethodGroupView({ group, draft, dispatch, issues, active, point, focusOn }: MethodViewProps & { group: MethodGroup }) {
  const method = draft.current.rules.method;
  if (!group.shown(method)) return null;
  return (
        <div role="group" aria-label={group.label}>
          <div className={cx('cap', s.groupLabel)} aria-hidden="true">
            {group.label}
          </div>
          {group.choice && (
            <MethodChoiceView
              row={group.choice}
              draft={draft}
              dispatch={dispatch}
              hot={active === group.detail}
              pointer={point(group.detail)}
              focusHandlers={focusOn(group.detail)}
            />
          )}
          {group.rows
            .filter((row) => row.shown(method))
            .map((row) =>
              isCountKey(row.key) ? (
                <MethodCountRow
                  key={row.key}
                  row={row}
                  draft={draft}
                  dispatch={dispatch}
                  issues={issues}
                  hot={active === group.detail}
                  pointer={point(group.detail)}
                  focusHandlers={focusOn(group.detail)}
                />
              ) : (
                <MethodLengthRow
                  key={row.key}
                  row={row as MethodRow & { key: MethodLengthKey }}
                  draft={draft}
                  dispatch={dispatch}
                  issues={issues}
                  hot={active === group.detail}
                  pointer={point(group.detail)}
                  focusHandlers={focusOn(group.detail)}
                />
              ),
            )}
        </div>
  );
}

type MethodRowProps<R> = Omit<RowProps, 'row'> & { row: R };

function MethodLengthRow({ row, draft, dispatch, issues, hot, pointer, focusHandlers }: MethodRowProps<MethodRow & { key: MethodLengthKey }>) {
  const { key, label, help } = row;
  const field = methodField(key);
  const { rules } = draft.current;
  // The back's thickness shows the panel thickness until it's set on its own.
  const value = key === 'backThickness' ? backThicknessOf(rules) : rules.method[key];
  const found = issues[field] ?? [];
  const error = found.find((i) => i.severity === 'error')?.message;
  const warning = found.find((i) => i.severity === 'warning')?.message;
  const unparsed = draft.unparsed.has(field);
  const modified = unparsed || methodDiffers(rules, key);
  const builtIn = BUILT_IN_RULES.method[key];
  const def = builtIn === null ? 'same as panels' : exactInches(builtIn);
  const noteId = `set-method-${key}-note`;
  return (
    <div className={s.row} data-hot={hot || undefined} {...pointer}>
      <DimensionInput
        key={`${field}-${draft.generation}-${draft.resets[field] ?? 0}`}
        id={`set-method-${key}`}
        label={label}
        info={<InfoTip term={row.term} />}
        value={value}
        error={error ? 'Can’t be saved like this' : null}
        warning={warning ? 'Check the note beside this field' : null}
        describedBy={error || warning ? noteId : undefined}
        className={cx(modified && s.modified)}
        onLiveChange={(next) => dispatch({ type: 'methodLength', field: key, value: next })}
        onCommit={(next) => dispatch({ type: 'methodLength', field: key, value: next })}
        {...focusHandlers}
      />
      <div className={s.side}>
        {error || warning ? (
          <div id={noteId} className={error ? s.noteError : s.noteWarning}>
            <SymbolMark symbol={error ? 'needsFix' : 'warning'} /> {error ?? warning}
          </div>
        ) : (
          <div className={s.help}>{help}</div>
        )}
        <DefaultStatus modified={modified} def={def} label={label} onReset={() => dispatch({ type: 'methodReset', field: key })} />
      </div>
    </div>
  );
}

function MethodCountRow({ row, draft, dispatch, issues, hot, pointer, focusHandlers }: MethodRowProps<MethodRow>) {
  const key = row.key as 'legsPerBox' | 'legsPerWideBox';
  const value = draft.current.rules.method[key];
  const error = issues[`method.${key}`]?.find((i) => i.severity === 'error')?.message;
  return (
    <div className={s.row} data-hot={hot || undefined} {...pointer}>
      <Stepper
        id={`set-method-${key}`}
        label={row.label}
        info={<InfoTip term={row.term} />}
        value={value}
        min={1}
        max={24}
        decrementLabel={`One fewer: ${row.label.toLowerCase()}`}
        incrementLabel={`One more: ${row.label.toLowerCase()}`}
        minReason="At least one leg"
        maxReason="At most 24"
        onChange={(next) => dispatch({ type: 'methodCount', field: key, value: next })}
        {...focusHandlers}
      />
      <div className={s.side}>
        {error ? (
          <div className={s.noteError}>
            <SymbolMark symbol="needsFix" /> {error}
          </div>
        ) : (
          <div className={s.help}>{row.help}</div>
        )}
        <DefaultStatus
          modified={methodDiffers(draft.current.rules, key)}
          def={String(BUILT_IN_RULES.method[key])}
          label={row.label}
          onReset={() => dispatch({ type: 'methodReset', field: key })}
        />
      </div>
    </div>
  );
}

function MethodChoiceView({
  row,
  draft,
  dispatch,
  hot,
  pointer,
  focusHandlers,
}: Pick<RowProps, 'draft' | 'dispatch' | 'hot' | 'pointer' | 'focusHandlers'> & { row: MethodChoiceRow }) {
  const value = draft.current.rules.method[row.key];
  const builtIn = BUILT_IN_RULES.method[row.key];
  const builtInLabel = row.options.find(([option]) => option === builtIn)?.[1] ?? String(builtIn);
  const legendId = useId();
  return (
    <div className={cx(s.row, s.choiceRow)} data-hot={hot || undefined} style={{ display: 'block' }} {...pointer}>
      <fieldset className={s.choices} aria-labelledby={legendId}>
        <ChoiceLegend id={legendId} term={row.term}>
          {row.label}
        </ChoiceLegend>
        <p className={s.choiceHelp}>{row.help}</p>
        {row.options.map(([option, label]) => (
          <Choice
            key={option}
            name={`method-${row.key}`}
            checked={value === option}
            label={label}
            onChange={() => dispatch({ type: 'methodChoice', field: row.key, value: option })}
            {...focusHandlers}
          />
        ))}
      </fieldset>
      {value !== builtIn && (
        <div className={s.status}>
          <span className={s.diamond} aria-hidden="true" />
          <span>Changed from {builtInLabel.toLowerCase()}</span>
          <button type="button" className={s.link} aria-label={`Reset ${row.label} to ${builtInLabel.toLowerCase()}`} onClick={() => dispatch({ type: 'methodReset', field: row.key })}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A radio group's legend with an info tip. Give the fieldset
 * aria-labelledby={id}, so the group is named by the words alone.
 */
function ChoiceLegend({ id, term, children }: { id: string; term: GlossaryKey; children: string }) {
  return (
    <legend className={s.choiceLabel}>
      <span id={id}>{children}</span> <InfoTip term={term} />
    </legend>
  );
}

function Choice({
  name,
  label,
  checked,
  disabled = false,
  onChange,
  onFocus,
  onBlur,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <label className={s.choice}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} onFocus={onFocus} onBlur={onBlur} />
      <span className={s.choiceMark} aria-hidden="true" />
      {label}
    </label>
  );
}

function BackupsSection({ draft, dispatch }: { draft: SettingsDraft; dispatch: Dispatch<DraftAction> }) {
  const { overview } = useBackups();
  const { folder, keep } = draft.current.backups;
  const shown = folder ?? overview?.defaultFolder ?? '';
  const movedFolder = (draft.saved.backups.folder ?? null) !== (folder ?? null);
  const estimate = estimateBackupBytes(overview, keep);
  const count = overview?.backups.length ?? 0;
  const desktop = hasFileSystem();

  return (
    <Sheet id="backups" className={s.section} aria-labelledby="set-backups">
      <ViewTitle id="set-backups" mark="5" title="Backups" sub="AUTOMATIC, EVERY DAY THE APP IS OPENED" />
      <div className={s.backupGrid} style={{ marginTop: 14 }}>
        <div>
          <div className={s.fieldTitle} id="backup-folder-label">
            Backup folder
          </div>
          <div className={s.path} aria-labelledby="backup-folder-label" role="note">
            {shown}
          </div>
          {movedFolder && <div className={s.pathNote}>Backups already made stay in the old folder.</div>}
          <div className={s.buttonRow}>
            <Button
              disabled={!desktop || movedFolder}
              disabledReason={desktop ? 'Save first, then open the new folder' : NO_FILE_SYSTEM}
              onClick={() => void openBackupFolder().catch((error: unknown) => showToast(toStorageError(error).message))}
            >
              Open folder
            </Button>
            <Button
              disabled={!desktop}
              disabledReason={NO_FILE_SYSTEM}
              onClick={() =>
                void chooseBackupFolder()
                  .then((picked) => picked && dispatch({ type: 'folder', value: picked === overview?.defaultFolder ? null : picked }))
                  .catch((error: unknown) => showToast(toStorageError(error).message))
              }
            >
              Change…
            </Button>
            {folder !== null && (
              <button type="button" className={s.link} onClick={() => dispatch({ type: 'folder', value: null })}>
                Use the default folder
              </button>
            )}
          </div>
        </div>
        <div>
          <Stepper
            className={s.keep}
            label="Keep the latest"
            value={keep}
            min={MIN_KEEP}
            max={MAX_KEEP}
            decrementLabel="Keep fewer backups"
            incrementLabel="Keep more backups"
            minReason="At least one backup is always kept"
            maxReason={`At most ${MAX_KEEP}`}
            onChange={(value) => dispatch({ type: 'keep', value })}
          />
          <p className={s.footnote}>
            {count === 1 ? '1 backup' : `${count} backups`} in the folder now. Older ones are deleted automatically, but each week of the last month
            keeps at least one.{estimate !== null && ` About ${formatBytes(estimate)} for ${keep}.`}
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/** "today, 9:41 AM", "yesterday, 4:12 PM" or "on Oct 21". */
function checkedWhen(ms: number): string {
  const when = formatEdited(new Date(ms).toISOString(), new Date());
  return /^(Today|Yesterday)/.test(when) ? when.charAt(0).toLowerCase() + when.slice(1) : `on ${when}`;
}

/** The version, and updates: checked once a day by themselves, or now by hand. */
function AboutSection() {
  const { status, restarting } = useUpdates();
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const help = useSectionLink('help');
  const version = status?.currentVersion ?? APP_VERSION;

  let line: string;
  if (!status) line = 'Updates are only in the desktop app.';
  else if (!status.enabled) line = 'This is a development build. It doesn’t update itself.';
  else if (status.readyVersion) line = `Version ${status.readyVersion} is downloaded. It installs when you close KERFuffle.`;
  else if (status.checking) line = 'Checking for updates…';
  else if (status.lastChecked) line = `Up to date. Last checked ${checkedWhen(status.lastChecked)}.`;
  else line = 'Not checked yet. KERFuffle checks once a day when it can reach the internet.';

  const check = () => {
    setChecking(true);
    setProblem(null);
    checkForUpdates()
      .then((next) => {
        // Still checking: the daily check was already running, and its
        // update-status event will refresh this when it finishes.
        if (!next.readyVersion && !next.checking) showToast('KERFuffle is up to date.');
      })
      .catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)))
      .finally(() => setChecking(false));
  };

  return (
    <Sheet id="about" className={s.section} aria-labelledby="set-about">
      <ViewTitle id="set-about" mark="6" title="About" sub="VERSION AND UPDATES" />
      <div className={s.backupGrid} style={{ marginTop: 14 }}>
        <div>
          <div className={s.fieldTitle}>KERFuffle</div>
          <div className={s.path}>Version {version}</div>
          <p className={s.footnote}>Jobs are kept on this PC, apart from the program, so updating or reinstalling never touches them.</p>
          <p className={s.footnote}>
            New here? <a {...help}>Help</a> has your first job in six steps, the words KERFuffle uses, and the example job.
          </p>
        </div>
        <div>
          <div className={s.fieldTitle}>Updates</div>
          <p role="status" style={{ margin: 0 }}>
            {line}
          </p>
          {problem && <p className={s.footnote}>{problem}</p>}
          <div className={s.buttonRow}>
            {status?.readyVersion ? (
              <Button variant="primary" busy={restarting} onClick={restartToUpdate}>
                Restart now
              </Button>
            ) : (
              <Button
                disabled={!status?.enabled}
                disabledReason={status ? 'Development builds don’t update' : NO_FILE_SYSTEM}
                busy={checking || (status?.checking ?? false)}
                onClick={check}
              >
                Check for updates
              </Button>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
