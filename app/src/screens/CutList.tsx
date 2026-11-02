import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCutList, constructionName, estimate as estimateJob, JOB_SLOTS, SLOT_INFO } from '@kerfuffle/engine';
import type { CutListMode, CutListOptions, CutListSortKey, Estimate, JobSlot } from '@kerfuffle/engine';
import { Button, ButtonLink } from '../components/Button';
import { CheckIcon, ChevronLeftIcon, ImportIcon, PrintIcon } from '../components/icons';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { cutListCsv } from '../cutlist/csv';
import { estimateCsv } from '../cutlist/estimate';
import { exportFileName, isoDate, PAGE_SIZES } from '../cutlist/format';
import { useIncludeFronts } from '../cutlist/prefs';
import { takePrintRequest } from '../cutlist/printRequest';
import { cabinetSpec } from '../data/jobSession';
import { changedMaterialCount, effectiveJobMaterials, engineMaterials, priceChanges, pricesAsOf, withCurrentPrices, withSlotMaterial } from '../data/materials';
import { jobSession } from '../data/storage';
import type { JobMaterialsRecord, JobRecord } from '../data/types';
import { formatJobNumber } from '../data/types';
import { useShortcut, useShortcutScope } from '../keyboard/shortcuts';
import { cx, useDelayedFlag } from '../lib/interaction';
import { canShowInFolder, printSheets, saveCsv, savePdf, showInFolder, toExportError } from '../platform/export';
import type { SavedFile } from '../platform/export';
import { navigate, routeHref } from '../routes';
import { useStore } from '../state/createStore';
import { useJob } from '../state/jobs';
import { useMaterials } from '../state/materials';
import { showToast } from '../state/toast';
import { duplicateLabels } from '../workspace/cabinets';
import { selectCabinet } from '../workspace/ui';
import { MissingJob } from './MissingJob';
import styles from './cutlist/CutList.module.css';
import { EstimateSheet } from './cutlist/EstimateSheet';
import { MaterialsPanel } from './cutlist/MaterialsPanel';
import { PartSketch } from './cutlist/PartSketch';
import type { SketchSource } from './cutlist/PartSketch';
import { Sheets } from './cutlist/Sheets';
import type { CabinetChip, SheetData, SheetInteraction } from './cutlist/Sheets';
import ws from './workspace/Workspace.module.css';

type ExportKind = 'csv' | 'pdf';
/** The sheets on screen, which Print, Save PDF and Export CSV act on. */
type View = 'cutlist' | 'estimate';

interface EstimateData {
  estimate: Estimate;
  pricesAsOf: string | null;
}
type ExportPhase = 'idle' | 'busy' | 'done';

/** How long "PDF saved ✓" stays on the button (interaction-design §7). */
const DONE_MS = 4000;

const DEFAULT_SORT: CutListOptions['sort'] = { key: 'length', dir: 'desc' };

/** Export CSV / Save PDF: icon → spinner "Saving…" (only after 300 ms) → check "PDF saved". */
function ExportButton({ kind, phase, onRun }: { kind: ExportKind; phase: ExportPhase; onRun: () => void }) {
  const slow = useDelayedFlag(phase === 'busy');
  const idleLabel = kind === 'csv' ? 'Export CSV' : 'Save PDF';
  const label = phase === 'done' ? (kind === 'csv' ? 'CSV saved' : 'PDF saved') : slow ? 'Saving…' : idleLabel;
  return (
    <Button
      className={cx(phase === 'done' && styles.done)}
      size="lg"
      busy={slow}
      aria-busy={phase === 'busy' || undefined}
      icon={phase === 'done' ? <CheckIcon draw /> : <ImportIcon />}
      onClick={onRun}
    >
      {label}
    </Button>
  );
}

function useExports(job: JobRecord, sheetData: SheetData, estimateData: EstimateData, view: View) {
  const [phase, setPhase] = useState<Record<ExportKind, ExportPhase>>({ csv: 'idle', pdf: 'idle' });
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const set = (kind: ExportKind, value: ExportPhase) => setPhase((p) => (p[kind] === value ? p : { ...p, [kind]: value }));
  const busy = useRef<Record<ExportKind, boolean>>({ csv: false, pdf: false });

  const saved = (kind: ExportKind, file: SavedFile) => {
    set(kind, 'done');
    timers.current.push(window.setTimeout(() => set(kind, 'idle'), DONE_MS));
    const where = file.folder ? ` to ${file.folder}` : '';
    const path = file.path;
    showToast(
      file.path ? `Saved “${file.name}”${where}` : `Downloaded “${file.name}”`,
      path && canShowInFolder()
        ? {
            label: 'Show in folder',
            run: () => void showInFolder(path).catch((e: unknown) => showToast(toExportError(e).message)),
          }
        : undefined,
    );
  };

  const failed = (kind: ExportKind, error: unknown, retry: () => void) => {
    set(kind, 'idle');
    showToast(toExportError(error).message, { label: 'Try again', run: retry });
  };

  // Read the latest data when run, so Try again saves what's on screen now.
  const latest = useRef({ job, sheetData, estimateData, view });
  useEffect(() => {
    latest.current = { job, sheetData, estimateData, view };
  });

  const exportCsv = async (): Promise<void> => {
    if (busy.current.csv) return;
    busy.current.csv = true;
    const { job: j, sheetData: d, estimateData: e, view: v } = latest.current;
    try {
      const meta = {
        jobName: j.name,
        jobNumber: formatJobNumber(j.number),
        construction: constructionName(d.rules.method),
        date: d.printed,
        revision: j.revision,
      };
      const csv = v === 'estimate' ? estimateCsv(e.estimate, d.list, { ...meta, pricesAsOf: e.pricesAsOf }) : cutListCsv(d.list, meta);
      const what = v === 'estimate' ? 'estimate' : 'cut list';
      const file = await saveCsv(exportFileName(j.name, 'csv', what), csv, () => set('csv', 'busy'));
      if (file) saved('csv', file);
      else set('csv', 'idle');
    } catch (error) {
      failed('csv', error, () => void exportCsv());
    } finally {
      busy.current.csv = false;
    }
  };

  const exportPdf = async (): Promise<void> => {
    if (busy.current.pdf) return;
    busy.current.pdf = true;
    const { job: j, sheetData: d, view: v } = latest.current;
    try {
      const result = await savePdf(exportFileName(j.name, 'pdf', v === 'estimate' ? 'estimate' : 'cut list'), d.page, () => set('pdf', 'busy'));
      if (result.kind === 'saved') saved('pdf', result.file);
      else set('pdf', 'idle');
      if (result.kind === 'printDialog') showToast('To save a PDF, pick “Microsoft Print to PDF” as the printer.');
    } catch (error) {
      failed('pdf', error, () => void exportPdf());
    } finally {
      busy.current.pdf = false;
    }
  };

  return { phase, exportCsv, exportPdf };
}

async function print(): Promise<void> {
  try {
    await printSheets();
  } catch (error) {
    showToast(toExportError(error).message, { label: 'Try again', run: () => void print() });
  }
}

function CutListView({ job }: { job: JobRecord }) {
  const [view, setView] = useState<View>('cutlist');
  const [mode, setMode] = useState<CutListMode>('merged');
  const [sort, setSort] = useState<CutListOptions['sort']>(DEFAULT_SORT);
  const [includeFronts, setIncludeFronts] = useIncludeFronts(job.id);
  const [hoverCabinet, setHoverCabinet] = useState<string | null>(null);
  const [pinnedCabinet, setPinnedCabinet] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [pinnedRow, setPinnedRow] = useState<string | null>(null);

  // A job made before materials uses the shop defaults, copied as of when it was opened.
  const { catalog, estimate: estimateSettings } = useMaterials();
  const [openedAt] = useState(() => new Date().toISOString());
  const record = useMemo(() => effectiveJobMaterials(job, catalog, estimateSettings, openedAt), [job, catalog, estimateSettings, openedAt]);
  const materials = useMemo(() => engineMaterials(record, catalog), [record, catalog]);

  const specs = useMemo(() => job.cabinets.map(cabinetSpec), [job.cabinets]);
  const list = useMemo(
    () => buildCutList(specs, job.rules, { mode, includeFronts, sort }, materials),
    [specs, job.rules, mode, includeFronts, sort, materials],
  );
  const estimate = useMemo(() => estimateJob(list, materials, estimateSettings), [list, materials, estimateSettings]);
  const usedSlots = useMemo<JobSlot[]>(() => {
    const used = new Set(estimate.lines.flatMap((l) => l.slots));
    return JOB_SLOTS.filter((slot) => used.has(slot));
  }, [estimate]);
  const asOf = useMemo(() => {
    const at = pricesAsOf(record, usedSlots);
    return at ? isoDate(new Date(at)) : null;
  }, [record, usedSlots]);
  const changes = useMemo(() => priceChanges(record, catalog, usedSlots), [record, catalog, usedSlots]);
  const estimateData = useMemo<EstimateData>(() => ({ estimate, pricesAsOf: asOf }), [estimate, asOf]);

  /** Commit new materials, with Undo back to what the job had. */
  const commitMaterials = (next: JobMaterialsRecord, message: string) => {
    const before = record;
    jobSession.commit((current) => ({ ...current, materials: next }));
    showToast(message, { label: 'Undo', run: () => jobSession.commit((current) => ({ ...current, materials: before })) });
  };
  const chooseMaterial = (slot: JobSlot, id: string | null) => {
    const found = id === null ? null : (catalog.find((m) => m.id === id) ?? null);
    if (id !== null && !found) return; // the job's own copy, already chosen
    commitMaterials(withSlotMaterial(record, slot, found, new Date().toISOString()), `${SLOT_INFO[slot].name}: ${found ? found.name : 'no material'}`);
  };
  const updatePrices = () => {
    const count = changedMaterialCount(changes);
    commitMaterials(
      withCurrentPrices(record, catalog, changes.map((c) => c.slot), new Date().toISOString()),
      count === 1 ? 'Updated 1 price from the catalog' : `Updated ${count} prices from the catalog`,
    );
  };

  const chips = useMemo<CabinetChip[]>(() => {
    const blocked = new Set(list.blocked.map((b) => b.index));
    return job.cabinets.map((c, index) => ({
      index,
      label: c.label,
      type: c.type,
      width: c.width,
      height: c.height,
      depth: c.depth,
      quantity: c.quantity,
      blocked: blocked.has(index),
    }));
  }, [job.cabinets, list.blocked]);

  const printed = isoDate(new Date());
  const data = useMemo<SheetData>(
    () => ({
      list,
      rules: job.rules,
      job: { name: job.name, number: formatJobNumber(job.number), customer: job.customer ?? '', status: job.status, revision: job.revision },
      chips,
      printed,
      page: PAGE_SIZES.letter,
    }),
    [list, job.rules, job.name, job.number, job.customer, job.status, job.revision, chips, printed],
  );

  const onSort = useCallback((key: CutListSortKey) => {
    // Sizes and counts start longest / most first; names start A–Z.
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  }, []);
  const ui = useMemo<SheetInteraction>(
    () => ({
      activeCabinet: hoverCabinet ?? pinnedCabinet,
      pinnedCabinet,
      hotRow: hoverRow ?? pinnedRow,
      pinnedRow,
      sort,
      onSort,
      onCabinet: setHoverCabinet,
      onPinCabinet: setPinnedCabinet,
      onRow: setHoverRow,
      onPinRow: (key) => setPinnedRow((p) => (p === key ? null : key)),
    }),
    [hoverCabinet, pinnedCabinet, hoverRow, pinnedRow, sort, onSort],
  );

  const sketchKey = hoverRow ?? pinnedRow;
  const sketchLine = list.lines.find((l) => l.key === sketchKey) ?? (sketchKey ? undefined : list.lines[0]);
  const source: SketchSource = hoverRow && hoverRow !== pinnedRow ? 'pointed' : pinnedRow ? 'pinned' : 'first';

  const { phase, exportCsv, exportPdf } = useExports(job, data, estimateData, view);
  useShortcut({ id: 'cutlist.print', keys: ['Ctrl+P'], scope: 'cutlist', label: 'Print the cut list or estimate', run: () => void print() });

  const onPaginated = useCallback(() => {
    if (takePrintRequest()) void print();
  }, []);

  const dupes = [...duplicateLabels(job.cabinets)];
  const fixFirst = () => {
    const first = list.blocked[0];
    const cabinet = first ? job.cabinets[first.index] : undefined;
    if (cabinet) selectCabinet(cabinet.id);
    navigate({ name: 'workspace', jobId: job.id });
  };

  return (
    <div className={styles.root}>
      <div role="toolbar" aria-label="Cut list options" className={styles.toolbar}>
        <ButtonLink size="lg" href={routeHref({ name: 'workspace', jobId: job.id })} icon={<ChevronLeftIcon />}>
          Workspace
        </ButtonLink>
        <div className={styles.viewLabel}>
          <span className="cap" aria-hidden="true">
            Show
          </span>
          <Segmented<View>
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'cutlist', label: 'Cut list' },
              { value: 'estimate', label: 'Estimate' },
            ]}
          />
        </div>
        <div className={styles.listLabel}>
          <span className="cap" aria-hidden="true">
            List
          </span>
          <Segmented<CutListMode>
            label="List"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merged', label: 'Merged' },
              { value: 'by-cabinet', label: 'By cabinet' },
            ]}
          />
        </div>
        <Switch checked={includeFronts} onChange={setIncludeFronts}>
          Include fronts <span className={styles.muted}>(door / laminate size)</span>
        </Switch>
        <div className={styles.toolbarEnd}>
          <ExportButton kind="csv" phase={phase.csv} onRun={() => void exportCsv()} />
          <ExportButton kind="pdf" phase={phase.pdf} onRun={() => void exportPdf()} />
          <Button variant="primary" size="lg" icon={<PrintIcon />} tooltip="Ctrl + P" onClick={() => void print()}>
            Print…
          </Button>
        </div>
      </div>

      {(list.blocked.length > 0 || list.jobIssues.length > 0 || list.materialIssues.length > 0 || dupes.length > 0 || job.cabinets.length === 0) && (
        <div className={styles.notices}>
          {list.blocked.length > 0 && (
            <p className={styles.notice} role="alert">
              <strong>
                <span aria-hidden="true">⚠ </span>
                {list.blocked.map((b) => b.cabinetId.trim() || `Cabinet ${b.index + 1}`).join(', ')}{' '}
                {list.blocked.length === 1 ? 'needs a fix' : 'need a fix'}
              </strong>
              <span>
                {list.blocked.length === 1 ? 'It is' : 'They are'} left off this cut list, and the printout says so. Printing still works.
              </span>
              <a
                href={routeHref({ name: 'workspace', jobId: job.id })}
                onClick={(e) => {
                  e.preventDefault();
                  fixFirst();
                }}
              >
                Fix in the workspace
              </a>
            </p>
          )}
          {dupes.length > 0 && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note">
              <span aria-hidden="true">△ </span>
              <span className="visually-hidden">Warning: </span>
              More than one cabinet uses the ID {dupes.join(', ')}. Rename one in the workspace so the cut list can tell them apart.
            </p>
          )}
          {list.jobIssues.map(({ ref, issue }) => (
            <p key={`${ref}:${issue.field}`} className={cx(styles.notice, styles.noticeWarn)} role="note">
              <span aria-hidden="true">△ </span>
              <span className="visually-hidden">{issue.severity === 'error' ? 'Problem: ' : 'Warning: '}</span>
              {ref}: {issue.message}
            </p>
          ))}
          {list.materialIssues.map((issue) => (
            <p key={`${issue.slot}:${issue.message}`} className={cx(styles.notice, styles.noticeWarn)} role="note">
              <span aria-hidden="true">△ </span>
              <span className="visually-hidden">Warning: </span>
              {issue.message}
            </p>
          ))}
          {job.cabinets.length === 0 && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note">
              This job has no cabinets yet. Add them in the workspace and they’ll appear here.
            </p>
          )}
        </div>
      )}

      <div className={styles.content}>
        {view === 'cutlist' ? (
          <Sheets data={data} ui={ui} onPaginated={onPaginated} />
        ) : (
          <EstimateSheet estimate={estimate} list={list} rules={job.rules} job={data.job} printed={printed} pricesAsOf={asOf} page={data.page} />
        )}
        <PartSketch line={view === 'cutlist' ? (sketchLine ?? null) : undefined} source={source} totals={list.totals}>
          <MaterialsPanel
            record={record}
            usingDefaults={!job.materials}
            catalog={catalog}
            slots={usedSlots}
            issues={list.materialIssues}
            pricesAsOf={asOf}
            changes={changes}
            onChoose={chooseMaterial}
            onUpdatePrices={updatePrices}
          />
        </PartSketch>
      </div>
    </div>
  );
}

/** Cut list (interaction-design §7): review on screen, print, save as PDF, export CSV. */
export function CutListScreen({ jobId }: { jobId: string }) {
  useShortcutScope('job');
  useShortcutScope('cutlist');
  const summary = useJob(jobId);
  const job = useStore(jobSession.store, (s) => (s.jobId === jobId ? s.job : null));
  const status = useStore(jobSession.store, (s) => (s.jobId === jobId ? s.status : 'loading'));
  const loadError = useStore(jobSession.store, (s) => (s.jobId === jobId ? s.loadError : null));
  useShortcut({
    id: 'job.workspace',
    keys: ['Ctrl+L'],
    scope: 'cutlist',
    label: 'Back to the workspace',
    run: () => navigate({ name: 'workspace', jobId }),
  });
  if (!summary || status === 'missing') return <MissingJob jobId={jobId} />;
  return (
    <>
      <h1 className="visually-hidden">Cut list: {summary.name}</h1>
      {status === 'ready' && job ? (
        <CutListView job={job} />
      ) : (
        <p className={ws.loading} role="status">
          {status === 'failed' ? (loadError ?? 'This job couldn’t be opened.') : 'Opening the job…'}
        </p>
      )}
    </>
  );
}
