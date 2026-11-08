import { useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SymbolMark } from '../../components/InfoTip';
import { STATUS_INFO } from '../../components/Stamp';
import { detailsOf, saveJobDetails } from '../../data/jobDetails';
import { cx } from '../../lib/interaction';
import { JOB_STATUSES, jobsStore } from '../../state/jobs';
import type { JobStatus, JobSummary } from '../../state/jobs';
import { statusLockHint } from '../../workspace/construction';
import styles from './Jobs.module.css';

export interface JobDetailsDialogProps {
  job: JobSummary;
  onClose: () => void;
}

/**
 * Job details: name, customer, notes and status, editable at any status. Mount
 * it to open it. Save is one step with Undo; the name is required, and a
 * duplicate name is only a note, as in New job.
 */
export function JobDetailsDialog({ job, onClose }: JobDetailsDialogProps) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const start = detailsOf(job);
  const [name, setName] = useState(start.name);
  const [customer, setCustomer] = useState(start.customer ?? '');
  const [notes, setNotes] = useState(start.notes ?? '');
  const [status, setStatus] = useState<JobStatus>(start.status);
  const [tried, setTried] = useState(false);

  const trimmed = name.trim();
  const missing = tried && trimmed === '';
  const taken =
    trimmed !== '' &&
    trimmed.toLocaleLowerCase() !== job.name.trim().toLocaleLowerCase() &&
    Object.values(jobsStore.getState().jobs).some((j) => j.id !== job.id && j.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  const lockHint = statusLockHint(job.status, status);

  const save = () => {
    if (trimmed === '') {
      setTried(true);
      nameRef.current?.focus();
      return;
    }
    saveJobDetails(job, { name, customer, notes, status });
    onClose();
  };

  const ids = { name: `${id}-name`, msg: `${id}-name-msg`, customer: `${id}-cust`, status: `${id}-status`, statusMsg: `${id}-status-msg`, notes: `${id}-notes` };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Job details"
      sub={job.number}
      initialFocusRef={nameRef}
      width={640}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" form={`${id}-form`}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        noValidate
        className={styles.newForm}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          // Enter in a one-line field saves, as in New job; Enter in Notes is a new line.
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || !(e.target instanceof HTMLInputElement)) return;
          e.preventDefault();
          save();
        }}
      >
        <div className={styles.span2}>
          <label className={styles.label} htmlFor={ids.name}>
            Job name
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={missing || undefined}
            aria-required="true"
            aria-describedby={ids.msg}
            autoComplete="off"
          />
          <div id={ids.msg} className={cx(styles.msg, missing ? styles.msgError : taken && styles.msgWarning)}>
            {missing ? (
              <>
                <SymbolMark symbol="needsFix" /> Give the job a name
              </>
            ) : taken ? (
              <>
                <SymbolMark symbol="warning" /> A job with this name already exists. That’s allowed.
              </>
            ) : (
              ''
            )}
          </div>
        </div>
        <div>
          <label className={styles.label} htmlFor={ids.customer}>
            Customer or project <span className={styles.optional}>(optional)</span>
          </label>
          <input id={ids.customer} className={styles.input} value={customer} onChange={(e) => setCustomer(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className={styles.label} htmlFor={ids.status}>
            Status
          </label>
          <select
            id={ids.status}
            className={styles.input}
            value={status}
            onChange={(e) => setStatus(e.target.value as JobStatus)}
            aria-describedby={ids.statusMsg}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_INFO[s].glyph} {STATUS_INFO[s].label}
              </option>
            ))}
          </select>
          <div id={ids.statusMsg} className={styles.msg}>
            {lockHint ?? ''}
          </div>
        </div>
        <div className={styles.span2}>
          <label className={styles.label} htmlFor={ids.notes}>
            Notes <span className={styles.optional}>(optional)</span>
          </label>
          <textarea id={ids.notes} className={cx(styles.input, styles.textarea)} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
}
