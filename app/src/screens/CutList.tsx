import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCutList, constructionName, estimate as estimateJob, JOB_SLOTS, LAYOUT_MODES, materialInputKeys, SLOT_INFO } from '@kerfuffle/engine';
import type { CutListMode, CutListOptions, CutListSortKey, DxfUnits, Estimate, JobSlot, LayoutMode, LayoutStats, MaterialLayout, Sensitivity } from '@kerfuffle/engine';
import { Button } from '../components/Button';
import { CheckIcon, ImportIcon, PrintIcon } from '../components/icons';
import { Menu } from '../components/Menu';
import { Segmented } from '../components/Segmented';
import { InfoTip } from '../components/InfoTip';
import { Switch } from '../components/Switch';
import { cutListCsv } from '../cutlist/csv';
import { DXF_UNIT_NAMES, dxfFiles, staleNote } from '../cutlist/dxf';
import { estimateCsv, roughPricesText, slotsText } from '../cutlist/estimate';
import { MODE_HELP, MODE_NAMES } from '../cutlist/layoutText';
import { OUTPUT_NAMES, outputSummaries } from '../cutlist/outputTabs';
import type { OutputView } from '../cutlist/outputTabs';
import { dxfFolderName, dxfJobPart, exportFileName, isoDate, PAGE_SIZES } from '../cutlist/format';
import { useIncludeFronts } from '../cutlist/prefs';
import { takePrintRequest } from '../cutlist/printRequest';
import { cabinetSpec } from '../data/jobSession';
import { changedMaterialCount, effectiveJobMaterials, engineMaterials, priceChanges, pricesAsOf, roughPriced, withCurrentPrices, withSlotMaterial } from '../data/materials';
import { layoutChanges, layoutsFixed, savedLayout } from '../data/layouts';
import { jobSawProfile } from '../data/sawProfiles';
import { jobSession } from '../data/storage';
import type { JobMaterialsRecord, JobRecord } from '../data/types';
import { formatJobNumber } from '../data/types';
import { useShortcut, useShortcutScope } from '../keyboard/shortcuts';
import { layoutInputOf } from '../layout/jobInput';
import type { LayoutParts } from '../layout/jobInput';
import { keepJobLayout, keepLayouts } from '../layout/keep';
import { useLayoutMode } from '../layout/prefs';
import { useJobLayout } from '../layout/useJobLayout';
import { useModeLayouts } from '../layout/useModeLayouts';
import { cx, useDelayedFlag, usePinnedBar } from '../lib/interaction';
import { canShowInFolder, printSheets, saveCsv, saveFolder, savePdf, showInFolder, toExportError } from '../platform/export';
import type { SavedFile, SavedFolder } from '../platform/export';
import { navigate, routeHref } from '../routes';
import { useStore } from '../state/createStore';
import { useJob } from '../state/jobs';
import { useMaterials } from '../state/materials';
import { useSawProfiles } from '../state/sawProfiles';
import { showToast } from '../state/toast';
import { toStorageError } from '../data/errors';
import { duplicateLabels, labelKey } from '../workspace/cabinets';
import { selectCabinet } from '../workspace/ui';
import { MissingJob } from './MissingJob';
import styles from './cutlist/CutList.module.css';
import { EstimateSheet } from './cutlist/EstimateSheet';
import { LayoutPages } from './cutlist/LayoutPages';
import { OUTPUT_PANEL_ID, OutputTabs, outputTabId } from './cutlist/OutputTabs';
import { LayoutsView } from './cutlist/LayoutsView';
import type { ShownLayout } from './cutlist/LayoutsView';
import ls from './cutlist/Layouts.module.css';
import { focusMaterialsPanel, MaterialsPanel } from './cutlist/MaterialsPanel';
import { SawProfilePanel } from './cutlist/SawProfilePanel';
import { PartSketch } from './cutlist/PartSketch';
import type { SketchSource } from './cutlist/PartSketch';
import { Sheets } from './cutlist/Sheets';
import type { CabinetChip, SheetData, SheetInteraction } from './cutlist/Sheets';
import ws from './workspace/Workspace.module.css';
import { SymbolMark } from '../components/InfoTip';

type ExportKind = 'csv' | 'pdf' | 'dxf';
/** The sheets on screen, which Print, Save PDF and Export CSV act on. */
type View = OutputView;

interface EstimateData {
  estimate: Estimate;
  pricesAsOf: string | null;
  /** Materials priced at a rough starting price. */
  rough: readonly string[];
}
type ExportPhase = 'idle' | 'busy' | 'done';

/** How long "PDF saved ✓" stays on the button (interaction-design §7). */
const DONE_MS = 4000;

const DEFAULT_SORT: CutListOptions['sort'] = { key: 'length', dir: 'desc' };

/*
 * Every Output page ends its options row the same way:
 *   Export CSV… or Export DXF… · Save PDF… · Print… (primary, Ctrl+P)
 * Each opens a dialog, hence the "…". Each export goes icon → spinner "Saving…"
 * (only after 300 ms) → check "CSV saved" / "PDF saved" / "DXF saved" for 4 s.
 * On a page with nothing to put out yet, all three are disabled with the same reason.
 */
const EXPORT_LABELS = {
  csv: { idle: 'Export CSV…', done: 'CSV saved' },
  pdf: { idle: 'Save PDF…', done: 'PDF saved' },
  dxf: { idle: 'Export DXF…', done: 'DXF saved' },
} as const;

function exportLabel(kind: ExportKind, phase: ExportPhase, slow: boolean): string {
  return phase === 'done' ? EXPORT_LABELS[kind].done : slow ? 'Saving…' : EXPORT_LABELS[kind].idle;
}

/** Export CSV… / Save PDF…. */
function ExportButton({ kind, phase, disabledReason, onRun }: { kind: 'csv' | 'pdf'; phase: ExportPhase; disabledReason: string | null; onRun: () => void }) {
  const slow = useDelayedFlag(phase === 'busy');
  return (
    <Button
      className={cx(phase === 'done' && styles.done)}
      size="lg"
      busy={slow}
      aria-busy={phase === 'busy' || undefined}
      icon={phase === 'done' ? <CheckIcon draw /> : <ImportIcon />}
      {...(disabledReason ? { disabled: true, disabledReason } : {})}
      onClick={onRun}
    >
      {exportLabel(kind, phase, slow)}
    </Button>
  );
}

/** Export DXF…: a menu of units, then a folder. One file per sheet pattern. */
function DxfButton({ phase, disabledReason, onRun }: { phase: ExportPhase; disabledReason: string | null; onRun: (units: DxfUnits) => void }) {
  const slow = useDelayedFlag(phase === 'busy');
  const label = exportLabel('dxf', phase, slow);
  const icon = phase === 'done' ? <CheckIcon draw /> : <ImportIcon />;
  if (disabledReason) {
    return (
      <Button size="lg" icon={icon} disabled disabledReason={disabledReason}>
        {label}
      </Button>
    );
  }
  return (
    <Menu
      label="DXF units"
      align="end"
      width={280}
      items={[
        {
          type: 'group',
          id: 'units',
          label: 'Units',
          items: (['in', 'mm'] as const).map((units) => ({
            id: units,
            label: `${DXF_UNIT_NAMES[units]}…`,
            note: 'One file per sheet pattern, into a folder',
            onSelect: () => onRun(units),
          })),
        },
      ]}
      trigger={(props) => (
        <Button
          {...props}
          className={cx(phase === 'done' && styles.done)}
          size="lg"
          busy={slow}
          aria-busy={phase === 'busy' || undefined}
          icon={icon}
        >
          {label}
        </Button>
      )}
    />
  );
}

/** What Save PDF names the file, by view. */
const PDF_WHAT = { cutlist: 'cut list', estimate: 'estimate', layouts: 'sheet layouts' } as const;

function useExports(
  job: JobRecord,
  sheetData: SheetData,
  estimateData: EstimateData,
  view: View,
  afterLayoutsPdf: () => Promise<void>,
  layouts: readonly MaterialLayout[],
) {
  const [phase, setPhase] = useState<Record<ExportKind, ExportPhase>>({ csv: 'idle', pdf: 'idle', dxf: 'idle' });
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const set = (kind: ExportKind, value: ExportPhase) => setPhase((p) => (p[kind] === value ? p : { ...p, [kind]: value }));
  const busy = useRef<Record<ExportKind, boolean>>({ csv: false, pdf: false, dxf: false });

  /** `what`: "“Kitchen – cut list.csv”" for one file, "4 DXF files" for a folder. `note` follows it. */
  const saved = (kind: ExportKind, file: SavedFile | SavedFolder, what: string, note = '') => {
    set(kind, 'done');
    timers.current.push(window.setTimeout(() => set(kind, 'idle'), DONE_MS));
    const where = file.folder ? ` to ${file.folder}` : '';
    const path = file.path;
    showToast(
      (file.path ? `Saved ${what}${where}` : `Downloaded ${what}`) + note,
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
  const latest = useRef({ job, sheetData, estimateData, view, afterLayoutsPdf, layouts });
  useEffect(() => {
    latest.current = { job, sheetData, estimateData, view, afterLayoutsPdf, layouts };
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
      const csv = v === 'estimate' ? estimateCsv(e.estimate, d.list, { ...meta, pricesAsOf: e.pricesAsOf, rough: e.rough }) : cutListCsv(d.list, meta);
      const what = v === 'estimate' ? 'estimate' : 'cut list';
      const file = await saveCsv(exportFileName(j.name, 'csv', what), csv, () => set('csv', 'busy'));
      if (file) saved('csv', file, `“${file.name}”`);
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
    const { job: j, sheetData: d, view: v, afterLayoutsPdf: keep } = latest.current;
    try {
      const result = await savePdf(exportFileName(j.name, 'pdf', PDF_WHAT[v]), d.page, () => set('pdf', 'busy'));
      // Layouts saved as PDF are kept with the job, so the sheets cut match the paper.
      if (v === 'layouts' && result.kind !== 'cancelled') await keep();
      if (result.kind === 'saved') saved('pdf', result.file, `“${result.file.name}”`);
      else set('pdf', 'idle');
      if (result.kind === 'printDialog') showToast('To save a PDF, pick “Microsoft Print to PDF” as the printer.');
    } catch (error) {
      failed('pdf', error, () => void exportPdf());
    } finally {
      busy.current.pdf = false;
    }
  };

  const exportDxf = async (units: DxfUnits): Promise<void> => {
    if (busy.current.dxf) return;
    busy.current.dxf = true;
    const { job: j, layouts: shown, afterLayoutsPdf: keep } = latest.current;
    try {
      const files = dxfFiles(j.name, shown, units);
      const result = await saveFolder(dxfFolderName(j.name), files, () => set('dxf', 'busy'), dxfJobPart(j.name));
      if (!result) {
        set('dxf', 'idle');
        return;
      }
      // Like a printout, exported layouts are kept with the job, so the files match what's cut.
      await keep();
      saved('dxf', result, result.count === 1 ? '1 DXF file' : `${result.count} DXF files`, staleNote(result));
    } catch (error) {
      failed('dxf', error, () => void exportDxf(units));
    } finally {
      busy.current.dxf = false;
    }
  };

  return { phase, exportCsv, exportPdf, exportDxf };
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
  // A job made before saw profiles uses the shop default until one is chosen.
  const { settings: sawSettings } = useSawProfiles();
  const sawProfile = jobSawProfile(job, sawSettings);

  // ---- Sheet layouts (plan §2.6–2.7) ----
  const [layoutMode, setLayoutMode] = useLayoutMode(job.id);
  const fixed = layoutsFixed(job.status);
  // Reopening a job that keeps its layouts shows them in the mode they were made in.
  useEffect(() => {
    const kept = job.layouts?.[0];
    if (fixed && kept && kept.mode !== layoutMode) setLayoutMode(kept.mode);
    // Once, when the job opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);
  const layoutParts = useMemo<LayoutParts>(
    () => ({ cabinets: specs, rules: job.rules, materials, profile: sawProfile, includeFronts }),
    [specs, job.rules, materials, sawProfile, includeFronts],
  );
  const layoutInput = useMemo(() => layoutInputOf(layoutParts, layoutMode), [layoutParts, layoutMode]);
  const inputKeys = useMemo<Record<string, string>>(() => {
    try {
      return materialInputKeys(layoutInput);
    } catch {
      return {};
    }
  }, [layoutInput]);
  const live = useJobLayout(layoutInput);
  const otherModes = useModeLayouts(layoutInput);
  const shownLayouts = useMemo<ShownLayout[]>(() => {
    const names = new Map(Object.values(materials).map((m) => [m.id, m.name]));
    // Most pieces first (the box material, as a rule), then in cut-list order.
    const pieces = new Map<string, number>();
    for (const g of list.groups) if (g.material) pieces.set(g.material.id, (pieces.get(g.material.id) ?? 0) + g.pieces);
    const ids = Object.keys(inputKeys).sort((a, b) => (pieces.get(b) ?? 0) - (pieces.get(a) ?? 0));
    // A job that keeps its layouts still shows one for a material it no longer uses, until recalculated.
    if (fixed) for (const r of job.layouts ?? []) if (!ids.includes(r.materialId)) ids.push(r.materialId);
    return ids.map((id): ShownLayout => {
      const kept = savedLayout(job, id) ?? null;
      const changed = kept ? layoutChanges(kept, { inputKeys, profile: sawProfile, mode: layoutMode }) : [];
      const name = names.get(id) ?? kept?.layout.material.name ?? id;
      if (kept && (fixed || changed.length === 0)) {
        return { materialId: id, name, layout: kept.layout, source: 'saved', record: kept, changes: changed, final: true, mode: kept.mode, profile: kept.profile };
      }
      const now = live.layout?.materials.find((m) => m.material.id === id) ?? null;
      return { materialId: id, name, layout: now, source: 'live', record: kept, changes: changed, final: live.final, mode: layoutMode, profile: sawProfile };
    });
  }, [materials, list.groups, inputKeys, fixed, job, sawProfile, layoutMode, live.layout, live.final]);
  // The estimate counts sheets from a layout wherever one is finished.
  const layoutSheets = useMemo(
    () => Object.fromEntries(shownLayouts.flatMap((s) => (s.layout && s.final ? [[s.materialId, s.layout.stats.sheets] as const] : []))),
    [shownLayouts],
  );
  const estimate = useMemo(
    () => estimateJob(list, materials, { ...estimateSettings, layoutSheets }),
    [list, materials, estimateSettings, layoutSheets],
  );
  const usedSlots = useMemo<JobSlot[]>(() => {
    const used = new Set(estimate.lines.flatMap((l) => l.slots));
    return JOB_SLOTS.filter((slot) => used.has(slot));
  }, [estimate]);
  const asOf = useMemo(() => {
    const at = pricesAsOf(record, usedSlots);
    return at ? isoDate(new Date(at)) : null;
  }, [record, usedSlots]);
  const changes = useMemo(() => priceChanges(record, catalog, usedSlots), [record, catalog, usedSlots]);
  const rough = useMemo(() => roughPriced(record, usedSlots), [record, usedSlots]);
  const estimateData = useMemo<EstimateData>(() => ({ estimate, pricesAsOf: asOf, rough }), [estimate, asOf, rough]);

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
  const chooseSawProfile = (profileId: string) => {
    const found = sawSettings.profiles.find((p) => p.id === profileId);
    if (!found) return; // the job's own copy, already chosen
    const before = sawProfile;
    jobSession.commit((current) => ({ ...current, sawProfile: { ...found } }));
    showToast(`Saw profile: ${found.name}`, { label: 'Undo', run: () => jobSession.commit((current) => ({ ...current, sawProfile: before })) });
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

  const [layoutMaterial, setLayoutMaterial] = useState<string | null>(null);
  const shown = shownLayouts.find((s) => s.materialId === layoutMaterial) ?? shownLayouts[0] ?? null;
  const layoutsReady = shownLayouts.length > 0 && shownLayouts.every((s) => s.layout !== null && s.final);
  /** Why this page can't be exported or printed yet; null when it can. */
  const notReady = view !== 'layouts' || layoutsReady ? null : shownLayouts.length === 0 ? 'Nothing to lay out yet' : 'Still laying out…';
  const summaries = outputSummaries(
    list.totals,
    { materials: shownLayouts.length, ready: layoutsReady, sheets: shownLayouts.reduce((sum, s) => sum + (s.layout?.stats.sheets ?? 0), 0) },
    estimate,
  );
  /** Keep the layouts being printed that the job doesn't keep yet. */
  const keepPrinted = async (): Promise<void> => {
    const fresh = new Set(shownLayouts.filter((s) => s.source === 'live').map((s) => s.materialId));
    if (fresh.size === 0 || !live.layout || !live.final) return;
    try {
      await keepJobLayout(job, live.layout, layoutInput, fresh);
    } catch (error) {
      showToast(`The sheet layouts couldn’t be kept with the job. ${toStorageError(error).message}`);
    }
  };
  const printLayouts = async (): Promise<void> => {
    if (!layoutsReady) return;
    await print();
    await keepPrinted();
  };
  const recalculate =
    live.layout && live.final
      ? () => {
          const before = job.layouts ?? [];
          const done = live.layout!;
          keepJobLayout(job, done, layoutInput)
            .then(() =>
              showToast('Layouts recalculated and kept with the job', {
                label: 'Undo',
                run: () => void keepLayouts(job.id, before).catch((e: unknown) => showToast(toStorageError(e).message)),
              }),
            )
            .catch((error: unknown) => showToast(toStorageError(error).message));
        }
      : null;
  const modeStats = useMemo(() => {
    const stats: Partial<Record<LayoutMode, LayoutStats>> = {};
    if (!shown) return stats;
    for (const mode of LAYOUT_MODES) {
      const source = mode === shown.mode ? shown.layout : mode === layoutMode ? live.layout?.materials.find((m) => m.material.id === shown.materialId) : otherModes[mode]?.materials.find((m) => m.material.id === shown.materialId);
      if (source) stats[mode] = source.stats;
    }
    return stats;
  }, [shown, layoutMode, live.layout, otherModes]);
  const notes = useMemo<Sensitivity | null>(() => {
    if (!shown || !live.sensitivity) return null;
    const mine = <T extends { materialId: string }>(list: readonly T[]) => list.filter((n) => n.materialId === shown.materialId);
    const s = live.sensitivity;
    return { nearMisses: mine(s.nearMisses), fragile: mine(s.fragile), risks: mine(s.risks), lightSheets: mine(s.lightSheets) };
  }, [shown, live.sensitivity]);

  const dxfLayouts = useMemo(() => shownLayouts.flatMap((s) => (s.layout && s.final ? [s.layout] : [])), [shownLayouts]);
  const { phase, exportCsv, exportPdf, exportDxf } = useExports(job, data, estimateData, view, keepPrinted, dxfLayouts);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });
  const toolbarRef = useRef<HTMLDivElement>(null);
  usePinnedBar(toolbarRef);
  const printLayoutsRef = useRef(printLayouts);
  useEffect(() => {
    printLayoutsRef.current = printLayouts;
  });
  useShortcut({
    id: 'cutlist.print',
    keys: ['Ctrl+P'],
    scope: 'cutlist',
    label: 'Print the cut list, estimate or layouts',
    run: () => void (viewRef.current === 'layouts' ? printLayoutsRef.current() : print()),
  });

  const onPaginated = useCallback(() => {
    if (takePrintRequest()) void print();
  }, []);

  const dupes = [...duplicateLabels(job.cabinets)];
  /** Open the workspace on a cabinet. */
  const openCabinet = (cabinetId: string | undefined) => {
    if (cabinetId) selectCabinet(cabinetId);
    navigate({ name: 'workspace', jobId: job.id });
  };
  const fixFirst = () => {
    const first = list.blocked[0];
    openCabinet(first ? job.cabinets[first.index]?.id : undefined);
  };
  const renameFirst = () => openCabinet(job.cabinets.find((c) => labelKey(c.label) === dupes[0])?.id);
  const workspaceHref = routeHref({ name: 'workspace', jobId: job.id });
  const materialsHref = routeHref({ name: 'settings', section: 'materials' });

  // Parts with no material, and materials with no price (named, so the fix is obvious).
  const unassigned = estimate.total.unassigned;
  const catalogEmpty = catalog.length === 0;
  const unpriced = [...new Set(estimate.lines.flatMap((l) => (l.material && l.price === null ? [l.material.name] : [])))];
  const showUnpriced = view === 'estimate' && unpriced.length > 0;
  const noticeCount =
    list.blocked.length + list.jobIssues.length + list.materialIssues.length + dupes.length + unassigned.length + (showUnpriced ? 1 : 0) + (view === 'estimate' && rough.length > 0 ? 1 : 0);

  return (
    <div className={styles.root}>
      <div ref={toolbarRef} className={styles.toolbar}>
      <OutputTabs value={view} onChange={setView} summaries={summaries} />
      <div role="toolbar" aria-label={`${OUTPUT_NAMES[view]} options`} className={styles.options}>
        {view === 'layouts' ? (
          <>
            <div className={styles.listLabel}>
              <span className="cap" aria-hidden="true">
                Mode
              </span>
              <Segmented<LayoutMode>
                label="Layout mode"
                value={layoutMode}
                onChange={setLayoutMode}
                options={LAYOUT_MODES.map((m) => ({ value: m, label: <span title={MODE_HELP[m]}>{MODE_NAMES[m]}</span> }))}
              />
            </div>
            <label className={ls.toolPick}>
              <span className="cap">Saw</span>
              <select className={ls.toolSelect} value={sawProfile.id} onChange={(e) => chooseSawProfile(e.target.value)}>
                {!sawSettings.profiles.some((p) => p.id === sawProfile.id) && <option value={sawProfile.id}>{sawProfile.name}</option>}
                {sawSettings.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <InfoTip term="sawProfile" />
            <label className={ls.toolPick}>
              <span className="cap">Material</span>
              <select
                className={ls.toolSelect}
                value={shown?.materialId ?? ''}
                disabled={shownLayouts.length === 0}
                onChange={(e) => setLayoutMaterial(e.target.value)}
              >
                {shownLayouts.length === 0 && <option value="">None yet</option>}
                {shownLayouts.map((s) => (
                  <option key={s.materialId} value={s.materialId}>
                    {s.name}
                    {s.layout && s.final ? ` · ${s.layout.stats.sheets} ${s.layout.stats.sheets === 1 ? 'sheet' : 'sheets'}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
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
          </>
        )}
        <div className={styles.toolbarEnd}>
          {view === 'layouts' ? (
            <DxfButton phase={phase.dxf} disabledReason={notReady} onRun={(units) => void exportDxf(units)} />
          ) : (
            <ExportButton kind="csv" phase={phase.csv} disabledReason={notReady} onRun={() => void exportCsv()} />
          )}
          <ExportButton kind="pdf" phase={phase.pdf} disabledReason={notReady} onRun={() => void exportPdf()} />
          <Button
            variant="primary"
            size="lg"
            icon={<PrintIcon />}
            tooltip="Ctrl + P"
            {...(notReady ? { disabled: true, disabledReason: notReady } : {})}
            onClick={() => void (view === 'layouts' ? printLayouts() : print())}
          >
            Print…
          </Button>
        </div>
      </div>
      </div>

      <div id={OUTPUT_PANEL_ID} role="tabpanel" aria-labelledby={outputTabId(view)}>
      {(noticeCount > 0 || job.cabinets.length === 0) && (
        <div className={styles.notices}>
          {list.blocked.length > 0 && (
            <p className={styles.notice} role="alert">
              <strong>
                <SymbolMark symbol="needsFix" decorative />{' '}
                {list.blocked.map((b) => b.cabinetId.trim() || `Cabinet ${b.index + 1}`).join(', ')}{' '}
                {list.blocked.length === 1 ? 'needs a fix' : 'need a fix'}
              </strong>
              <span>
                {list.blocked.length === 1 ? 'It is' : 'They are'} left off this cut list, and the printout says so. Printing still works.
              </span>
              <a
                href={workspaceHref}
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
              <span>
                <SymbolMark symbol="warning" decorative />{' '}
                <span className="visually-hidden">Warning: </span>
                More than one cabinet uses the ID {dupes.join(', ')}. Rename one so the cut list can tell them apart.
              </span>
              <a
                href={workspaceHref}
                onClick={(e) => {
                  e.preventDefault();
                  renameFirst();
                }}
              >
                Rename in the workspace
              </a>
            </p>
          )}
          {unassigned.length > 0 && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note" data-notice="no-material">
              <span>
                <SymbolMark symbol="warning" decorative />{' '}
                <span className="visually-hidden">Warning: </span>
                <strong>No material chosen for {slotsText(unassigned).toLowerCase()}.</strong>{' '}
                {catalogEmpty
                  ? 'The materials catalog is empty, so there’s nothing to choose yet.'
                  : 'Those parts can’t be laid out, and the estimate total is incomplete.'}
              </span>
              {catalogEmpty ? (
                <a href={materialsHref}>Add materials in Settings → Materials</a>
              ) : (
                <button type="button" className={styles.noticeAction} onClick={focusMaterialsPanel}>
                  Choose materials
                </button>
              )}
            </p>
          )}
          {showUnpriced && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note" data-notice="no-price">
              <span>
                <SymbolMark symbol="warning" decorative />{' '}
                <span className="visually-hidden">Warning: </span>
                <strong>No price for {unpriced.join(', ')}.</strong> The estimate total is incomplete until {unpriced.length === 1 ? 'it has' : 'they have'} a price.
              </span>
              <a href={materialsHref}>Add prices in Settings → Materials</a>
            </p>
          )}
          {view === 'estimate' && rough.length > 0 && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note" data-notice="rough-prices">
              <span>
                <strong>{roughPricesText(rough)}</strong> KERFuffle filled these in so the estimate has a total; the printout says so too.
              </span>
              <a href={materialsHref}>Enter your prices in Settings → Materials</a>
            </p>
          )}
          {list.jobIssues.map(({ ref, issue }) => (
            <p key={`${ref}:${issue.field}`} className={cx(styles.notice, styles.noticeWarn)} role="note">
              <SymbolMark symbol="warning" decorative />{' '}
              <span className="visually-hidden">{issue.severity === 'error' ? 'Problem: ' : 'Warning: '}</span>
              {ref}: {issue.message}
            </p>
          ))}
          {list.materialIssues.map((issue) => (
            <p key={`${issue.slot}:${issue.message}`} className={cx(styles.notice, styles.noticeWarn)} role="note">
              <span>
                <SymbolMark symbol="warning" decorative />{' '}
                <span className="visually-hidden">Warning: </span>
                {issue.message}
              </span>
              <button type="button" className={styles.noticeAction} onClick={focusMaterialsPanel}>
                Choose materials
              </button>
            </p>
          ))}
          {job.cabinets.length === 0 && (
            <p className={cx(styles.notice, styles.noticeWarn)} role="note" data-notice="no-cabinets">
              <span>This job has no cabinets yet. Add them in the workspace and they’ll appear here.</span>
              <a href={workspaceHref}>Back to the workspace</a>
            </p>
          )}
        </div>
      )}

      <div className={styles.content}>
        {view === 'cutlist' ? (
          <Sheets data={data} ui={ui} onPaginated={onPaginated} />
        ) : view === 'estimate' ? (
          <EstimateSheet estimate={estimate} list={list} rules={job.rules} job={data.job} printed={printed} pricesAsOf={asOf} rough={rough} page={data.page} />
        ) : (
          <>
            <div className={ls.screenOnly}>
              <LayoutsView
                jobId={job.id}
                nothing={job.cabinets.length === 0 ? 'no-cabinets' : list.blocked.length >= job.cabinets.length ? 'no-parts' : 'no-material'}
                catalogEmpty={catalogEmpty}
                onChooseMaterials={focusMaterialsPanel}
                shown={shown}
                fixed={fixed}
                modeStats={modeStats}
                sensitivity={notes}
                jobUnplaced={live.layout?.unplaced ?? []}
                error={live.error}
                hotLine={hoverRow ?? pinnedRow}
                pinnedLine={pinnedRow}
                onLine={setHoverRow}
                onPinLine={(key) => setPinnedRow((p) => (p === key ? null : key))}
                onRecalculate={recalculate}
              />
            </div>
            {layoutsReady && <LayoutPages job={data.job} layouts={shownLayouts} jobUnplaced={live.layout?.unplaced ?? []} printed={printed} page={data.page} />}
          </>
        )}
        <PartSketch line={view === 'estimate' ? undefined : (sketchLine ?? null)} source={source} totals={list.totals} byCabinet={mode === 'by-cabinet'}>
          <MaterialsPanel
            jobId={job.id}
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
          <SawProfilePanel profile={sawProfile} usingDefault={!job.sawProfile} profiles={sawSettings.profiles} onChoose={chooseSawProfile} />
        </PartSketch>
      </div>
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
      <h1 className="visually-hidden">Output: {summary.name}</h1>
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
