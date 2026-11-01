import { useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { STATUS_INFO } from '../../components/Stamp';
import { TitleBlock } from '../../components/TitleBlock';
import { toStorageError } from '../../data/errors';
import { completeImport } from '../../data/transfer';
import type { ImportPlan } from '../../data/transfer';
import type { ImportMode, JobRecord } from '../../data/types';
import { formatJobNumber } from '../../data/types';
import { cx } from '../../lib/interaction';
import { formatEdited } from '../../lib/relativeDate';
import styles from './Jobs.module.css';

export interface ImportJobDialogProps {
  plan: ImportPlan;
  onClose: () => void;
  onImported: (job: JobRecord, mode: ImportMode) => void;
}

/**
 * Import job: what's in the file, then how to store it. A job that's already
 * on this PC (same id) comes in as a copy unless Replace existing is chosen,
 * which asks once more (it's one of the two bulk replacements, §1) and backs
 * up all jobs first.
 */
export function ImportJobDialog({ plan, onClose, onImported }: ImportJobDialogProps) {
  const { job, header, flagged, existing } = plan;
  const [choice, setChoice] = useState<'copy' | 'replace'>('copy');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const mode: ImportMode = existing ? choice : 'new';

  const run = async () => {
    if (mode === 'replace' && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onImported(await completeImport(plan, mode), mode);
    } catch (e) {
      setError(toStorageError(e).message);
      setBusy(false);
    }
  };

  const number = formatJobNumber(job.number);
  const cabinets = job.cabinets.length;
  const action = mode === 'replace' ? (confirming ? 'Replace job' : 'Replace…') : mode === 'copy' ? 'Import as a copy' : 'Import';

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onClose}
      title={confirming ? 'Replace the job on this PC?' : 'Import job'}
      mark="J"
      sub={plan.fileName}
      width={600}
      footer={
        <>
          {confirming ? (
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              Back
            </Button>
          ) : (
            <Button disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size="lg" busy={busy} data-autofocus onClick={() => void run()}>
            {action}
          </Button>
        </>
      }
    >
      {confirming && existing ? (
        <p className={styles.importText}>
          “{existing.name}” ({existing.number}) on this PC, last edited {formatEdited(existing.savedAt, now)}, is replaced by the one in the file,
          last edited {formatEdited(job.updatedAt, now)}. KERFuffle backs up all jobs first, so you can get it back with Restore backup.
        </p>
      ) : (
        <>
          <TitleBlock
            columns={4}
            cells={[
              { label: 'Job', value: job.name, span: 3 },
              { label: 'No.', value: <span className="mono">{number}</span> },
              { label: 'Customer', value: job.customer ?? '—', span: 2 },
              { label: 'Status', value: STATUS_INFO[job.status].label },
              { label: 'Cabinets', value: <span className="mono">{cabinets}</span> },
              { label: 'Exported', value: formatEdited(header.exportedAt, now), span: 2 },
              { label: 'From KERFuffle', value: <span className="mono">{header.appVersion}</span>, span: 2 },
            ]}
          />
          <p className={styles.importText}>It keeps its own construction settings, the way they were on the other PC.</p>
          {plan.numberTaken && mode !== 'replace' && (
            <p className={cx(styles.importText, styles.importNote)}>{number} is already used on this PC, so the job gets the next free number.</p>
          )}
          {flagged.length > 0 && (
            <div className={cx(styles.importText, styles.importNote)}>
              <strong>
                <span aria-hidden="true">△ </span>
                {flagged.length === 1 ? '1 cabinet needs' : `${flagged.length} cabinets need`} attention.
              </strong>{' '}
              {flagged.length === 1 ? 'It comes in' : 'They come in'} as {flagged.length === 1 ? 'it is' : 'they are'} and {flagged.length === 1 ? 'is' : 'are'}{' '}
              marked in the workspace until fixed:
              <ul className={styles.flagList}>
                {flagged.map((c) => (
                  <li key={c.label}>
                    <strong>{c.label}</strong>: {c.messages.join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {existing && (
            <fieldset className={styles.importChoices}>
              <legend>
                This job is already on this PC as “{existing.name}” ({existing.number}), last edited {formatEdited(existing.savedAt, now)}.
              </legend>
              <label className={styles.importChoice}>
                <input type="radio" name="import-mode" checked={choice === 'copy'} onChange={() => setChoice('copy')} />
                <span>
                  <strong>Import as a copy</strong>
                  <span className={styles.importChoiceHelp}>Adds “{job.name} (copy)” as a separate job. The job on this PC stays as it is.</span>
                </span>
              </label>
              <label className={styles.importChoice}>
                <input type="radio" name="import-mode" checked={choice === 'replace'} onChange={() => setChoice('replace')} />
                <span>
                  <strong>Replace existing</strong>
                  <span className={styles.importChoiceHelp}>The job on this PC becomes the one in the file. All jobs are backed up first.</span>
                </span>
              </label>
            </fieldset>
          )}
        </>
      )}
      {error && (
        <p className={cx(styles.importText, styles.importError)} role="alert">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </Dialog>
  );
}
