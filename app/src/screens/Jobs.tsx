import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button, ButtonLink } from '../components/Button';
import buttonStyles from '../components/Button.module.css';
import { IconButton } from '../components/IconButton';
import { CloseIcon, CutListIcon, ImportIcon, MoreIcon, PlusIcon, SearchIcon } from '../components/icons';
import { Kbd } from '../components/Kbd';
import { Menu } from '../components/Menu';
import type { MenuEntry } from '../components/Menu';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { Stamp, STATUS_INFO } from '../components/Stamp';
import { Tooltip } from '../components/Tooltip';
import { addExampleJob, changeJobStatus, confirmDefaults, duplicateJob, loadSampleJobs } from '../data/storage';
import { exportJob, prepareImport } from '../data/transfer';
import type { ImportPlan } from '../data/transfer';
import type { ImportMode, JobRecord } from '../data/types';
import { formatJobNumber } from '../data/types';
import { useShortcut, useShortcutScope } from '../keyboard/shortcuts';
import { layoutElevation } from '../lib/elevation';
import { cx, scrollRoot, usePinnedBar } from '../lib/interaction';
import { formatEdited } from '../lib/relativeDate';
import { useReducedMotion } from '../motion';
import { pickJobFile } from '../platform/files';
import { useOpenedJobFile } from '../platform/openedFiles';
import type { PickedFile } from '../platform/files';
import { navigate, replaceRoute, routeHref } from '../routes';
import { useStore } from '../state/createStore';
import { useJobRecord } from '../state/jobRecords';
import { jobsStore } from '../state/jobs';
import { useDefaultsChecked } from '../state/shopDefaults';
import type { JobStatus, JobSummary } from '../state/jobs';
import { filterCounts, inFilter, registerScroll, registerView, searchPattern, setRegisterView, toggleSort, visibleJobs } from '../state/register';
import type { RegisterFilter, RegisterSortKey, RegisterView } from '../state/register';
import { showToast } from '../state/toast';
import { toStorageError } from '../data/errors';
import { BackupStrip } from './jobs/BackupStrip';
import { ElevationStrip } from './jobs/Elevation';
import { ImportJobDialog } from './jobs/ImportJobDialog';
import { Highlight } from './jobs/Highlight';
import { JobPreview } from './jobs/JobPreview';
import { boxCount, elevationCabinets } from './jobs/jobMath';
import styles from './jobs/Jobs.module.css';
import { JobDetailsDialog } from './jobs/JobDetailsDialog';
import { NewJobDialog } from './jobs/NewJobDialog';
import { useJobFileDrop } from './jobs/useJobFileDrop';
import { markedText, statusLockHint } from '../workspace/construction';

/** A row hidden by a status change slides out over this long before it leaves the list (matches .leaving in the CSS). */
const ROW_EXIT_MS = 200;
/** The "new row" sweep on a duplicated or restored row (§3 slow). */
const SWEEP_MS = 1400;

const FILTERS: readonly { value: RegisterFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'all', label: 'All' },
  { value: 'archived', label: 'Archived' },
];

const MARKABLE: readonly JobStatus[] = ['draft', 'ready', 'completed'];

const SORT_NAMES: Record<RegisterSortKey, string> = { name: 'job name', status: 'status', edited: 'last edited' };

/** Re-render every minute so "Today" becomes "Yesterday" at midnight. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Come back from a job to where the register was scrolled. */
function useScrollMemory(): void {
  useLayoutEffect(() => {
    const root = scrollRoot();
    const saved = registerScroll.get();
    if (saved > 0) root.scrollTop = saved;
    const onScroll = () => registerScroll.set(root.scrollTop);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, []);
}

/** Timers that die with the screen. */
function useTimers() {
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach((t) => window.clearTimeout(t));
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
}

function statusToast(job: JobSummary, status: JobStatus): string {
  if (status === 'archived') return `Archived “${job.name}”`;
  if (job.status === 'archived') return `Restored “${job.name}” from archive`;
  return markedText(job.status, status);
}

/**
 * Jobs / home: the drawing register, the job preview, New job and backups (interaction-design §6).
 * `newJob` (#/jobs/new, from Settings → Help) opens New job at once.
 */
export function JobsScreen({ newJob = false }: { newJob?: boolean }) {
  useShortcutScope('jobs');
  useScrollMemory();
  const later = useTimers();
  const reduced = useReducedMotion();
  const now = useNow();

  const jobsById = useStore(jobsStore, (s) => s.jobs);
  const view = useStore(registerView, (s) => s);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [newOpen, setNewOpen] = useState(newJob);
  /** The job whose Job details dialog is open. */
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsJob = detailsId ? jobsById[detailsId] : undefined;
  const dialogOpen = newOpen || detailsJob !== undefined;
  // The address goes back to plain Jobs, so Back or the same link again doesn't stay stuck on it.
  useEffect(() => {
    if (newJob) replaceRoute({ name: 'jobs' });
  }, [newJob]);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [openingExample, setOpeningExample] = useState(false);
  const defaultsChecked = useDefaultsChecked();
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  usePinnedBar(controlsRef);

  const all = useMemo(() => Object.values(jobsById), [jobsById]);
  const counts = filterCounts(all);
  const rows = useMemo(() => visibleJobs(all, view, leaving), [all, view, leaving]);
  const pattern = searchPattern(view.query);
  const preview = rows.find((j) => j.id === peekId) ?? rows[0] ?? null;
  const byEdited = useMemo(() => visibleJobs(all, { query: '', filter: 'all', sort: 'edited', dir: -1 }), [all]);

  const sweep = useCallback(
    (id: string) => {
      setFreshId(id);
      later(() => setFreshId((current) => (current === id ? null : current)), SWEEP_MS);
    },
    [later],
  );

  const duplicate = async (job: JobSummary) => {
    const copy = await duplicateJob(job.id);
    if (!copy) return;
    // The copy is a draft; don't let the Archived filter hide it.
    if (view.filter === 'archived') setRegisterView({ filter: 'all' });
    setPeekId(copy.id);
    sweep(copy.id);
    showToast(`Duplicated as “${copy.name}”`, { label: 'Open', run: () => navigate({ name: 'workspace', jobId: copy.id }) });
  };

  /** Import job… and a dropped file both end here: check the file, then ask how to store it. */
  const startImport = async (file: PickedFile) => {
    const plan = await prepareImport(file);
    if (plan) setImportPlan(plan);
  };

  const finishImport = (job: JobRecord, mode: ImportMode) => {
    setImportPlan(null);
    if (!inFilter(job.status, registerView.getState().filter)) setRegisterView({ filter: 'all' });
    setPeekId(job.id);
    sweep(job.id);
    const open = { label: 'Open', run: () => navigate({ name: 'workspace', jobId: job.id }) };
    showToast(
      mode === 'replace'
        ? `Replaced “${job.name}” with the job from the file. All jobs were backed up first.`
        : `Imported “${job.name}” as ${formatJobNumber(job.number)}.`,
      open,
    );
  };

  const dragging = useJobFileDrop((file) => void startImport(file), !dialogOpen && importPlan === null);
  // A .kerfjob double-clicked in Explorer arrives here too.
  useOpenedJobFile((file) => void startImport(file), !dialogOpen && importPlan === null);

  const setStatus = (job: JobSummary, status: JobStatus) => {
    if (status === job.status) return;
    const previous = job.status;
    if (!inFilter(status, registerView.getState().filter)) {
      // Slide the row out, then let it go. If it had focus, focus moves to its neighbor.
      setLeaving((s) => new Set(s).add(job.id));
      later(
        () => {
          const body = bodyRef.current;
          const row = [...(body?.querySelectorAll<HTMLElement>('tr[data-job-id]') ?? [])].find((r) => r.dataset.jobId === job.id);
          if (body && row?.contains(document.activeElement)) {
            const links = [...body.querySelectorAll<HTMLElement>('[data-row-link]')];
            const index = links.findIndex((link) => row.contains(link));
            const next = links[index + 1] ?? links[index - 1];
            (next ?? searchRef.current)?.focus();
          }
          setLeaving((s) => {
            const next = new Set(s);
            next.delete(job.id);
            return next;
          });
        },
        reduced ? 0 : ROW_EXIT_MS,
      );
    }
    changeJobStatus(job.id, status);
    // Undo works by job id, so it still applies after the filter or search changed.
    showToast(statusToast(job, status), {
      label: 'Undo',
      run: () => {
        changeJobStatus(job.id, previous);
        sweep(job.id);
      },
    });
  };

  const focusedJobId = (): string | null => {
    const row = document.activeElement?.closest<HTMLElement>('tr[data-job-id]');
    return row && bodyRef.current?.contains(row) ? (row.dataset.jobId ?? null) : null;
  };

  useShortcut({ id: 'jobs.new', keys: ['Ctrl+N'], scope: 'jobs', label: 'New job', enabled: () => !dialogOpen, run: () => setNewOpen(true) });
  useShortcut({
    id: 'jobs.duplicate',
    keys: ['Ctrl+D'],
    scope: 'jobs',
    label: 'Duplicate the focused job',
    enabled: () => focusedJobId() !== null,
    run: () => {
      const job = jobsById[focusedJobId() ?? ''];
      if (job) void duplicate(job);
    },
  });
  useShortcut({
    id: 'jobs.search',
    keys: ['/'],
    scope: 'jobs',
    label: 'Search jobs',
    enabled: () => !dialogOpen,
    run: () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
  });
  useShortcut({ id: 'jobs.rows', keys: ['ArrowUp', 'ArrowDown'], display: [['↑', '↓']], scope: 'jobs', label: 'Previous / next job (in the list)' });

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if ((event.target as HTMLElement).closest('[role="menu"]')) return;
    const links = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-row-link]') ?? [])];
    const index = links.findIndex((link) => event.currentTarget.contains(link));
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  const clearSearch = () => {
    setRegisterView({ query: '' });
    searchRef.current?.focus();
  };

  const openExample = async () => {
    setOpeningExample(true);
    const example = await addExampleJob();
    setOpeningExample(false);
    if (example) navigate({ name: 'workspace', jobId: example.id });
  };

  let empty: ReactNode = null;
  if (rows.length === 0) {
    if (pattern) {
      empty = (
        <>
          <p>No jobs match “{view.query.trim()}”.</p>
          <Button onClick={clearSearch}>Clear search</Button>
        </>
      );
    } else if (all.length === 0) {
      empty = (
        <>
          <p>No jobs yet. Start one with New job.</p>
          <Button busy={openingExample} onClick={() => void openExample()}>
            Open an example job
          </Button>
          {import.meta.env.DEV && <Button onClick={() => void loadSampleJobs()}>Load sample jobs (development only)</Button>}
        </>
      );
    } else if (view.filter === 'archived') {
      empty = <p>Nothing archived yet.</p>;
    } else {
      empty = (
        <>
          <p>Every job is archived.</p>
          <Button onClick={() => setRegisterView({ filter: 'archived' })}>Show archived</Button>
        </>
      );
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.register}>
        <div className={styles.head}>
          <div>
            <div className={cx('cap', styles.eyebrow)}>Drawing register</div>
            <h1 className={styles.h1}>Jobs</h1>
          </div>
          <div className={styles.headActions}>
            <Button
              size="lg"
              icon={<ImportIcon />}
              tooltip="Open a .kerfjob file, or drop one on this screen"
              onClick={() =>
                void pickJobFile()
                  .then((file) => file && startImport(file))
                  .catch((error: unknown) => showToast(toStorageError(error).message))
              }
            >
              Import job…
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={<PlusIcon />}
              tooltip="New job  Ctrl+N"
              describeTooltip={false}
              aria-keyshortcuts="Control+N"
              onClick={() => setNewOpen(true)}
            >
              New job
            </Button>
          </div>
        </div>

        {defaultsChecked === false && (
          <div className={styles.checkDefaults} role="region" aria-label="Check shop defaults">
            <p>Before your first job, check your shop’s construction defaults: panel thickness, toe kick, countertop and the rest.</p>
            <div className={styles.checkDefaultsActions}>
              <ButtonLink variant="primary" href={routeHref({ name: 'settings' })}>
                Check defaults
              </ButtonLink>
              <Button onClick={() => void confirmDefaults()}>They’re right</Button>
            </div>
          </div>
        )}

        <div ref={controlsRef} className={styles.controls}>
          <div className={styles.search}>
            <label htmlFor="jobs-search" className={cx('cap', styles.controlLabel)}>
              Search
            </label>
            <div className={styles.searchBox}>
              <SearchIcon className={styles.searchIcon} />
              <input
                ref={searchRef}
                id="jobs-search"
                type="search"
                className={styles.searchInput}
                value={view.query}
                placeholder="Job, customer or job number"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setRegisterView({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && view.query !== '') {
                    e.preventDefault();
                    e.stopPropagation();
                    setRegisterView({ query: '' });
                  }
                }}
              />
              {view.query ? (
                <IconButton label="Clear search" size="sm" className={styles.searchClear} onClick={clearSearch}>
                  <CloseIcon />
                </IconButton>
              ) : (
                <span className={styles.searchKey} aria-hidden="true">
                  <Kbd>/</Kbd>
                </span>
              )}
            </div>
          </div>
          <div>
            <span className={cx('cap', styles.controlLabel)} aria-hidden="true">
              Show
            </span>
            <Segmented
              label="Show"
              value={view.filter}
              onChange={(filter) => setRegisterView({ filter })}
              options={FILTERS.map((f) => ({
                value: f.value,
                label: (
                  <>
                    {f.label} <span className={cx('mono', styles.filterCount)}>{counts[f.value]}</span>
                  </>
                ),
              }))}
            />
          </div>
        </div>

        <p className="visually-hidden" role="status">
          {rows.length === 1 ? '1 job shown' : `${rows.length} jobs shown`}
        </p>

        <Sheet padding="none" className={styles.tableSheet}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className="visually-hidden">
                Jobs, sorted by {SORT_NAMES[view.sort]}, {view.dir === 1 ? 'ascending' : 'descending'}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.colNo}>
                    No.
                  </th>
                  <SortHeader view={view} sortKey="name">
                    Job
                  </SortHeader>
                  <SortHeader view={view} sortKey="status">
                    Status
                  </SortHeader>
                  <th scope="col">Cabinets</th>
                  <SortHeader view={view} sortKey="edited">
                    Last edited
                  </SortHeader>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {rows.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    pattern={pattern}
                    now={now}
                    peeked={preview?.id === job.id}
                    fresh={freshId === job.id}
                    leaving={leaving.has(job.id)}
                    onPeek={() => setPeekId(job.id)}
                    onKeyDown={onRowKeyDown}
                    onDuplicate={() => void duplicate(job)}
                    onEditDetails={() => setDetailsId(job.id)}
                    onStatus={(status) => setStatus(job, status)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {empty && (
            <div className={styles.empty}>
              <svg width="120" height="84" viewBox="0 0 120 84" aria-hidden="true" className={styles.emptySheet}>
                <rect x="6" y="4" width="108" height="76" strokeDasharray="5 3" />
                <rect x="66" y="58" width="44" height="18" />
                <path d="M66 67h44M88 58v18" />
              </svg>
              {empty}
            </div>
          )}
        </Sheet>

        <BackupStrip />
      </div>

      <JobPreview job={preview} onDuplicate={(job) => void duplicate(job)} />

      {importPlan && <ImportJobDialog plan={importPlan} onClose={() => setImportPlan(null)} onImported={finishImport} />}

      {dragging && (
        <div className={styles.dropTarget} aria-hidden="true">
          Drop the .kerfjob file to import it
        </div>
      )}

      {newOpen && (
        <NewJobDialog
          jobs={byEdited}
          onClose={() => setNewOpen(false)}
          onCreated={(job) => {
            setNewOpen(false);
            navigate({ name: 'workspace', jobId: job.id });
          }}
        />
      )}
      {detailsJob && <JobDetailsDialog job={detailsJob} onClose={() => setDetailsId(null)} />}
    </div>
  );
}

function SortHeader({ view, sortKey, children }: { view: RegisterView; sortKey: RegisterSortKey; children: string }) {
  const active = view.sort === sortKey;
  return (
    <th scope="col" aria-sort={active ? (view.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={styles.sortButton} onClick={() => setRegisterView(toggleSort(view, sortKey))}>
        {children}
        <span aria-hidden="true" className={styles.sortArrow}>
          {active ? (view.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

interface JobRowProps {
  job: JobSummary;
  pattern: RegExp | null;
  now: Date;
  peeked: boolean;
  fresh: boolean;
  leaving: boolean;
  onPeek: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
  onDuplicate: () => void;
  onEditDetails: () => void;
  onStatus: (status: JobStatus) => void;
}

function JobRow({ job, pattern, now, peeked, fresh, leaving, onPeek, onKeyDown, onDuplicate, onEditDetails, onStatus }: JobRowProps) {
  const entry = useJobRecord(job.id, job.revision);
  const record = entry?.job?.id === job.id ? entry.job : undefined;
  const layout = useMemo(() => layoutElevation(elevationCabinets(job, record)), [job, record]);
  const boxes = boxCount(job);
  const workspace = routeHref({ name: 'workspace', jobId: job.id });
  const archived = job.status === 'archived';

  const items: MenuEntry[] = [
    { id: 'open', label: 'Open', onSelect: () => navigate({ name: 'workspace', jobId: job.id }) },
    { id: 'details', label: 'Edit details…', onSelect: onEditDetails },
    { id: 'duplicate', label: 'Duplicate', hint: 'Ctrl+D', onSelect: onDuplicate },
    { id: 'export', label: 'Export job file…', onSelect: () => void exportJob(job.id) },
    { type: 'separator', id: 'sep-1' },
    {
      type: 'group',
      id: 'mark',
      label: 'Mark as',
      items: MARKABLE.filter((s) => s !== job.status).map((s) => ({
        id: `mark-${s}`,
        label: (
          <>
            <span className={cx('mono', styles.markGlyph, styles[`status_${s}`])} aria-hidden="true">
              {STATUS_INFO[s].glyph}
            </span>
            {STATUS_INFO[s].label}
          </>
        ),
        note: statusLockHint(job.status, s),
        onSelect: () => onStatus(s),
      })),
    },
    { type: 'separator', id: 'sep-2' },
    archived
      ? { id: 'restore', label: 'Restore from archive', onSelect: () => onStatus('draft') }
      : { id: 'archive', label: 'Archive', danger: true, onSelect: () => onStatus('archived') },
  ];

  return (
    <tr
      data-job-id={job.id}
      className={cx(styles.row, peeked && styles.peeked, fresh && styles.fresh, leaving && styles.leaving)}
      onMouseEnter={onPeek}
      onFocus={onPeek}
      onKeyDown={onKeyDown}
    >
      <td className={cx('mono', styles.no)}>
        <Highlight text={job.number} pattern={pattern} />
      </td>
      <td>
        <a data-row-link className={styles.name} href={workspace}>
          <Highlight text={job.name} pattern={pattern} />
        </a>
        {job.customer && (
          <div className={styles.customer}>
            <Highlight text={job.customer} pattern={pattern} />
          </div>
        )}
      </td>
      <td>
        <Stamp status={job.status} />
      </td>
      <td>
        <span className={styles.cabinets}>
          <ElevationStrip layout={layout} />
          <span className="mono">
            {boxes}
            <span className="visually-hidden">{boxes === 1 ? ' cabinet' : ' cabinets'}</span>
          </span>
        </span>
      </td>
      <td className={styles.edited}>{job.savedAt && <time dateTime={job.savedAt}>{formatEdited(job.savedAt, now)}</time>}</td>
      <td className={styles.actions}>
        <span className={styles.rowActions}>
          <ButtonLink href={workspace} aria-label={`Open ${job.name}`}>
            Open
          </ButtonLink>
          <Tooltip content="Cut list">
            <ButtonLink className={buttonStyles.icon} href={routeHref({ name: 'cutlist', jobId: job.id })} aria-label={`Cut list for ${job.name}`}>
              <CutListIcon />
            </ButtonLink>
          </Tooltip>
        </span>
        <Menu
          label={`More actions for ${job.name}`}
          align="end"
          width={236}
          items={items}
          trigger={(props) => (
            <IconButton {...props} label={`More actions for ${job.name}`} tooltip="More actions">
              <MoreIcon />
            </IconButton>
          )}
        />
      </td>
    </tr>
  );
}
