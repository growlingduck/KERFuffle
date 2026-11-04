import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { constructionChoiceOf, constructionName } from '@kerfuffle/engine';
import type { ConstructionChoice, ConstructionRules } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { ConstructionPicker } from '../../components/ConstructionPicker';
import { Dialog } from '../../components/Dialog';
import { getStorageClient } from '../../data/client';
import { toStorageError } from '../../data/errors';
import { withConstruction } from '../../data/rules';
import { createJob } from '../../data/storage';
import { formatJobNumber } from '../../data/types';
import { exactInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { routeHref } from '../../routes';
import { useJobRecord } from '../../state/jobRecords';
import { useDefaultsChecked } from '../../state/shopDefaults';
import type { JobSummary } from '../../state/jobs';
import { newCabinet } from '../../workspace/cabinets';
import { methodRows } from '../../workspace/construction';
import { startTypingOnOpen } from '../../workspace/ui';
import styles from './Jobs.module.css';
import { SymbolMark } from '../../components/InfoTip';

const EMPTY = '';

/** In the same words as the workspace's Construction section. */
function RuleValues({ rules }: { rules: ConstructionRules | null }) {
  if (!rules) return <div className={styles.ruleValues}>Loading…</div>;
  const rows: [string, string][] = [
    ['Panel thickness', exactInches(rules.panelThickness)],
    ['Toe kick', exactInches(rules.toeKickHeight)],
    ['Countertop', exactInches(rules.countertopThickness)],
    ['Shelf clearance, each side', exactInches(rules.shelfClearancePerSide)],
    ['Shelf setback from front', exactInches(rules.shelfSetback)],
    ['Laminate oversize, each edge', exactInches(rules.laminateOversizePerEdge)],
    ...methodRows(rules).map(([label, value]): [string, string] => [label, value]),
  ];
  return (
    <dl className={styles.ruleValues}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.ruleValue}>
          <dt>{label}</dt>
          <dd className="mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Shop defaults for a new empty job, read when the dialog opens. */
function useShopRules(): ConstructionRules | null {
  const [rules, setRules] = useState<ConstructionRules | null>(null);
  useEffect(() => {
    let live = true;
    getStorageClient()
      .getShopSettings()
      .then((settings) => live && setRules(settings.rules))
      .catch(() => {
        // The panel just stays on "Loading…"; creating the job reports any real storage problem.
      });
    return () => {
      live = false;
    };
  }, []);
  return rules;
}

export interface NewJobDialogProps {
  /** Every job, for "Start with" and the duplicate-name note. Most recently edited first. */
  jobs: readonly JobSummary[];
  onClose: () => void;
  onCreated: (job: JobSummary) => void;
}

/**
 * New job, as a title-block sheet over a scrim. Mount it to open it, so every
 * open starts blank. The name is required; a duplicate name is only a note.
 */
export function NewJobDialog({ jobs, onClose, onCreated }: NewJobDialogProps) {
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [copyFrom, setCopyFrom] = useState(EMPTY);
  const [notes, setNotes] = useState('');
  /** Null until picked: the default follows the shop (or the job being copied). */
  const [picked, setPicked] = useState<ConstructionChoice | null>(null);
  /** Construction shows as one line until Change… opens it; then it stays open. */
  const [changing, setChanging] = useState(false);
  const constructionRef = useRef<HTMLDivElement>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const defaultsChecked = useDefaultsChecked();
  const [error, setError] = useState<string | null>(null);

  const shopRules = useShopRules();
  const source = jobs.find((j) => j.id === copyFrom);
  const sourceRecord = useJobRecord(source?.id, source?.revision);
  const startRules = source ? (sourceRecord?.job?.rules ?? null) : shopRules;
  const startChoice = startRules ? constructionChoiceOf(startRules.method) : null;
  const choice = picked ?? startChoice;
  // A copy keeps its source's construction unless another one is picked.
  const changed = picked !== null && picked !== startChoice;
  const rules = startRules && choice && (!source || changed) ? withConstruction(startRules, choice) : startRules;
  let summary = 'loading…';
  if (rules && choice) {
    if (changed) summary = constructionName(rules.method);
    else summary = source ? `same as “${source.name}”` : `${constructionName(rules.method)} (shop default)`;
  }

  // Change… goes away as the picker opens, so focus moves to the picked option.
  useEffect(() => {
    if (changing) constructionRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [changing]);

  const nextNumber = useMemo(() => Math.max(0, ...jobs.map((j) => j.numberValue)) + 1, [jobs]);
  const trimmed = name.trim();
  const missing = tried && trimmed === '';
  const taken = trimmed !== '' && jobs.some((j) => j.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase());

  const create = async () => {
    if (busy) return;
    if (trimmed === '') {
      setTried(true);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const construction = source ? (changed ? picked : undefined) : (choice ?? undefined);
      // An empty job starts with one base cabinet, saved with it: there's no empty step to undo back to.
      const cabinets = source ? {} : { cabinets: [newCabinet([], 'base')] };
      const job = await createJob({ name: trimmed, customer, notes, ...(construction ? { construction } : {}), ...cabinets }, source?.id);
      if (!source) startTypingOnOpen(job.id);
      onCreated(job);
    } catch (e) {
      setError(toStorageError(e).message);
      setBusy(false);
    }
  };

  const uncheckedNote = !source && defaultsChecked === false && (
    <div className={styles.rulesNote}>
      Not checked yet: these are KERFuffle’s built-in values. <a href={routeHref({ name: 'settings' })}>Check them in Settings</a>
    </div>
  );

  const ids = { name: `${id}-name`, msg: `${id}-name-msg`, customer: `${id}-cust`, start: `${id}-start`, notes: `${id}-notes` };

  return (
    <Dialog
      open
      onClose={onClose}
      mark="+"
      title="New job"
      sub={`${formatJobNumber(nextNumber)} · STARTS AS DRAFT`}
      initialFocusRef={nameRef}
      width={720}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" type="submit" form={`${id}-form`} busy={busy}>
            Create and open
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
          void create();
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
            onKeyDown={(e) => {
              // Enter here creates the job, without relying on implicit submission from the footer button.
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              void create();
            }}
            aria-invalid={missing || undefined}
            aria-required="true"
            aria-describedby={ids.msg}
            placeholder="e.g. Kitchen remodel"
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
          <label className={styles.label} htmlFor={ids.start}>
            Start with
          </label>
          <select
            id={ids.start}
            className={styles.input}
            value={copyFrom}
            onChange={(e) => {
              setCopyFrom(e.target.value);
              setPicked(null);
            }}
          >
            <option value={EMPTY}>An empty job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                A copy of “{j.name}” ({j.number})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.span2}>
          <label className={styles.label} htmlFor={ids.notes}>
            Notes <span className={styles.optional}>(optional)</span>
          </label>
          <textarea id={ids.notes} className={cx(styles.input, styles.textarea)} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
      {!changing ? (
        <>
          <p className={styles.constructionLine}>
            <span>Construction: {summary}</span>
            <span aria-hidden="true">·</span>
            <button type="button" className={styles.changeLink} aria-expanded="false" disabled={!choice} onClick={() => setChanging(true)}>
              Change…
            </button>
          </p>
          {uncheckedNote}
        </>
      ) : (
        <div ref={constructionRef} className={styles.constructionOpen}>
          <div className={styles.constructionInner}>
            {choice ? (
              <ConstructionPicker
                className={styles.construction}
                legend="Construction"
                hint={
                  source
                    ? `How every cabinet is built. The copy starts with “${source.name}”’s construction.`
                    : 'How every cabinet is built. It can be changed while the job is a draft.'
                }
                value={choice}
                onChange={setPicked}
                currentLabel={startChoice ? { choice: startChoice, text: source ? '(that job)' : '(shop default)' } : undefined}
              />
            ) : (
              <p className={styles.construction}>Loading construction…</p>
            )}
            <div className={styles.rulesPanel}>
              <div className={cx('cap', styles.rulesHead)}>
                {source ? `Construction · copied from “${source.name}”` : 'Construction · copied from shop defaults'}
              </div>
              <RuleValues rules={rules} />
              {uncheckedNote}
              <div className={styles.rulesNote}>
                {source ? (
                  'The new job gets that job’s cabinets and its own copy of these values.'
                ) : (
                  <>
                    The job keeps its own copy. <a href={routeHref({ name: 'settings' })}>Edit shop defaults</a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className={cx(styles.msg, styles.msgError, styles.createError)}>
          <SymbolMark symbol="needsFix" /> {error}
        </p>
      )}
    </Dialog>
  );
}
