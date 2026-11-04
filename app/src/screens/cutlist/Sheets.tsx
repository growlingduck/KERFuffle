import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { constructionName } from '@kerfuffle/engine';
import type { CabinetType, ConstructionRules, CutList, CutListLine, CutListSortKey, Ticks } from '@kerfuffle/engine';
import { InfoTip } from '../../components/InfoTip';
import { STATUS_INFO } from '../../components/Stamp';
import { TitleBlock } from '../../components/TitleBlock';
import { Tooltip } from '../../components/Tooltip';
import { blockedText, generalNotes, GRAIN_WORDS, groupTitle, lineName, optionsText, refText, thicknessText } from '../../cutlist/format';
import type { PageSize } from '../../cutlist/format';
import { paginate } from '../../cutlist/paginate';
import type { MeasuredGroup, PageLayout, PagePiece } from '../../cutlist/paginate';
import type { JobStatus } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import type { GlossaryKey } from '../../lib/glossary';
import { cx } from '../../lib/interaction';
import styles from './CutList.module.css';

export interface SheetJob {
  name: string;
  number: string;
  customer: string;
  status: JobStatus;
  revision: number;
}

export interface CabinetChip {
  /** Position in the job, so repeated labels stay distinct. */
  index: number;
  label: string;
  type: CabinetType;
  width: Ticks;
  height: Ticks;
  depth: Ticks;
  quantity: number;
  blocked: boolean;
}

export interface SheetData {
  list: CutList;
  rules: ConstructionRules;
  job: SheetJob;
  chips: readonly CabinetChip[];
  /** 2026-10-31 */
  printed: string;
  page: PageSize;
}

/** Hover, pins and sorting. Absent on the hidden measuring sheet. */
export interface SheetInteraction {
  /** Cabinet being traced (pointed at or pinned). */
  activeCabinet: string | null;
  pinnedCabinet: string | null;
  /** Merged-line key of the row pointed at (or pinned). */
  hotRow: string | null;
  pinnedRow: string | null;
  sort: CutList['options']['sort'];
  onSort: (key: CutListSortKey) => void;
  onCabinet: (label: string | null) => void;
  onPinCabinet: (label: string | null) => void;
  onRow: (key: string | null) => void;
  onPinRow: (key: string) => void;
}

/** A row's identity on the sheet. By cabinet, Left and Right side share a cut but are separate rows. */
const rowId = (line: CutListLine) => `${line.key}#${line.roles.join('+')}`;

interface SheetGroup {
  id: string;
  kind: 'merged' | 'cabinet';
  title: string;
  /** By cabinet: sizes and "build n". */
  sub?: string;
  thumb?: { width: number; height: number };
  pieces: number;
  lines: CutListLine[];
  /** By cabinet: the cabinet label, for tracing. */
  cabinet?: string;
  /** An info tip beside the title (screen only). */
  term?: GlossaryKey;
}

function sheetGroups(data: SheetData): SheetGroup[] {
  const { list, rules } = data;
  if (list.options.mode === 'merged') {
    return list.groups.map((g) => ({
      id: g.id,
      kind: 'merged',
      title: groupTitle(g, rules),
      pieces: g.pieces,
      lines: g.lines,
      ...(g.category === 'laminate' ? { term: 'laminate' as const } : {}),
    }));
  }
  const cabinets = list.sections.map((s): SheetGroup => {
    const c = s.cabinet;
    const size = `${displayInches(c.width)} W × ${displayInches(c.height)} H × ${displayInches(c.depth)} D`;
    return {
      id: `cabinet:${s.index}`,
      kind: 'cabinet',
      title: `${c.id} · ${c.type === 'base' ? 'Base' : 'Wall'}`,
      sub: c.quantity > 1 ? `${size} · build ${c.quantity}` : size,
      thumb: { width: c.width, height: c.height },
      pieces: s.pieces,
      lines: s.lines,
      cabinet: c.id,
    };
  });
  // Parts a run shares (its ladder base) follow the cabinets, under the run's name.
  const runs = list.runSections.map((s): SheetGroup => ({
    id: `run:${s.run}`,
    kind: 'cabinet',
    title: s.ref,
    sub: 'Shared base',
    pieces: s.pieces,
    lines: s.lines,
    cabinet: s.ref,
  }));
  return [...cabinets, ...runs];
}

const ZONES = ['A', 'B', 'C', 'D'];

/** Sheet border with zone marks 1–4 across and A–D down. */
export function Zones() {
  return (
    <div aria-hidden="true">
      {[1, 2, 3, 4].map((n, i) => (
        <span key={`t${n}`} className={styles.zone} style={{ top: -16, left: `${12 + i * 25}%` }}>
          {n}
        </span>
      ))}
      {ZONES.map((z, i) => (
        <span key={`l${z}`} className={styles.zone} style={{ left: -15, top: `${10 + i * 25}%` }}>
          {z}
        </span>
      ))}
      {ZONES.map((z, i) => (
        <span key={`r${z}`} className={styles.zone} style={{ right: -15, top: `${10 + i * 25}%` }}>
          {z}
        </span>
      ))}
      {[25, 50, 75].map((p) => (
        <span key={`h${p}`} className={styles.tickH} style={{ left: `${p}%` }} />
      ))}
      {[25, 50, 75].map((p) => (
        <span key={`v${p}`} className={styles.tickV} style={{ top: `${p}%` }} />
      ))}
    </div>
  );
}

function CabinetChips({ data, ui }: { data: SheetData; ui: SheetInteraction | null }) {
  const hotRow = ui?.hotRow ?? null;
  const hotRefs = useMemo(() => {
    const line = hotRow ? data.list.lines.find((l) => l.key === hotRow) : undefined;
    return new Set(line?.refs.map((r) => r.cabinetId));
  }, [data.list, hotRow]);
  return (
    <div className={styles.intro}>
      <span className={cx('cap', styles.introLabel)}>Cabinets</span>
      {data.chips.map((chip) => {
        const pinned = ui?.pinnedCabinet === chip.label;
        const hot = !pinned && (ui?.activeCabinet === chip.label || hotRefs.has(chip.label));
        const size = `${displayInches(chip.width)}${chip.quantity > 1 ? ` ×${chip.quantity}` : ''}`;
        const kind = chip.type === 'base' ? 'Base' : 'Wall';
        const dims = `${displayInches(chip.width)} × ${displayInches(chip.height)} × ${displayInches(chip.depth)}`;
        const tip = chip.blocked
          ? `${kind} ${dims} · needs a fix, not listed`
          : `${kind} ${dims} · ${pinned ? 'click to show all' : 'click to show only this'}`;
        const button = (
          <button
            type="button"
            className={cx(styles.chip, hot && styles.chipHot, pinned && styles.chipPinned, chip.blocked && styles.chipBlocked)}
            aria-pressed={ui ? pinned : undefined}
            data-cabinet={chip.label}
            onPointerEnter={() => ui?.onCabinet(chip.label)}
            onPointerLeave={() => ui?.onCabinet(null)}
            onFocus={() => ui?.onCabinet(chip.label)}
            onBlur={() => ui?.onCabinet(null)}
            onClick={() => ui?.onPinCabinet(pinned ? null : chip.label)}
          >
            {chip.label}
            <span className={styles.chipSize}>{size}</span>
            {chip.blocked && <span className="visually-hidden"> (needs a fix, not listed)</span>}
          </button>
        );
        return ui ? (
          <Tooltip key={chip.index} content={tip} placement="bottom" describe>
            {button}
          </Tooltip>
        ) : (
          <span key={chip.index}>{button}</span>
        );
      })}
      {ui?.pinnedCabinet && (
        <button type="button" className={cx(styles.chip, styles.chipShowAll)} onClick={() => ui.onPinCabinet(null)}>
          Show all
        </button>
      )}
    </div>
  );
}

const SORT_LABELS: Record<CutListSortKey, string> = { name: 'Part', length: 'Length', width: 'Width', quantity: 'Qty' };

function SortHeader({ k, ui, className }: { k: CutListSortKey; ui: SheetInteraction | null; className?: string | undefined }) {
  const active = ui?.sort.key === k;
  const dir = ui?.sort.dir;
  return (
    <th scope="col" className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {ui ? (
        <button type="button" className={styles.sortBtn} onClick={() => ui.onSort(k)}>
          {SORT_LABELS[k]}
          <span className={styles.sortArrow} aria-hidden="true">
            {active ? (dir === 'asc' ? '▲' : '▼') : ''}
          </span>
        </button>
      ) : (
        SORT_LABELS[k]
      )}
    </th>
  );
}

function Row({ line, group, ui }: { line: CutListLine; group: SheetGroup; ui: SheetInteraction | null }) {
  const merged = group.kind === 'merged';
  const active = ui?.activeCabinet ?? null;
  const dim = merged && active !== null && !line.refs.some((r) => r.cabinetId === active);
  const hot = ui?.hotRow === line.key;
  const pinned = ui?.pinnedRow === line.key;
  const name = lineName(line);
  return (
    <tr
      className={cx(styles.row, hot && styles.rowHot, !hot && pinned && styles.rowPinned, dim && styles.dim)}
      data-row-id={rowId(line)}
      data-mark={line.mark}
      data-hot={hot || undefined}
      data-dimmed={dim || undefined}
      onPointerEnter={() => ui?.onRow(line.key)}
      onPointerLeave={() => ui?.onRow(null)}
      onClick={() => ui?.onPinRow(line.key)}
    >
      <td>
        <span className={styles.box} aria-hidden="true" />
      </td>
      <td>
        <button
          type="button"
          className={styles.markBtn}
          aria-pressed={ui ? pinned : undefined}
          aria-label={`${line.mark}: sketch ${name}`}
          tabIndex={ui ? undefined : -1}
          onFocus={() => ui?.onRow(line.key)}
          onBlur={() => ui?.onRow(null)}
          onClick={(e) => {
            // The row's own click handler pins; don't pin twice.
            e.stopPropagation();
            ui?.onPinRow(line.key);
          }}
        >
          <span className={styles.pm}>{line.mark}</span>
        </button>
      </td>
      <td className={cx(line.optional && styles.optional)}>{name}</td>
      <td className={cx(styles.center, styles.grain)}>
        <GrainArrow grain={line.grain} />
        <span className="visually-hidden">{GRAIN_WORDS[line.grain]}</span>
      </td>
      <td className={styles.num}>{displayInches(line.length)}</td>
      <td className={styles.num}>{displayInches(line.width)}</td>
      {!merged && <td className={styles.num}>{thicknessText(line.thickness)}</td>}
      <td className={styles.num}>{line.quantity}</td>
      {merged && (
        <td className={styles.ref}>
          {line.refs.map((r, i) => (
            <span key={r.cabinetId}>
              <span className={cx(active === r.cabinetId && styles.refHot)}>{refText(r)}</span>
              {i < line.refs.length - 1 ? ', ' : ''}
            </span>
          ))}
        </td>
      )}
    </tr>
  );
}

/**
 * Grain direction, drawn rather than typed: the arrow characters fall back to a
 * colour emoji font on Windows, and the sheet must print in black.
 */
function GrainArrow({ grain }: { grain: CutListLine['grain'] }) {
  const up = 'M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3';
  const across = 'M2 8h12M5 5L2 8l3 3M11 5l3 3-3 3';
  return (
    <svg className={styles.grainIcon} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" data-grain={grain}>
      {grain !== 'horizontal' && <path d={up} />}
      {grain !== 'vertical' && <path d={across} />}
    </svg>
  );
}

function GroupPiece({
  group,
  lines,
  cont,
  ui,
}: {
  group: SheetGroup;
  lines: readonly CutListLine[];
  cont: boolean;
  ui: SheetInteraction | null;
}) {
  const merged = group.kind === 'merged';
  const dim = !merged && ui?.activeCabinet != null && ui.activeCabinet !== group.cabinet;
  const thumb = group.thumb;
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  if (thumb) {
    const m = Math.min(18 / thumb.width, 24 / thumb.height);
    rect = { w: thumb.width * m, h: thumb.height * m, x: (22 - thumb.width * m) / 2, y: 27 - thumb.height * m };
  }
  return (
    <section className={cx(styles.group, dim && styles.dim)} data-group={group.id} data-dimmed={dim || undefined} aria-label={`${group.title}${cont ? ', continued' : ''}`}>
      <div className={styles.groupHead} data-measure="head">
        <div className={styles.groupTitle}>
          {rect && (
            <svg className={styles.thumb} width="22" height="28" viewBox="0 0 22 28" aria-hidden="true">
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" stroke="#000" strokeWidth="1.2" />
            </svg>
          )}
          <h2>
            {group.title}
            {cont && <span className={styles.cont}>, cont.</span>}
          </h2>
          {group.term && <InfoTip term={group.term} />}
          {group.sub && <span className={cx('mono', styles.groupSub)}>{group.sub}</span>}
        </div>
        <span className={cx('mono', styles.groupCount)}>{group.pieces} pcs</span>
      </div>
      <table className={styles.tbl}>
        <colgroup>
          <col className={styles.colCheck} />
          <col className={styles.colMark} />
          <col />
          <col className={styles.colGrain} />
          <col className={styles.colDim} />
          <col className={styles.colDim} />
          {!merged && <col className={styles.colThick} />}
          <col className={styles.colQty} />
          {merged && <col className={styles.colRefs} />}
        </colgroup>
        <thead data-measure="thead">
          <tr>
            <th scope="col">
              <span className="visually-hidden">Cut</span>
            </th>
            <th scope="col">Mark</th>
            {merged ? <SortHeader k="name" ui={ui} /> : <th scope="col">Part</th>}
            <th scope="col" className={styles.center}>
              Grain
            </th>
            {merged ? <SortHeader k="length" ui={ui} className={styles.right} /> : <th scope="col" className={styles.right}>Length</th>}
            {merged ? <SortHeader k="width" ui={ui} className={styles.right} /> : <th scope="col" className={styles.right}>Width</th>}
            {!merged && (
              <th scope="col" className={styles.right}>
                Thick.
              </th>
            )}
            {merged ? <SortHeader k="quantity" ui={ui} className={styles.right} /> : <th scope="col" className={styles.right}>Qty</th>}
            {merged && <th scope="col">From cabinets</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Row key={rowId(line)} line={line} group={group} ui={ui} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface FrameProps {
  data: SheetData;
  groups: readonly SheetGroup[];
  pieces: readonly PagePiece[] | 'all';
  sheet: number;
  sheets: number;
  ui: SheetInteraction | null;
  measure?: boolean;
}

/** One printed sheet: border, header, body, notes and title block. */
const Frame = memo(function Frame({ data, groups, pieces, sheet, sheets, ui, measure = false }: FrameProps) {
  const { job, list } = data;
  const excludes = blockedText(list.blocked);
  const last = sheet === sheets;
  const totalPieces = list.totals.panelPieces + list.totals.laminatePieces;
  const byId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  let body: ReactNode;
  if (pieces === 'all') {
    body = (
      <>
        <div data-measure="intro">
          <CabinetChips data={data} ui={null} />
        </div>
        {groups.map((g) => (
          <GroupPiece key={g.id} group={g} lines={g.lines} cont={false} ui={null} />
        ))}
      </>
    );
  } else {
    body = pieces.map((piece) => {
      if (piece.kind === 'intro') return <CabinetChips key="intro" data={data} ui={ui} />;
      const group = byId.get(piece.groupId);
      if (!group) return null;
      const wanted = new Set(piece.rowKeys);
      const lines = group.lines.filter((l) => wanted.has(rowId(l)));
      return <GroupPiece key={`${piece.groupId}:${piece.cont}`} group={group} lines={lines} cont={piece.cont} ui={ui} />;
    });
  }

  const status = STATUS_INFO[job.status];
  return (
    <article
      className={cx(styles.frame, measure && styles.measure)}
      aria-label={measure ? undefined : `Sheet ${sheet} of ${sheets}`}
      aria-hidden={measure || undefined}
      inert={measure || undefined}
      data-sheet={measure ? undefined : sheet}
      data-measure-frame={measure || undefined}
    >
      <div className={styles.border}>
        <Zones />
        <header className={styles.head}>
          <div>
            <div className={cx('cap', styles.kicker)}>KERFuffle · Cut list</div>
            <div className={styles.jobName}>
              {job.name}
            </div>
          </div>
          <div className={cx('mono', styles.modeLine)}>
            <span className={styles.modeConstruction}>{constructionName(data.rules.method)}</span>
            <span>{optionsText(list.options)}</span>
          </div>
        </header>
        {excludes && (
          <p className={styles.excludes}>
            <span aria-hidden="true">⚠ </span>
            {excludes}
          </p>
        )}
        <div className={styles.body} data-measure="body">
          {body}
        </div>
        <footer className={styles.foot}>
          <div className={cx(styles.notes, !last && styles.notesHidden)} aria-hidden={!last || undefined}>
            <div className={cx('cap', styles.notesTitle)}>General notes</div>
            <ol>
              {generalNotes(data.rules).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ol>
          </div>
          <div className={styles.tbWrap}>
            <TitleBlock
              density="compact"
              columns={8}
              className={styles.titleBlock}
              cells={[
                { label: 'Job', value: <strong>{job.name}</strong>, span: 5 },
                { label: 'Job no.', value: <span className="mono">{job.number}</span>, span: 3 },
                { label: 'Customer', value: job.customer || '—', span: 5 },
                {
                  label: 'Status',
                  value: (
                    <span className="cap">
                      <span aria-hidden="true">{status.glyph} </span>
                      {status.label}
                    </span>
                  ),
                  span: 3,
                },
                { label: 'Construction', value: constructionName(data.rules.method), span: 5 },
                { label: 'Contents', value: `${list.totals.boxes} boxes · ${totalPieces} pieces`, span: 3 },
                { label: 'List', value: optionsText(list.options), span: 8 },
                { label: 'Printed', value: <span className="mono">{data.printed}</span>, span: 3 },
                { label: 'Scale', value: <span className="mono">N.T.S.</span>, span: 2 },
                {
                  label: 'Rev.',
                  value: (
                    <span className="mono">
                      <span aria-hidden="true">△</span>
                      {job.revision}
                    </span>
                  ),
                  span: 1,
                },
                {
                  label: 'Sheet',
                  value: (
                    <span className={styles.sheetNo}>
                      {sheet} / {sheets}
                    </span>
                  ),
                  span: 2,
                },
                { label: 'Cut by / date', value: <span className={styles.signature} />, span: 4 },
                { label: 'Checked by / date', value: <span className={styles.signature} />, span: 4 },
              ]}
            />
            {job.status === 'draft' && (
              <span className={styles.draftStamp} aria-label="Draft: not ready to cut">
                DRAFT
              </span>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
});

/** Heights the pager needs, read from the hidden measuring sheet. */
function measureSheet(root: HTMLElement, groups: readonly SheetGroup[]): { bodyHeight: number; introHeight: number; groups: MeasuredGroup[] } {
  const height = (el: Element | null | undefined) => (el instanceof HTMLElement ? el.getBoundingClientRect().height : 0);
  const body = root.querySelector('[data-measure="body"]');
  // A little slack for rounding between the screen and the printer.
  const bodyHeight = Math.max(0, (body instanceof HTMLElement ? body.clientHeight : 0) - 6);
  const sections = new Map([...root.querySelectorAll<HTMLElement>('[data-group]')].map((el) => [el.dataset.group, el]));
  const measured = groups.map((g) => {
    const section = sections.get(g.id);
    const rows = new Map<string, number>();
    section?.querySelectorAll<HTMLElement>('tr[data-row-id]').forEach((tr) => rows.set(tr.dataset.rowId ?? '', height(tr)));
    return {
      id: g.id,
      headHeight: height(section?.querySelector('[data-measure="head"]')) + height(section?.querySelector('[data-measure="thead"]')),
      rows: g.lines.map((l) => ({ key: rowId(l), height: rows.get(rowId(l)) ?? 0 })),
    };
  });
  return { bodyHeight, introHeight: height(root.querySelector('[data-measure="intro"]')), groups: measured };
}

/** Re-measure once web fonts have loaded: they change row heights. */
function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useLayoutEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return;
    let live = true;
    const bump = () => {
      if (live) setVersion((v) => v + 1);
    };
    void fonts.ready.then(bump);
    fonts.addEventListener?.('loadingdone', bump);
    return () => {
      live = false;
      fonts.removeEventListener?.('loadingdone', bump);
    };
  }, []);
  return version;
}

export interface SheetsProps {
  data: SheetData;
  ui: SheetInteraction;
  /** Called with the sheet count whenever pagination settles. */
  onPaginated?: (sheets: number) => void;
}

/**
 * The printed sheets, paginated from real measurements. A hidden copy of one
 * sheet holds every row so each height can be read; the visible sheets are
 * then filled in order. Screen, print and PDF all use these sheets.
 */
export function Sheets({ data, ui, onPaginated }: SheetsProps) {
  const groups = useMemo(() => sheetGroups(data), [data]);
  const measureRef = useRef<HTMLDivElement>(null);
  const fontsVersion = useFontsVersion();
  const [layout, setLayout] = useState<PageLayout[] | null>(null);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    setLayout(paginate(measureSheet(root, groups)));
  }, [groups, fontsVersion]);

  const pages: PageLayout[] = layout ?? [
    { pieces: [{ kind: 'intro' }, ...groups.map((g) => ({ kind: 'group' as const, groupId: g.id, cont: false, rowKeys: g.lines.map(rowId) }))] },
  ];

  const onPaginatedRef = useRef(onPaginated);
  useLayoutEffect(() => {
    onPaginatedRef.current = onPaginated;
  });
  useLayoutEffect(() => {
    if (layout) onPaginatedRef.current?.(layout.length);
  }, [layout]);

  const pageStyle = { '--page-w': `${data.page.widthIn}in`, '--page-h': `${data.page.heightIn}in` } as CSSProperties;
  return (
    <div className={styles.pages} style={pageStyle} data-sheets={pages.length}>
      <style>{`@page { size: ${data.page.widthIn}in ${data.page.heightIn}in; margin: 0; }`}</style>
      <div ref={measureRef} style={{ display: 'contents' }}>
        <Frame data={data} groups={groups} pieces="all" sheet={1} sheets={1} ui={null} measure />
      </div>
      {pages.map((page, i) => (
        <Frame key={i} data={data} groups={groups} pieces={page.pieces} sheet={i + 1} sheets={pages.length} ui={ui} />
      ))}
    </div>
  );
}
