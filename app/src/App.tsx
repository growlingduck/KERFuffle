import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import styles from './App.module.css';
import { IconButton } from './components/IconButton';
import { CheckIcon, ExportIcon, KeyboardIcon, LogoMark, RedoIcon, Spinner, UndoIcon } from './components/icons';
import { Menu } from './components/Menu';
import { Stamp, STATUS_INFO } from './components/Stamp';
import { ToastHost } from './components/Toast';
import { Tooltip } from './components/Tooltip';
import { ShortcutsPopover } from './keyboard/ShortcutsPopover';
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
import { redoWithToast, runCommand, undoWithToast, useRedoLabel, useUndoLabel } from './workspace/history';

const TABS: readonly { screen: ScreenName; label: string; key: string }[] = [
  { screen: 'jobs', label: 'Jobs', key: '1' },
  { screen: 'workspace', label: 'Workspace', key: '2' },
  { screen: 'cutlist', label: 'Cut list', key: '3' },
  { screen: 'settings', label: 'Settings', key: '4' },
];

function currentScreen(route: Route): ScreenName | null {
  return route.name === 'gallery' ? null : route.name;
}

const savedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** Job · Customer · Status · Saved · Undo/Redo/Shortcuts. Only on job screens. */
function JobCells({
  job,
  onShortcuts,
  shortcutsOpen,
  shortcutsRef,
}: {
  job: JobSummary;
  onShortcuts: () => void;
  shortcutsOpen: boolean;
  shortcutsRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className={styles.cells}>
      <div className={cx(styles.cell, styles.jobCell)}>
        <span className={styles.cellLabel}>Job</span>
        <span className={styles.jobName}>{job.name}</span>
      </div>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Customer</span>
        <span className={styles.customer}>{job.customer}</span>
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
            onSelect: () => {
              if (s === job.status) return;
              // The open job's status is a workspace command, so Undo covers it.
              if (jobSession.getJob()?.id === job.id) runCommand({ type: 'setStatus', status: s });
              else changeJobStatus(job.id, s);
              showToast(`Job marked ${STATUS_INFO[s].label.toLowerCase()}`);
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
        <IconButton
          ref={shortcutsRef}
          label="Keyboard shortcuts"
          tooltip="Keyboard shortcuts  ?"
          tooltipPlacement="bottom"
          aria-expanded={shortcutsOpen}
          onClick={onShortcuts}
        >
          <KeyboardIcon />
        </IconButton>
      </div>
    </div>
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
          <span aria-hidden="true">⚠</span> Not saved
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => shortcuts.attach(window), []);

  useEffect(() => {
    if (!jobId) return;
    jobsStore.dispatch({ type: 'job/opened', id: jobId });
    void jobSession.open(jobId);
  }, [jobId]);

  useWindowTitle(job ? `KERFuffle — ${job.name}` : 'KERFuffle');
  useGlobalShortcuts(lastJobId, () => setShortcutsOpen((open) => !open));

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
          {TABS.map((tab) => (
            <a
              key={tab.screen}
              className={styles.tab}
              href={routeHref(screenRoute(tab.screen, lastJobId))}
              aria-current={screen === tab.screen ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>
        <div className={styles.spacer} />
        <UpdateNotice />
        {job && (
          <JobCells
            job={job}
            shortcutsOpen={shortcutsOpen}
            shortcutsRef={shortcutsRef}
            onShortcuts={() => setShortcutsOpen((open) => !open)}
          />
        )}
        <ShortcutsPopover open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} anchorRef={shortcutsRef} />
      </header>
      <main className={styles.main}>
        <RouteOutlet route={route} />
      </main>
      <ToastHost />
    </div>
  );
}
