import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { inches } from '@kerfuffle/engine';
import type { ShelfThickComparison, Ticks } from '@kerfuffle/engine';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { DimensionInput } from '../components/DimensionInput';
import { Sheet } from '../components/Sheet';
import { Stepper } from '../components/Stepper';
import { ViewTitle } from '../components/ViewTitle';
import { backupsStore, estimateBackupBytes, formatBytes, saveBackupSettings, useBackups } from '../data/backups';
import { getStorageClient } from '../data/client';
import { toStorageError } from '../data/errors';
import type { RoundTo } from '../data/types';
import { DISPLAY_SETTING, parseDisplaySettings, ROUND_TO_OPTIONS, RULES_SETTING } from '../data/types';
import { useShortcutScope } from '../keyboard/shortcuts';
import { displayInches, exactInches } from '../lib/dimensions';
import { cx } from '../lib/interaction';
import { useReducedMotion } from '../motion';
import { chooseBackupFolder, hasFileSystem, openBackupFolder } from '../platform/files';
import { setNavigationGuard } from '../routes';
import { setDisplaySettings } from '../state/display';
import { showToast } from '../state/toast';
import styles from './Screen.module.css';
import { DETAILS, DetailDrawing } from './settings/DetailDrawing';
import type { DetailKey, DraftAction, FieldIssues, RuleRow, SettingsDraft, SettingsValues } from './settings/draft';
import {
  backupsChanged,
  BUILT_IN_RULES,
  canSave,
  changedSettings,
  createDraft,
  differsFromDefault,
  draftReducer,
  effectLine,
  hasRuleErrors,
  MAX_KEEP,
  MIN_KEEP,
  RULE_GROUPS,
  ruleIssues,
  rulesChanged,
} from './settings/draft';
import s from './settings/Settings.module.css';

const SECTIONS = [
  { id: 'construction', num: '01', label: 'Construction' },
  { id: 'display', num: '02', label: 'Display' },
  { id: 'backups', num: '03', label: 'Backups' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const ROUND_LABELS: Record<RoundTo, string> = { 8: '1/8″', 16: '1/16″ (shop)', 32: '1/32″' };

const SAMPLES: readonly [string, Ticks][] = [
  ['28 7/16″ part', inches(28 + 7 / 16)],
  ['23/32″ plywood', inches(23 / 32)],
  ['Shelf, 3/64″ off', inches(28.25 + 3 / 64)],
];

const NO_FILE_SYSTEM = 'Only in the desktop app';

type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string };

/** Shop settings (interaction-design §8): construction defaults, display, backups. */
export function SettingsScreen() {
  useShortcutScope('settings');
  useShortcutScope('fields');

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, dispatch] = useReducer(draftReducer, undefined, () =>
    createDraft({ rules: BUILT_IN_RULES, roundTo: 16, backups: { folder: null, keep: 14 } }),
  );
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);

  useEffect(() => {
    let live = true;
    const client = getStorageClient();
    Promise.all([client.getShopSettings(), client.backupOverview()])
      .then(([settings, overview]) => {
        backupsStore.dispatch({ overview, error: null });
        if (!live) return;
        const values: SettingsValues = {
          rules: settings.rules,
          roundTo: parseDisplaySettings(settings.other[DISPLAY_SETTING]).roundTo,
          backups: { folder: overview.folder === overview.defaultFolder ? null : overview.folder, keep: overview.keep },
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
      setNavigationGuard((_to, proceed) => {
        if (!dirtyRef.current) return false;
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
      }
      if (draft.saved.roundTo !== current.roundTo) {
        await client.setShopSetting(DISPLAY_SETTING, { roundTo: current.roundTo });
        setDisplaySettings({ roundTo: current.roundTo });
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

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <div className={cx('cap', styles.eyebrow)}>Shop</div>
          <h1 className={styles.h1}>Settings</h1>
        </div>
      </div>
      {load.kind === 'ready' ? (
        <SettingsBody draft={draft} dispatch={dispatch} issues={issues}>
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
        <p className={s.loading} role="status">
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
  /** The dirty bar, at the end of the main column. */
  children: ReactNode;
}

function SettingsBody({ draft, dispatch, issues, children }: BodyProps) {
  const reduced = useReducedMotion();
  const [section, setSection] = useState<SectionId>('construction');
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
    <div className={s.layout}>
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
              const target = document.getElementById(item.id);
              target?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
              target?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
            }}
          >
            <span className={s.navNum}>{item.num}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className={s.main}>
        <Sheet id="construction" className={s.section} aria-labelledby="set-construction">
          <div className={s.sectionHead}>
            <ViewTitle id="set-construction" mark="1" title="Construction defaults" sub="USED BY NEW JOBS" />
            <p className={s.banner}>
              New jobs copy these. <strong>Existing jobs keep their own copy</strong>, so changing a default never changes a cut list you already made.
            </p>
          </div>
          {RULE_GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className={cx('cap', s.groupLabel)} aria-hidden="true">
                {group.label}
              </div>
              {group.rows.map((row) => (
                <RuleRowView
                  key={row.field}
                  row={row}
                  draft={draft}
                  dispatch={dispatch}
                  issues={issues}
                  hot={active === row.detail}
                  pointer={point(row.detail)}
                  focusHandlers={focusOn(row.detail)}
                />
              ))}
            </div>
          ))}
          <ComparisonRow draft={draft} dispatch={dispatch} hot={active === 'wide'} pointer={point('wide')} focusHandlers={focusOn('wide')} />
        </Sheet>

        <Sheet id="display" className={s.section} aria-labelledby="set-display">
          <ViewTitle id="set-display" mark="2" title="Display" sub="HOW SIZES ARE SHOWN" />
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
            <span aria-hidden="true">{error ? '⚠ ' : '△ '}</span>
            {error ?? warning}
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
    ['gte', `${at} and wider (shop rule)`],
    ['gt', `Wider than ${at} (old spreadsheet)`],
  ];
  const value = draft.current.rules.shelfThickComparison;
  const fallback = BUILT_IN_RULES.shelfThickComparison;
  return (
    <div className={cx(s.row, s.rowLast, s.choiceRow)} data-hot={hot || undefined} style={{ display: 'block' }} {...pointer}>
      <fieldset className={s.choices}>
        <legend className={s.choiceLabel}>Wide shelves start at</legend>
        <p className={s.choiceHelp}>Shop decision Q1: a cabinet exactly at the width gets the wide shelf.</p>
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
          <span>Changed from the shop rule</span>
          <button type="button" className={s.link} onClick={() => dispatch({ type: 'comparison', value: fallback })}>
            Reset
          </button>
        </div>
      )}
    </div>
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
      <ViewTitle id="set-backups" mark="3" title="Backups" sub="AUTOMATIC, EVERY DAY THE APP IS OPENED" />
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
