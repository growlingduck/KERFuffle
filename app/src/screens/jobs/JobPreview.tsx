import { useMemo } from 'react';
import { Button, ButtonLink } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { STATUS_INFO } from '../../components/Stamp';
import { TitleBlock } from '../../components/TitleBlock';
import { ViewTitle } from '../../components/ViewTitle';
import { layoutElevation } from '../../lib/elevation';
import { cx } from '../../lib/interaction';
import { routeHref } from '../../routes';
import { useJobRecord } from '../../state/jobRecords';
import type { JobSummary } from '../../state/jobs';
import { JobElevation } from './Elevation';
import { elevationCabinets, jobTotals } from './jobMath';
import styles from './Jobs.module.css';

function Count({ value }: { value: number | null }) {
  return <span className={cx('mono', styles.tbCount)}>{value ?? '—'}</span>;
}

/** Job preview (A): elevation, title block of engine totals and notes, and the job's main actions. */
export function JobPreview({ job, onDuplicate }: { job: JobSummary | null; onDuplicate: (job: JobSummary) => void }) {
  const entry = useJobRecord(job?.id, job?.revision);
  const record = job && entry?.job?.id === job.id ? entry.job : undefined;
  const layout = useMemo(() => (job ? layoutElevation(elevationCabinets(job, record)) : null), [job, record]);
  const totals = useMemo(() => (record ? jobTotals(record) : null), [record]);

  return (
    <Sheet as="aside" className={styles.preview} aria-labelledby="pv-h">
      <ViewTitle className={styles.previewTitle} id="pv-h" mark="A" title="Job preview" sub={`${job?.number ?? '—'} · ELEVATION, NTS`} />
      {job && layout ? (
        // Keyed by job so the swap fades in each time the preview changes.
        <div key={job.id} className={styles.previewBody}>
          <JobElevation name={job.name} layout={layout} />
          <TitleBlock
            className={styles.previewBlock}
            cells={[
              { label: 'Job', value: <strong>{job.name}</strong>, span: 4 },
              { label: 'No.', value: <span className="mono">{job.number}</span>, span: 2 },
              { label: 'Customer', value: job.customer || '—', span: 4 },
              {
                label: 'Status',
                value: (
                  <span className={cx('cap', styles.tbStatus, styles[`status_${job.status}`])}>
                    <span aria-hidden="true">{STATUS_INFO[job.status].glyph} </span>
                    {STATUS_INFO[job.status].label}
                  </span>
                ),
                span: 2,
              },
              { label: 'Boxes', value: <Count value={totals?.boxes ?? null} />, span: 2 },
              { label: 'Panel pcs', value: <Count value={totals?.panelPieces ?? null} />, span: 2 },
              { label: 'Laminate pcs', value: <Count value={totals?.laminatePieces ?? null} />, span: 2 },
              { label: 'Notes', value: <span className={styles.tbNotes}>{job.notes || 'No notes.'}</span>, span: 6 },
            ]}
          />
          {entry?.error && <p className={styles.previewWarn}>⚠ {entry.error}</p>}
          {totals && totals.invalid.length > 0 && (
            <p className={styles.previewWarn}>
              △ {totals.invalid.join(', ')} {totals.invalid.length === 1 ? 'has' : 'have'} errors, so {totals.invalid.length === 1 ? 'its' : 'their'} parts
              aren’t counted.
            </p>
          )}
          <div className={styles.previewActions}>
            <ButtonLink variant="primary" size="lg" className={styles.grow} href={routeHref({ name: 'workspace', jobId: job.id })}>
              Open job
            </ButtonLink>
            <ButtonLink size="lg" href={routeHref({ name: 'cutlist', jobId: job.id })}>
              Cut list
            </ButtonLink>
            <Button size="lg" onClick={() => onDuplicate(job)}>
              Duplicate
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.previewNone}>Point at a job to preview it.</p>
      )}
    </Sheet>
  );
}
