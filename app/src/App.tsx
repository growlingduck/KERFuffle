import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import styles from './App.module.css';
import { ButtonLink } from './components/Button';
import { IconButton } from './components/IconButton';
import { CheckIcon, ExportIcon, HelpIcon, KeyboardIcon, LogoMark, MoonIcon, RedoIcon, Spinner, SunIcon, SystemThemeIcon, UndoIcon } from './components/icons';
import { Menu } from './components/Menu';
import { Stamp } from './components/Stamp';
import { ToastHost } from './components/Toast';
import { Tooltip } from './components/Tooltip';
import { closeShortcuts, ShortcutsPopover, toggleShortcuts, useShortcutsOpen } from './keyboard/ShortcutsPopover';
import { JobDetailsDialog } from './screens/jobs/JobDetailsDialog';
import { useSectionLink } from './screens/settings/sectionLink';
import { shortcuts, useShortcut } from './keyboard/shortcuts';
import { changeJobStatus, jobSession, useSaveState } from './data/storage';
import { exportJob } from './data/transfer';
import { cx } from './lib/interaction';
import { restartToUpdate, useUpdates } from './platform/updates';
import { useWindowTitle } from './platform/window';
import { navigate, RouteOutlet, routeHref, routeJobId, screenRoute, useRoute } from './routes';
import type { Route, ScreenName } from './routes';
import { JOB_STATUSES, jobsStore, useJob, useLastJobId } from './state/jobs';
import type { JobSummary } from './state/jobs';
import { showToast } from './state/toast';
import { nextThemeChoice, setThemeChoice, THEME_LABELS, useThemeChoice } from './theme';
import { markedText, statusLockHint } from './workspace/construction';
import { redoWithToast, runCommand, undoIfLatest, undoWithToast, useRedoLabel, useUndoLabel } from './workspace/history';
import { SymbolMark } from './components/InfoTip';

const TABS: readonly { screen: ScreenName; label: string; key: string }[] = [
  { screen: 'jobs', label: 'Jobs', key: '1' },
  { screen: 'workspace', label: 'Workspace', key: '2' },
  // Cut list, Layouts and Estimate: the pages a job puts out.
  { screen: 'cutlist', label: 'Output', key: '3' },
  { screen: 'settings', label: 'Settings', key: '4' },
];

/** Workspace and Output show a job, so they wait until one has been opened. */
function needsJob(screen: ScreenName): boolean {
  return screen === 'workspace' || screen === 'cutlist';
}

function currentScreen(route: Route): ScreenName | null {
  return route.name === 'gallery' ? null : route.name;
}

const savedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** Job · Customer · Status · Saved · Undo/Redo/Export. Only on job screens. */
function JobCells({ job }: { job: JobSummary }) {
  const [editing, setEditing] = useState(false);
  const edit = () => setEditing(true);
  return (
    <div className={styles.cells}>
      {editing && <JobDetailsDialog job={job} onClose={() => setEditing(false)} />}
      <div className={cx(styles.cell, styles.jobCell)}>
        <span className={styles.cellLabel}>Job</span>
        <Tooltip content="Edit job details" placement="bottom">
          <button type="button" className={cx(styles.detailsButton, styles.jobName)} aria-label={`Edit job details: ${job.name}`} onClick={edit}>
            {job.name}
          </button>
        </Tooltip>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Customer</span>
        <Tooltip content="Edit job details" placement="bottom">
          <button
            type="button"
            className={cx(styles.detailsButton, styles.customer, !job.customer && styles.addCustomer)}
            aria-label={`Edit job details. Customer: ${job.customer || 'Add customer'}`}
            onClick={edit}
          >
            {job.customer || 'Add customer'}
          </button>
        </Tooltip>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Status</span>
        <Menu
          label="Job status"
          align="end"
          width={220}
          items={JOB_STATUSES.map((s) => ({
            id: s,
            label: <Stamp status={s} flat />,
            checked: s === job.status,
            hint: s === job.status ? 'Current' : undefined,
            note: statusLockHint(job.status, s),
            onSelect: () => {
              if (s === job.status) return;
              const previous = job.status;
              // The open job's status is a workspace command, so Undo covers it.
              const entry = jobSession.getJob()?.id === job.id ? runCommand({ type: 'setStatus', status: s }) : null;
              if (!entry) changeJobStatus(job.id, s);
              showToast(markedText(previous, s), {
                label: 'Undo',
                run: () => {
                  if (entry) undoIfLatest(entry);
                  else changeJobStatus(job.id, previous);
                },
              });
            },
          }))}
          trigger={(props) => (
            <Tooltip content="Change job status" placement="bottom" describe>
              <button {...props} type="button" className={styles.stampButton}>
                <span className="visually-hidden">Job status: </span>
                <Stamp status={job.status} />
              </button>
            </Tooltip>
          )}
        />
      </div>
      <div className={cx(styles.cell, styles.savedCell)}>
        <span className={styles.cellLabel}>Saved</span>
        <SavedState job={job} />
      </div>
      <div className={cx(styles.cell, styles.actionsCell)}>
        <UndoRedo />
        <IconButton label="Export job file…" tooltip="Export job file… (to move it to another PC)" tooltipPlacement="bottom" onClick={() => void exportJob(job.id)}>
          <ExportIcon />
        </IconButton>
      </div>
    </div>
  );
}

/** Help · Shortcuts, on every screen. Help opens Settings → Help. */
function HelpCell({ shortcutsRef }: { shortcutsRef: RefObject<HTMLButtonElement | null> }) {
  const help = useSectionLink('help');
  const shortcutsOpen = useShortcutsOpen();
  return (
    <div className={cx(styles.cell, styles.actionsCell)}>
      <ButtonLink {...help} icon={<HelpIcon />} className={styles.helpLink}>
        <span className={styles.helpText}>Help</span>
      </ButtonLink>
      <IconButton
        ref={shortcutsRef}
        label="Keyboard shortcuts"
        tooltip="Keyboard shortcuts  ?"
        tooltipPlacement="bottom"
        aria-expanded={shortcutsOpen}
        onClick={toggleShortcuts}
      >
        <KeyboardIcon />
      </IconButton>
      <ThemeButton />
    </div>
  );
}

const THEME_ICONS = { light: SunIcon, dark: MoonIcon, system: SystemThemeIcon } as const;

/** Theme: Light · Dark · System. Each click moves to the next; Settings has the full switch. */
function ThemeButton() {
  const choice = useThemeChoice();
  const next = nextThemeChoice(choice);
  const Icon = THEME_ICONS[choice];
  return (
    <IconButton
      label={`Theme: ${THEME_LABELS[choice]}`}
      tooltip={`Theme: ${THEME_LABELS[choice]} · click for ${THEME_LABELS[next]}`}
      tooltipPlacement="bottom"
      data-theme-button={choice}
      onClick={() => setThemeChoice(next)}
    >
      <Icon />
    </IconButton>
  );
}

/** Undo / Redo name the step they'd take: "Undo: Change width on B1". */
function UndoRedo() {
  const undoLabel = useUndoLabel();
  const redoLabel = useRedoLabel();
  return (
    <>
      <IconButton
        label={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}
        disabled={!undoLabel}
        disabledReason="Nothing to undo"
        tooltipPlacement="bottom"
        onClick={undoWithToast}
      >
        <UndoIcon />
      </IconButton>
      <IconButton
        label={redoLabel ? `Redo: ${redoLabel}` : 'Redo'}
        disabled={!redoLabel}
        disabledReason="Nothing to redo"
        tooltipPlacement="bottom"
        onClick={redoWithToast}
      >
        <RedoIcon />
      </IconButton>
    </>
  );
}

/** Saved 9:41 AM · Saving… (only after 300 ms) · Not saved + Retry. */
function SavedState({ job }: { job: JobSummary }) {
  const save = useSaveState(job.id);
  if (save?.kind === 'error') {
    return (
      <span role="status" className={styles.saved}>
        <span className={styles.saveError}>
          <SymbolMark symbol="needsFix" decorative /> Not saved
        </span>
        <Tooltip content={save.message} placement="bottom" describe>
          <button type="button" className={styles.retry} onClick={save.retry}>
            Retry
          </button>
        </Tooltip>
      </span>
    );
  }
  const savedAt = save?.kind === 'saved' ? save.at : job.savedAt;
  return (
    <span role="status" className={styles.saved}>
      {save?.kind === 'saving' ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : savedAt ? (
        <>
          <CheckIcon key={savedAt} draw className={styles.savedCheck} />
          Saved {savedTime.format(new Date(savedAt))}
        </>
      ) : (
        'Not saved yet'
      )}
    </span>
  );
}

/** Shown once an update has downloaded. Nothing installs until the app closes, or Restart now. */
function UpdateNotice() {
  const { status, restarting } = useUpdates();
  if (!status?.readyVersion) return null;
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel}>Update ready</span>
      <span role="status" className={styles.saved}>
        Installs when you close KERFuffle
        <Tooltip
          content={`KERFuffle ${status.readyVersion} is downloaded. Restart now saves your work, installs it and opens KERFuffle again.`}
          placement="bottom"
          describe
        >
          <button type="button" className={styles.retry} disabled={restarting} onClick={restartToUpdate}>
            {restarting ? 'Restarting…' : 'Restart now'}
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

function useGlobalShortcuts(lastJobId: string | null, toggleShortcuts: () => void) {
  const lastJob = useRef(lastJobId);
  useEffect(() => {
    lastJob.current = lastJobId;
  }, [lastJobId]);
  useEffect(() => {
    const off = TABS.map((tab) =>
      shortcuts.register({
        id: `nav.${tab.screen}`,
        keys: [`Ctrl+${tab.key}`],
        scope: 'global',
        label: tab.label,
        run: () => navigate(screenRoute(tab.screen, lastJob.current)),
      }),
    );
    return () => off.forEach((unregister) => unregister());
  }, []);
  useShortcut({ id: 'shortcuts.show', keys: ['?'], scope: 'global', label: 'Show shortcuts', run: toggleShortcuts });

  // Documented here, handled by DimensionInput itself.
  useShortcut({ id: 'field.nudge', keys: ['ArrowUp', 'ArrowDown'], display: [['↑', '↓']], scope: 'fields', label: 'Nudge a dimension 1/16″' });
  useShortcut({
    id: 'field.nudgeCoarse',
    keys: ['Shift+ArrowUp', 'Shift+ArrowDown'],
    display: [['Shift', '↑', '↓']],
    scope: 'fields',
    label: 'Nudge a dimension 1″',
  });
  useShortcut({ id: 'field.commit', keys: ['Enter'], scope: 'fields', label: 'Commit a field' });
  useShortcut({ id: 'field.revert', keys: ['Escape'], scope: 'fields', label: 'Revert a field' });
}

export function App() {
  const route = useRoute();
  const jobId = routeJobId(route);
  const job = useJob(jobId);
  const lastJobId = useLastJobId();
  const screen = currentScreen(route);
  const shortcutsOpen = useShortcutsOpen();
  const shortcutsRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Another screen or job starts at the top. A cleanup runs before the next screen's
  // layout effects, so Jobs can still put back where its list was scrolled.
  const scrollKey = `${screen ?? 'gallery'}/${jobId ?? ''}`;
  useLayoutEffect(() => {
    const main = mainRef.current;
    return () => {
      if (main) main.scrollTop = 0;
    };
  }, [scrollKey]);

  useEffect(() => shortcuts.attach(window), []);
  useEffect(() => closeShortcuts, []);

  useEffect(() => {
    if (!jobId) return;
    jobsStore.dispatch({ type: 'job/opened', id: jobId });
    void jobSession.open(jobId);
  }, [jobId]);

  useWindowTitle(job ? `KERFuffle — ${job.name}` : 'KERFuffle');
  useGlobalShortcuts(lastJobId, toggleShortcuts);

  return (
    <div className={cx('paper', styles.shell)}>
      <header className={styles.header} data-screen-only>
        <a className={styles.logo} href={routeHref({ name: 'jobs' })} aria-label="KERFuffle, go to Jobs">
          <LogoMark />
          <span className={styles.wordmark} aria-hidden="true">
            KERF<span className={styles.wordmarkLight}>uffle</span>
          </span>
        </a>
        <nav aria-label="Sections" className={styles.tabs}>
          {TABS.map((tab) =>
            needsJob(tab.screen) && !lastJobId ? (
              // No job to show yet: grayed out, still focusable so the reason can be read.
              <Tooltip key={tab.screen} content="Open a job first" placement="bottom" describe>
                <a className={styles.tab} role="link" aria-disabled="true" tabIndex={0}>
                  {tab.label}
                </a>
              </Tooltip>
            ) : (
              <a
                key={tab.screen}
                className={styles.tab}
                href={routeHref(screenRoute(tab.screen, lastJobId))}
                aria-current={screen === tab.screen ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ),
          )}
        </nav>
        <div className={styles.spacer} />
        <UpdateNotice />
        {job && <JobCells job={job} />}
        <HelpCell shortcutsRef={shortcutsRef} />
        <ShortcutsPopover open={shortcutsOpen} onClose={closeShortcuts} anchorRef={shortcutsRef} />
      </header>
      <main ref={mainRef} className={styles.main} data-scroll-root>
        <RouteOutlet route={route} />
      </main>
      <ToastHost />
    </div>
  );
}
