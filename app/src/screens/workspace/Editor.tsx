import { useEffect, useId, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { boxGeometry, CONSTRUCTION_NAMES, constructionChoiceOf, constructionName, DEFAULT_RULES, runOf, usesRuns } from '@kerfuffle/engine';
import type { CabinetType, ConstructionChoice, ConstructionRules, FinishedEnds, MethodSettings, TraceKey } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { ConstructionPicker } from '../../components/ConstructionPicker';
import { Dialog } from '../../components/Dialog';
import { DimensionInput } from '../../components/DimensionInput';
import { FieldLabel } from '../../components/Field';
import fieldStyles from '../../components/Field.module.css';
import { CheckIcon } from '../../components/icons';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { ViewTitle } from '../../components/ViewTitle';
import { getStorageClient } from '../../data/client';
import { jobSession } from '../../data/storage';
import type { CabinetRecord } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { routeHref } from '../../routes';
import { useStore } from '../../state/createStore';
import { showToast } from '../../state/toast';
import { duplicateLabels, isDuplicateLabel, TYPE_LABEL } from '../../workspace/cabinets';
import { issueFor } from '../../workspace/calc';
import { constructionLocked, diffConstruction, diffText, LOCKED_REASON, methodRows, withConstruction } from '../../workspace/construction';
import type { Evaluation, FieldKey } from '../../workspace/calc';
import type { DimensionField } from '../../workspace/commands';
import { runCommand, undoIfLatest } from '../../workspace/history';
import { hoverKeyHandlers, setUi, traceKeyOf, useSelectedCabinetId, useUi, workspaceUi } from '../../workspace/ui';
import { useCabinet, useCabinets, useEvaluation, useRules } from './hooks';
import styles from './Workspace.module.css';

export const FIELD_TRACE: Record<FieldKey, TraceKey | null> = {
  width: 'w',
  height: 'h',
  depth: 'd',
  shelfCount: 'shelves',
  quantity: 'qty',
  label: null,
  run: null,
};

export const FIELD_NAME: Record<FieldKey, string> = {
  width: 'width',
  height: 'height',
  depth: 'depth',
  shelfCount: 'shelves',
  quantity: 'quantity',
  label: 'ID',
  run: 'run',
};

export const fieldId = (field: FieldKey) => `ws-field-${field}`;

/** A trace key is lit on a field: its own key, and box height lights overall height. */
function lit(trace: TraceKey | null, key: TraceKey | null): boolean {
  return key !== null && (trace === key || (key === 'h' && trace === 'box'));
}

function focusHandlers(field: FieldKey) {
  return {
    onFocus: () => setUi({ focusKey: FIELD_TRACE[field], editing: field }),
    onBlur: () => {
      const ui = workspaceUi.getState();
      // A size that doesn't parse stays as the draft, so the drawing keeps its placeholder.
      const draft = ui.draft && ui.draft.value !== null ? null : ui.draft;
      setUi({ focusKey: ui.focusKey === FIELD_TRACE[field] ? null : ui.focusKey, editing: null, draft });
    },
  };
}

function DimensionField({ cabinet, evaluation, field, label, symbol }: { cabinet: CabinetRecord; evaluation: Evaluation; field: DimensionField; label: string; symbol: string }) {
  const trace = useUi(traceKeyOf);
  const key = FIELD_TRACE[field];
  return (
    <div data-field={field}>
      <DimensionInput
        id={fieldId(field)}
        label={label}
        symbol={symbol}
        value={cabinet[field]}
        traced={lit(trace, key)}
        error={issueFor(evaluation.issues, field, 'error')}
        warning={issueFor(evaluation.issues, field, 'warning')}
        onLiveChange={(value) => setUi({ draft: { cabinetId: cabinet.id, field, value } })}
        onCommit={(value) => runCommand({ type: 'setDimension', cabinetId: cabinet.id, field, value })}
        {...hoverKeyHandlers(key as TraceKey)}
        {...focusHandlers(field)}
      />
    </div>
  );
}

/** Box height arithmetic: base `H − t − T = Hb`, wall `H = Hb`. Each term traces its dimension. */
function CalcTape({ evaluation, type, rules }: { evaluation: Evaluation; type: CabinetType; rules: ConstructionRules }) {
  const trace = useUi(traceKeyOf);
  const heightOk = !evaluation.issues.some((i) => i.severity === 'error' && i.field === 'height');
  // From the box calculator: method B's sides run past the box to the floor.
  const box = evaluation.valid ? boxGeometry(evaluation.spec, rules).boxHeight : undefined;
  const toFloor = type === 'base' && rules.method.id === 'B';
  const term = (key: TraceKey, text: string) => (
    <span className={cx(styles.term, (trace === key || (key === 'box' && trace === 'h')) && styles.termOn)} {...hoverKeyHandlers(key)}>
      {text}
    </span>
  );
  const h = heightOk ? displayInches(evaluation.spec.height) : '?';
  const hb = box !== undefined ? displayInches(box) : '?';
  return (
    <div className={styles.tape}>
      <span className={styles.tapeLabel}>Box height</span>
      {type === 'base' ? (
        <>
          {term('h', h)} − {term('toe', displayInches(rules.toeKickHeight))} − {term('ctop', displayInches(rules.countertopThickness))} ={' '}
          {term('box', hb)}
        </>
      ) : (
        <>
          {term('h', h)} = {term('box', hb)}
        </>
      )}
      <span className={styles.tapeNote}>
        {type === 'base'
          ? toFloor
            ? 'overall − toe kick − countertop; the sides run on to the floor'
            : 'overall − toe kick − countertop'
          : 'wall cabinets use full height'}
      </span>
    </div>
  );
}

/** A fixed-height message line under a stepper or the ID field (nothing moves when one appears). */
function MessageLine({ id, tone, children }: { id: string; tone: 'warning' | 'hint'; children: ReactNode }) {
  return (
    <div id={id} className={cx(fieldStyles.msg, tone === 'warning' && fieldStyles.msgWarning)}>
      {tone === 'warning' && children ? (
        <>
          <span aria-hidden="true">△ </span>
          <span className="visually-hidden">Warning:</span> {children}
        </>
      ) : (
        children
      )}
    </div>
  );
}

/** Cabinet ID: plain text, committed on blur or Enter, Esc reverts. A used label is allowed with a warning. */
function LabelField({ cabinet, warning }: { cabinet: CabinetRecord; warning: string | undefined }) {
  const [text, setText] = useState(cabinet.label);
  const [focused, setFocused] = useState(false);
  /** Text when the field gained focus: what Esc goes back to. */
  const [atFocus, setAtFocus] = useState(cabinet.label);
  const cabinets = useCabinets();
  const [prev, setPrev] = useState(cabinet.label);
  if (prev !== cabinet.label) {
    setPrev(cabinet.label);
    if (!focused) setText(cabinet.label);
  }
  const msgId = useId();

  const others = cabinets.filter((c) => c.id !== cabinet.id);
  const clash = text.trim() !== '' && isDuplicateLabel(text, duplicateLabels([...others, { ...cabinet, label: text }]));
  const message = clash
    ? `${text.trim()} is also used by another cabinet. Labels show on the cut list.`
    : text.trim() === ''
      ? (warning ?? 'Cabinet ID is blank.')
      : focused
        ? 'Shown on every part and on the cut list'
        : '';

  const commit = () => {
    if (text.trim() !== cabinet.label) runCommand({ type: 'renameCabinet', cabinetId: cabinet.id, label: text });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape' && text !== atFocus) {
      event.preventDefault();
      event.stopPropagation();
      setText(atFocus);
    }
  };

  return (
    <div className={fieldStyles.field} data-field="label">
      <FieldLabel htmlFor={fieldId('label')}>Cabinet ID</FieldLabel>
      <input
        id={fieldId('label')}
        className={cx(fieldStyles.input, styles.idInput)}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-describedby={msgId}
        data-dirty={(focused && text !== atFocus) || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setAtFocus(text);
          setFocused(true);
          setUi({ editing: 'label' });
        }}
        onBlur={() => {
          setFocused(false);
          setUi({ editing: null });
          commit();
        }}
      />
      <MessageLine id={msgId} tone={clash || text.trim() === '' ? 'warning' : 'hint'}>
        {message}
      </MessageLine>
    </div>
  );
}

/** The base cabinets' runs, in the order they first appear. */
function runNames(cabinets: readonly CabinetRecord[]): string[] {
  const names: string[] = [];
  for (const c of cabinets) {
    const run = c.type === 'base' ? runOf(c) : null;
    if (run !== null && !names.includes(run)) names.push(run);
  }
  return names;
}

/**
 * Run (method A1): the straight row of base cabinets this one shares a ladder
 * base with. Free text with the job's runs as suggestions, committed on blur
 * or Enter; Esc reverts. Blank: the cabinet gets its own base.
 */
function RunField({ cabinet }: { cabinet: CabinetRecord }) {
  const cabinets = useCabinets();
  const stored = cabinet.run ?? '';
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);
  const [atFocus, setAtFocus] = useState(stored);
  const [prev, setPrev] = useState(stored);
  if (prev !== stored) {
    setPrev(stored);
    if (!focused) setText(stored);
  }
  const msgId = useId();
  const listId = useId();
  const runs = useMemo(() => runNames(cabinets), [cabinets]);

  const name = text.trim();
  const others = cabinets.filter((c) => c.id !== cabinet.id && c.type === 'base' && name !== '' && runOf(c) === name);
  const message =
    name === ''
      ? 'No run: this cabinet gets its own base.'
      : others.length > 0
        ? `Shares one ladder base with ${others.map((c) => c.label.trim() || 'Unnamed').join(', ')}.`
        : 'A new run. Give other base cabinets in the same row this name to share its base.';

  const commit = () => {
    if (name !== (cabinet.run ?? '').trim()) runCommand({ type: 'setRun', cabinetId: cabinet.id, run: name || null });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape' && text !== atFocus) {
      event.preventDefault();
      event.stopPropagation();
      setText(atFocus);
    }
  };

  return (
    <div className={cx(fieldStyles.field, styles.runField)} data-field="run">
      <FieldLabel htmlFor={fieldId('run')}>Run</FieldLabel>
      <input
        id={fieldId('run')}
        className={fieldStyles.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        list={listId}
        placeholder="e.g. Sink wall"
        value={text}
        aria-describedby={msgId}
        data-dirty={(focused && text !== atFocus) || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setAtFocus(text);
          setFocused(true);
          setUi({ editing: 'run' });
        }}
        onBlur={() => {
          setFocused(false);
          setUi({ editing: null });
          commit();
        }}
      />
      <datalist id={listId}>
        {runs.map((run) => (
          <option key={run} value={run} />
        ))}
      </datalist>
      <MessageLine id={msgId} tone="hint">
        {message}
      </MessageLine>
    </div>
  );
}

const ENDS: readonly { value: FinishedEnds; label: string }[] = [
  { value: 'none', label: 'Neither' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

function EndsTiles({ cabinet }: { cabinet: CabinetRecord }) {
  const id = useId();
  return (
    <div className={styles.ends} {...hoverKeyHandlers('ends')}>
      <span className={styles.endsLabel} id={id}>
        Finished ends <span className={styles.endsSub}>· laminated outside faces</span>
      </span>
      <div role="group" aria-labelledby={id} className={styles.endsRow}>
        {ENDS.map((o) => {
          const on = cabinet.finishedEnds === o.value;
          const left = o.value === 'left' || o.value === 'both';
          const right = o.value === 'right' || o.value === 'both';
          return (
            <button
              key={o.value}
              type="button"
              className={cx(styles.endTile, on && styles.endTileOn)}
              aria-pressed={on}
              onClick={() => runCommand({ type: 'setFinishedEnds', cabinetId: cabinet.id, value: o.value })}
            >
              <svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true">
                <rect className={styles.endBox} x="7" y="3" width="16" height="20" />
                {left && <rect className={styles.endBar} x="3" y="3" width="3" height="20" />}
                {right && <rect className={styles.endBar} x="24" y="3" width="3" height="20" />}
              </svg>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The rules this panel compares with the shop's. The method block is compared setting by setting. */
type RuleKey = Exclude<keyof ConstructionRules, 'method'>;
const RULE_KEYS = (Object.keys(DEFAULT_RULES) as (keyof ConstructionRules)[]).filter((k): k is RuleKey => k !== 'method');
/** Method settings the shop sets. Whether the base is listed only marks jobs made before methods. */
const METHOD_KEYS = (Object.keys(DEFAULT_RULES.method) as (keyof MethodSettings)[]).filter((k) => k !== 'listBase');

function differences(shop: ConstructionRules, rules: ConstructionRules): number {
  return RULE_KEYS.filter((k) => shop[k] !== rules[k]).length + METHOD_KEYS.filter((k) => shop.method[k] !== rules.method[k]).length;
}

/**
 * Change the job's construction (a draft only): pick, see what it does to the
 * cut list, then apply as one undoable step with a toast that offers Undo.
 */
function ChangeConstructionDialog({ rules, onClose }: { rules: ConstructionRules; onClose: () => void }) {
  const current = constructionChoiceOf(rules.method);
  const [choice, setChoice] = useState<ConstructionChoice>(current);
  const cabinets = useCabinets();
  const next = withConstruction(rules, choice);
  const preview = next === rules ? null : diffText(diffConstruction(cabinets, rules, next));

  const apply = () => {
    const entry = runCommand({ type: 'setConstruction', choice });
    onClose();
    if (!entry) return;
    showToast(`Construction: ${CONSTRUCTION_NAMES[choice].short}. ${diffText(diffConstruction(cabinets, rules, next))}.`, {
      label: 'Undo',
      run: () => void undoIfLatest(entry),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      mark="◆"
      title="Change construction"
      sub="THIS JOB ONLY · ONE UNDOABLE STEP"
      width={720}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={preview === null} disabledReason="Pick a different construction" onClick={apply}>
            Change construction
          </Button>
        </>
      }
    >
      <ConstructionPicker
        legend="Build this job as"
        hint="Every cabinet in the job uses it. Other settings, like kick depth and the back, stay as they are."
        value={choice}
        onChange={setChoice}
        currentLabel={{ choice: current, text: '(now)' }}
      />
      <p className={styles.changePreview} role="status">
        {preview === null ? 'This is how the job is built now.' : `On the cut list: ${preview}.`}
      </p>
    </Dialog>
  );
}

/** The shop defaults, to say whether this job's copy still matches them. */
function useShopRules(): ConstructionRules | null {
  const [rules, setRules] = useState<ConstructionRules | null>(null);
  useEffect(() => {
    let live = true;
    getStorageClient()
      .getShopSettings()
      .then((s) => live && setRules(s.rules))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return rules;
}

function wideRule(rules: ConstructionRules): string {
  const at = displayInches(rules.shelfThickWidthThreshold);
  return `${displayInches(rules.wideShelfThickness)} at ${rules.shelfThickComparison === 'gte' ? `${at} and wider` : `over ${at}`}`;
}

/**
 * The job's copy of the construction rules. Pointing at a rule traces it. The
 * construction method can be changed here while the job is a draft.
 */
function Construction({ rules, type }: { rules: ConstructionRules; type: CabinetType }) {
  const open = useUi((ui) => ui.constructionOpen);
  const trace = useUi(traceKeyOf);
  const shop = useShopRules();
  const bodyId = useId();
  const lockId = useId();
  const status = useStore(jobSession.store, (s) => s.job?.status ?? 'draft');
  const locked = constructionLocked(status);
  const [changing, setChanging] = useState(false);
  const differs = shop ? differences(shop, rules) : 0;

  const rows: [string, string, TraceKey][] = [
    ['Panel thickness', displayInches(rules.panelThickness), 'p'],
    ...(type === 'base'
      ? ([
          ['Toe kick', displayInches(rules.toeKickHeight), 'toe'],
          ['Countertop', displayInches(rules.countertopThickness), 'ctop'],
        ] as [string, string, TraceKey][])
      : []),
    ['Shelf clearance, each side', displayInches(rules.shelfClearancePerSide), 'cl'],
    ['Shelf setback from front', displayInches(rules.shelfSetback), 'sb'],
    ['Shelf thickness', displayInches(rules.shelfThickness), 'wide'],
    ['Wide shelves', wideRule(rules), 'wide'],
    ['Laminate oversize, each edge', displayInches(rules.laminateOversizePerEdge), 'lam'],
  ];

  return (
    <div className={styles.construction}>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setUi({ constructionOpen: !open })}
      >
        <svg className={cx(styles.chev, open && styles.chevOpen)} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5L7.5 6 4 9.5" />
        </svg>
        <span className={styles.disclosureTitle}>Construction</span>
        <span className={styles.disclosureSub}>{constructionName(rules.method)}</span>
        {shop &&
          (differs === 0 ? (
            <span className={styles.matches}>
              <CheckIcon /> Matches shop defaults
            </span>
          ) : (
            <span className={styles.differs}>
              <span aria-hidden="true">◆</span> Differs from shop defaults ({differs})
            </span>
          ))}
      </button>
      <div id={bodyId} className={cx(styles.disclosureBody, open && styles.disclosureBodyOpen)} inert={!open}>
        <div className={styles.disclosureInner}>
          <div className={styles.method}>
            <div>
              <div className={styles.methodName}>{CONSTRUCTION_NAMES[constructionChoiceOf(rules.method)].long}</div>
              <p id={lockId} className={styles.methodNote}>
                {locked ? LOCKED_REASON : 'Every cabinet in this job is built this way. You can change it while the job is a draft.'}
              </p>
            </div>
            <Button disabled={locked} disabledReason={LOCKED_REASON} aria-describedby={lockId} onClick={() => setChanging(true)}>
              Change…
            </Button>
          </div>
          <dl className={styles.rules}>
            {rows.map(([label, value, key]) => (
              <div key={label} className={cx(styles.rule, trace === key && styles.ruleOn)} {...hoverKeyHandlers(key)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {methodRows(rules, type).map(([label, value]) => (
              <div key={label} className={styles.rule}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.rulesNote}>
            Changing the <a href={routeHref({ name: 'settings' })}>shop defaults</a> won’t change this job. Point at a rule to see what it
            moves.
          </p>
        </div>
      </div>
      {changing && <ChangeConstructionDialog rules={rules} onClose={() => setChanging(false)} />}
    </div>
  );
}

function EditorFor({ cabinet, rules }: { cabinet: CabinetRecord; rules: ConstructionRules }) {
  const evaluation = useEvaluation(cabinet, rules);
  const editing = useUi((ui) => ui.editing);
  const trace = useUi(traceKeyOf);
  const focusRequest = useUi((ui) => ui.focusRequest);
  const shelvesMsg = useId();
  const qtyMsg = useId();

  // Alt+↑/↓, Go to width and clicking a dimension ask for a field; this editor may have just mounted.
  useEffect(() => {
    if (!focusRequest) return;
    const el = document.getElementById(fieldId(focusRequest.field));
    if (el instanceof HTMLInputElement) {
      el.focus();
      if (focusRequest.select) el.select();
    }
    setUi({ focusRequest: null });
  }, [focusRequest]);

  if (!evaluation) return null;
  const name = cabinet.label.trim() || 'Unnamed';
  const shelfWarning = issueFor(evaluation.issues, 'shelfCount', 'warning');

  return (
    <>
      <div className={styles.editorHead}>
        <ViewTitle
          id="ws-ed"
          mark="2"
          title={`Cabinet ${name}`}
          sub={`${TYPE_LABEL[cabinet.type].toUpperCase()} · ${editing ? `EDITING ${FIELD_NAME[editing].toUpperCase()}` : 'READY'}`}
        />
        <Segmented
          label="Cabinet type"
          value={cabinet.type}
          options={[
            { value: 'base', label: 'Base' },
            { value: 'wall', label: 'Wall' },
          ]}
          onChange={(value) => runCommand({ type: 'setType', cabinetId: cabinet.id, value })}
        />
      </div>

      <div className={styles.grid3}>
        <DimensionField cabinet={cabinet} evaluation={evaluation} field="width" label="Width" symbol="W" />
        <DimensionField cabinet={cabinet} evaluation={evaluation} field="height" label="Height, overall" symbol="H" />
        <DimensionField cabinet={cabinet} evaluation={evaluation} field="depth" label="Depth" symbol="D" />
      </div>

      <CalcTape evaluation={evaluation} type={cabinet.type} rules={rules} />

      <div className={styles.grid3}>
        <div data-field="shelfCount">
          <Stepper
            id={fieldId('shelfCount')}
            label="Shelves"
            symbol="n"
            value={cabinet.shelfCount}
            min={0}
            max={1000}
            decrementLabel="One fewer shelf"
            incrementLabel="One more shelf"
            minReason="No shelves"
            traced={trace === 'shelves'}
            onChange={(value) => runCommand({ type: 'setShelves', cabinetId: cabinet.id, value })}
            {...hoverKeyHandlers('shelves')}
            {...focusHandlers('shelfCount')}
          />
          <MessageLine id={shelvesMsg} tone={shelfWarning ? 'warning' : 'hint'}>
            {shelfWarning}
          </MessageLine>
        </div>
        <div data-field="quantity">
          <Stepper
            id={fieldId('quantity')}
            label="Quantity"
            symbol="×"
            value={cabinet.quantity}
            min={1}
            max={100000}
            decrementLabel="Build one fewer"
            incrementLabel="Build one more"
            minReason="Build at least one"
            traced={trace === 'qty'}
            onChange={(value) => runCommand({ type: 'setQuantity', cabinetId: cabinet.id, value })}
            {...hoverKeyHandlers('qty')}
            {...focusHandlers('quantity')}
          />
          <MessageLine id={qtyMsg} tone="hint">
            {cabinet.quantity > 1 ? `Every part count is × ${cabinet.quantity}` : ''}
          </MessageLine>
        </div>
        <LabelField cabinet={cabinet} warning={issueFor(evaluation.issues, 'label', 'warning')} />
      </div>

      {cabinet.type === 'base' && usesRuns(rules.method) && <RunField cabinet={cabinet} />}

      <EndsTiles cabinet={cabinet} />
      <Construction rules={rules} type={cabinet.type} />
    </>
  );
}

export function Editor() {
  const id = useSelectedCabinetId();
  const cabinet = useCabinet(id);
  const rules = useRules();
  return (
    <Sheet aria-labelledby="ws-ed" className={styles.editorPanel}>
      {cabinet && rules ? (
        // Keyed by cabinet: changing cabinet starts every field fresh.
        <EditorFor key={cabinet.id} cabinet={cabinet} rules={rules} />
      ) : (
        <>
          <ViewTitle id="ws-ed" mark="2" title="Cabinet editor" sub="NO CABINET" />
          <p className={styles.empty}>Add a cabinet to start entering sizes.</p>
        </>
      )}
    </Sheet>
  );
}
