import type { CSSProperties } from 'react';
import { constructionName } from '@kerfuffle/engine';
import type { ConstructionRules, CutList, Estimate } from '@kerfuffle/engine';
import { STATUS_INFO } from '../../components/Stamp';
import { TitleBlock } from '../../components/TitleBlock';
import {
  costText,
  estimateNotes,
  neededDetail,
  neededText,
  onHandText,
  priceText,
  sheetsBasisText,
  slotsText,
  toBuyText,
  totalText,
} from '../../cutlist/estimate';
import { blockedText } from '../../cutlist/format';
import type { PageSize } from '../../cutlist/format';
import { formatMoney, priceUnit } from '../../data/materials';
import { cx } from '../../lib/interaction';
import styles from './CutList.module.css';
import type { SheetJob } from './Sheets';
import { Zones } from './Sheets';
import { SymbolMark } from '../../components/InfoTip';

export interface EstimateSheetProps {
  estimate: Estimate;
  list: CutList;
  rules: ConstructionRules;
  job: SheetJob;
  printed: string;
  pricesAsOf: string | null;
  /** Materials priced at a rough starting price; named in the notes. */
  rough?: readonly string[];
  page: PageSize;
}

/**
 * The purchase estimate on one printed sheet, with the cut list's border,
 * title block and print rules: material · needed · on hand · to buy · price ·
 * cost, then the job total. Shown on screen as the Estimate panel.
 */
export function EstimateSheet({ estimate, list, rules, job, printed, pricesAsOf, rough = [], page }: EstimateSheetProps) {
  const excludes = blockedText(list.blocked);
  const status = STATUS_INFO[job.status];
  const complete = estimate.total.cost !== null;
  const pageStyle = { '--page-w': `${page.widthIn}in`, '--page-h': `${page.heightIn}in` } as CSSProperties;
  return (
    <div className={styles.pages} style={pageStyle} data-sheets={1}>
      <style>{`@page { size: ${page.widthIn}in ${page.heightIn}in; margin: 0; }`}</style>
      <article className={styles.frame} aria-label="Estimate, sheet 1 of 1" data-sheet={1}>
        <div className={styles.border}>
          <Zones />
          <header className={styles.head}>
            <div>
              <div className={cx('cap', styles.kicker)}>KERFuffle · Estimate</div>
              <div className={styles.jobName}>{job.name}</div>
            </div>
            <div className={cx('mono', styles.modeLine)}>
              <span className={styles.modeConstruction}>{constructionName(rules.method)}</span>
              <span>Shop purchase estimate · {pricesAsOf ? `prices as of ${pricesAsOf}` : 'no prices yet'}</span>
            </div>
          </header>
          {excludes && (
            <p className={styles.excludes}>
              <SymbolMark symbol="needsFix" />{' '}
              {excludes}
            </p>
          )}
          <div className={styles.body}>
            <section className={styles.group} aria-label="Materials to buy">
              <div className={styles.groupHead}>
                <div className={styles.groupTitle}>
                  <h2>Materials to buy</h2>
                  <span className={cx('mono', styles.groupSub)}>{sheetsBasisText(estimate)}</span>
                </div>
                <span className={cx('mono', styles.groupCount)}>{estimate.lines.length} lines</span>
              </div>
              {estimate.lines.length === 0 ? (
                <p className={styles.estimateEmpty}>Nothing to buy yet: this job has no parts on its cut list.</p>
              ) : (
                <table className={cx(styles.tbl, styles.estTbl)}>
                  <colgroup>
                    <col />
                    <col className={styles.colEstNum} />
                    <col className={styles.colEstSmall} />
                    <col className={styles.colEstSmall} />
                    <col className={styles.colEstPrice} />
                    <col className={styles.colEstCost} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Material</th>
                      <th scope="col" className={styles.right}>
                        Needed
                      </th>
                      <th scope="col" className={styles.right}>
                        On hand
                      </th>
                      <th scope="col" className={styles.right}>
                        To buy
                      </th>
                      <th scope="col" className={styles.right}>
                        Price
                      </th>
                      <th scope="col" className={styles.right}>
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line) => {
                      const detail = neededDetail(line, estimate);
                      return (
                        <tr key={line.key} className={styles.estRow} data-estimate-line={line.key}>
                          <td>
                            <div className={styles.estName}>{line.material?.name ?? <em>No material chosen</em>}</div>
                            <div className={styles.estSub}>{slotsText(line.slots)}</div>
                            {line.oversize.length > 0 && (
                              <div className={styles.estWarn}>
                                <SymbolMark symbol="warning" />{' '}
                                {line.oversize.join(', ')} {line.oversize.length === 1 ? 'is' : 'are'} bigger than one sheet
                              </div>
                            )}
                          </td>
                          <td className={styles.num}>
                            <div>{neededText(line)}</div>
                            {detail && <div className={styles.estSub}>{detail}</div>}
                          </td>
                          <td className={styles.num}>{onHandText(line)}</td>
                          <td className={cx(styles.num, styles.estBuy)}>{toBuyText(line)}</td>
                          <td className={cx(styles.num, line.material && line.price === null && styles.estNeedsPrice)}>
                            {line.material && line.price !== null ? (
                              <>
                                <div>{formatMoney(line.price)}</div>
                                <div className={styles.estSub}>{priceUnit(line.material)}</div>
                              </>
                            ) : (
                              priceText(line)
                            )}
                          </td>
                          <td className={styles.num}>{costText(line)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={styles.estTotal}>
                      <th scope="row" colSpan={complete ? 5 : 3}>
                        Job total, materials to buy
                      </th>
                      <td colSpan={complete ? 1 : 3} className={cx(styles.num, !complete && styles.estIncomplete)} data-estimate-total>
                        {!complete && <><SymbolMark symbol="needsFix" />{' '}</>}
                        {totalText(estimate)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>
          </div>
          <footer className={styles.foot}>
            <div className={styles.notes}>
              <div className={cx('cap', styles.notesTitle)}>General notes</div>
              <ol>
                {estimateNotes(estimate, list, rough).map((note) => (
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
                  { label: 'Construction', value: constructionName(rules.method), span: 5 },
                  { label: 'Contents', value: `${list.totals.boxes} boxes · estimate`, span: 3 },
                  { label: 'Prices as of', value: <span className="mono">{pricesAsOf ?? '—'}</span>, span: 3 },
                  { label: 'Total', value: <span className="mono">{complete ? totalText(estimate) : 'incomplete'}</span>, span: 5 },
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
                  { label: 'Sheet', value: <span className={styles.sheetNo}>1 / 1</span>, span: 2 },
                  { label: 'Checked by / date', value: <span className={styles.signature} />, span: 8 },
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
    </div>
  );
}
