import type { CSSProperties } from 'react';
import type { MaterialLayout, SawProfile, UnplacedPiece } from '@kerfuffle/engine';
import { STATUS_INFO } from '../../components/Stamp';
import { TitleBlock } from '../../components/TitleBlock';
import { cutSequence, layoutPages, MODE_NAMES, sheetNumbersText, sheetSizeText, sheetsText } from '../../cutlist/layoutText';
import type { PageSize } from '../../cutlist/format';
import { exactInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import cl from './CutList.module.css';
import { LayoutDrawing } from './LayoutDrawing';
import styles from './Layouts.module.css';
import type { ShownLayout } from './LayoutsView';
import type { SheetJob } from './Sheets';
import { Zones } from './Sheets';

export interface LayoutPagesProps {
  job: SheetJob;
  /** Every material's layout, in cut-list order. Materials still laying out are left out. */
  layouts: readonly ShownLayout[];
  jobUnplaced: readonly UnplacedPiece[];
  printed: string;
  page: PageSize;
}

/**
 * The drawing's width on paper, in CSS pixels: its column (61% of a letter
 * page's body) exactly, so text prints at the size it's drawn.
 */
const PRINT_DRAWING_PX = 418;
/** A cut sequence this long prints smaller, so it stays beside its drawing. */
const DENSE_STEPS = 28;

function sawText(profile: SawProfile): string {
  return `${profile.name} · kerf ${exactInches(profile.kerf)} · trim ${exactInches(profile.edgeTrim)} each edge`;
}

/**
 * The sheet layouts as printed pages (plan §2.7): one pattern a page, or two
 * small ones, each with its numbered cut sequence beside the drawing and a
 * tick box for every sheet cut to it. The cut list's border, zones, title
 * block and print rules. Print only: the Layouts tab shows the same drawings.
 */
export function LayoutPages({ job, layouts, jobUnplaced, printed, page }: LayoutPagesProps) {
  const ready = layouts.filter((l): l is ShownLayout & { layout: MaterialLayout } => l.layout !== null);
  const pages = layoutPages(ready.map((l) => l.layout));
  const status = STATUS_INFO[job.status];
  const pageStyle = { '--page-w': `${page.widthIn}in`, '--page-h': `${page.heightIn}in` } as CSSProperties;
  const total = pages.length;
  return (
    <div className={cx(cl.pages, styles.printOnly)} style={pageStyle} data-layout-pages={total}>
      <style>{`@page { size: ${page.widthIn}in ${page.heightIn}in; margin: 0; }`}</style>
      {pages.map((pg, i) => {
        const shown = ready[pg.material]!;
        const m = shown.layout;
        const unplaced = pg.lastOfMaterial ? [...m.unplaced, ...(pg.material === ready.length - 1 ? jobUnplaced : [])] : [];
        return (
          <article key={i} className={cl.frame} aria-label={`Layout sheet ${i + 1} of ${total}`} data-layout-page={i + 1}>
            <div className={cl.border}>
              <Zones />
              <header className={cl.head}>
                <div>
                  <div className={cx('cap', cl.kicker)}>KERFuffle · Sheet layouts</div>
                  <div className={cl.jobName}>{job.name}</div>
                </div>
                <div className={cx('mono', cl.modeLine)}>
                  <span className={cl.modeConstruction}>
                    {shown.name} · {sheetSizeText(m)}
                  </span>
                  <span>{sawText(shown.profile)}</span>
                </div>
              </header>
              <div className={cx(cl.body, styles.printBody)}>
                {pg.patterns.map((index) => {
                  const p = m.patterns[index]!;
                  const steps = cutSequence(p);
                  return (
                    <section key={p.id} className={styles.printPattern} aria-label={`Pattern ${p.id}`}>
                      <h2 className={styles.printPatternTitle}>
                        Pattern {p.id} <span className={styles.times}>× {p.count}</span>
                        <span className={cx('mono', styles.printPatternSub)}>
                          {sheetNumbersText(p)} · {p.yieldPercent.toFixed(1)}% used · {p.placements.length} pieces
                        </span>
                      </h2>
                      <div className={styles.printRow}>
                        <div className={styles.printDrawing}>
                          <LayoutDrawing
                            layout={m}
                            pattern={p}
                            trim={shown.profile.edgeTrim}
                            widthPx={PRINT_DRAWING_PX}
                            label={`Pattern ${p.id} of ${shown.name}`}
                          />
                          <div className={styles.ticks}>
                            {p.sheets.map((sheet) => (
                              <span key={sheet.number} className={styles.tick}>
                                <span className={cl.box} aria-hidden="true" /> Sheet {sheet.number}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.printSteps}>
                          <div className={cx('cap', styles.printStepsTitle)}>Cut sequence</div>
                          <ol className={cx(styles.sequence, steps.length > DENSE_STEPS && styles.sequenceDense)}>
                            {steps.map((s) => (
                              <li key={s.n}>{s.text}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    </section>
                  );
                })}
                {unplaced.length > 0 && (
                  <section className={styles.printUnplaced} aria-label="Not on these sheets">
                    <div className={cx('cap', styles.printStepsTitle)}>Not on these sheets</div>
                    <ul>
                      {unplaced.map((u) => (
                        <li key={u.piece.id}>{u.message}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
              <footer className={cl.foot}>
                <div className={cl.notes}>
                  <div className={cx('cap', cl.notesTitle)}>General notes</div>
                  <ol>
                    <li>Sizes in inches, exact to 1/64″. Rips are numbered in cut order down the side of each drawing.</li>
                    <li>Cut every rip at one fence setting before moving the fence, then crosscut strip by strip.</li>
                    <li>Lines run with the grain; widely hatched offcuts are worth keeping, closely hatched ones are waste.</li>
                  </ol>
                </div>
                <div className={cl.tbWrap}>
                  <TitleBlock
                    density="compact"
                    columns={8}
                    className={cl.titleBlock}
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
                      { label: 'Material', value: shown.name, span: 5 },
                      { label: 'Layout', value: `${MODE_NAMES[shown.mode]} · ${sheetsText(m.stats.sheets)}`, span: 3 },
                      { label: 'Saw profile', value: <span className="mono">{sawText(shown.profile)}</span>, span: 8 },
                      { label: 'Printed', value: <span className="mono">{printed}</span>, span: 3 },
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
                          <span className={cl.sheetNo}>
                            {i + 1} / {total}
                          </span>
                        ),
                        span: 2,
                      },
                      { label: 'Cut by / date', value: <span className={cl.signature} />, span: 4 },
                      { label: 'Checked by / date', value: <span className={cl.signature} />, span: 4 },
                    ]}
                  />
                  {job.status === 'draft' && (
                    <span className={cl.draftStamp} aria-label="Draft: not ready to cut">
                      DRAFT
                    </span>
                  )}
                </div>
              </footer>
            </div>
          </article>
        );
      })}
    </div>
  );
}
