import { featureNote, grainOf } from '@kerfuffle/engine';
import type { ConstructionRules, DependencyMap, Part, PartField, PartRole } from '@kerfuffle/engine';
import { ButtonLink } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Tooltip } from '../../components/Tooltip';
import { ViewTitle } from '../../components/ViewTitle';
import type { CabinetRecord } from '../../data/types';
import { displayInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { routeHref } from '../../routes';
import { issueFor } from '../../workspace/calc';
import type { Evaluation } from '../../workspace/calc';
import { tableInches, wasText } from '../../workspace/revision';
import type { RevisionMarks } from '../../workspace/ui';
import type { CabinetBase } from '../../workspace/base';
import { hotPartOf, hoverPartHandlers, setUi, togglePin, useUi, workspaceUi } from '../../workspace/ui';
import { useCabinetBase, useTraceMap } from './hooks';
import styles from './Workspace.module.css';

/** Balloon numbers: the part's place in this cabinet's list, panels then laminate. */
export function balloonNumbers(parts: readonly Part[]): Map<PartRole, number> {
  return new Map(parts.map((p, i) => [p.role, i + 1]));
}

/** Laminate rows drop the "Laminate, " prefix: the table heading already says it. */
function rowName(part: Part): string {
  return part.category === 'laminate' ? part.name.replace(/^Laminate, /, '').replace(/^./, (c) => c.toUpperCase()) : part.name;
}

interface RowProps {
  part: Part;
  num: number;
  deps: DependencyMap | null;
  hot: PartRole | null;
  pinned: boolean;
  marks: RevisionMarks | null;
  note: string | undefined;
  laminate: boolean;
}

function PartRow({ part, num, deps, hot, pinned, marks, note, laminate }: RowProps) {
  const isHot = hot === part.role;
  const traced = deps?.[part.role] ?? [];
  const change = marks?.changes[part.role];
  const flash = marks && marks.rev % 2 === 0 ? styles.flashA : styles.flashB;
  const cell = (field: PartField, text: string) => {
    const on = traced.includes(field);
    const changed = change?.fields.includes(field) ?? false;
    return (
      <td className={cx(styles.num, on && styles.cellTraced, !on && changed && flash)} data-col={field} data-traced={on || undefined} data-changed={changed || undefined}>
        {text}
      </td>
    );
  };
  const vertical = grainOf(part.role) === 'vertical';
  const features = part.features && part.features.length > 0 ? featureNote(part.features) : null;
  return (
    <tr
      className={cx(styles.partRow, isHot && styles.partRowHot, !isHot && pinned && styles.partRowPinned)}
      data-role={part.role}
      {...hoverPartHandlers(part.role)}
    >
      <td>
        <button
          type="button"
          className={styles.partBtn}
          aria-pressed={pinned}
          onClick={() => togglePin(part.role)}
          onFocus={() => setUi({ focusPart: part.role })}
          onBlur={() => {
            if (workspaceUi.getState().focusPart === part.role) setUi({ focusPart: null });
          }}
        >
          <span className={cx(styles.bal, isHot && styles.balOn, !isHot && traced.length > 0 && styles.balDep)} aria-hidden="true">
            {num}
          </span>
          <span className={cx(part.optional && styles.refName)}>{rowName(part)}</span>
          {part.optional && (
            <span className={styles.refTag} title="Door / front-laminate size. Optional on the cut list.">
              REF<span className="visually-hidden">: door / front-laminate size, optional on the cut list</span>
            </span>
          )}
        </button>
        {features && (
          <div className={cx(styles.rowNote, styles.featureNote, traced.includes('F') && styles.featureTraced)} data-traced={traced.includes('F') || undefined}>
            {features}
          </div>
        )}
        {note && (
          <div className={styles.rowNote}>
            <span aria-hidden="true">△ </span>
            {note}
          </div>
        )}
      </td>
      {!laminate && (
        <td className={styles.grain} title={vertical ? 'Grain runs up and down in the cabinet' : 'Grain runs side to side in the cabinet'}>
          <span aria-hidden="true">{vertical ? '↕' : '↔'}</span>
          <span className="visually-hidden">{vertical ? 'up and down' : 'side to side'}</span>
        </td>
      )}
      {cell('L', tableInches(part.length))}
      {cell('W', tableInches(part.width))}
      {!laminate && cell('T', part.thickness === null ? '' : tableInches(part.thickness))}
      {cell('qty', String(part.quantity))}
      <td className={styles.deltaCell}>
        {change && marks && (
          <Tooltip content={wasText(change)}>
            <button type="button" className={styles.delta} aria-label={`Changed in revision ${marks.rev}. ${wasText(change)}`} data-rev={marks.rev}>
              △{marks.rev}
            </button>
          </Tooltip>
        )}
      </td>
    </tr>
  );
}

function shelfNote(part: Part, rules: ConstructionRules, evaluation: Evaluation): string | undefined {
  if (part.role !== 'shelf') return undefined;
  const warning = issueFor(evaluation.issues, 'shelfCount', 'warning');
  if (warning) return warning;
  if (part.thickness === rules.wideShelfThickness && rules.wideShelfThickness !== rules.shelfThickness) {
    const at = displayInches(rules.shelfThickWidthThreshold);
    return `${displayInches(part.thickness)} thick: cabinet is ${rules.shelfThickComparison === 'gte' ? `${at} or wider` : `wider than ${at}`}`;
  }
  return undefined;
}

/** The base a run shares, as a heading over its parts. */
function runCaption(base: CabinetBase): string {
  const n = base.cabinets.length;
  return `Shared by ${n === 1 ? base.cabinets[0] : `${n} cabinets (${base.cabinets.join(', ')})`}. Quantities are for the whole run.`;
}

export function PartsPanel({ cabinet, evaluation, rules, jobId }: { cabinet: CabinetRecord | null; evaluation: Evaluation | null; rules: ConstructionRules; jobId: string }) {
  const hot = useUi(hotPartOf);
  const pinned = useUi((ui) => ui.pinPart);
  const allMarks = useUi((ui) => ui.marks);
  const marks = allMarks && allMarks.cabinetId === cabinet?.id ? allMarks : null;
  const name = cabinet ? cabinet.label.trim() || 'Unnamed' : '—';
  const deps = useTraceMap(cabinet, evaluation);
  const base = useCabinetBase(cabinet, evaluation);
  const own = evaluation?.valid ? evaluation.parts : [];
  // A cabinet's own platform is its part; a run's base is listed under the run.
  const ownBase = base && base.run === null ? base.parts : [];
  const runParts = base && base.run !== null ? base.parts : [];
  const parts = [...own.filter((p) => p.category !== 'laminate'), ...ownBase, ...own.filter((p) => p.category === 'laminate')];
  const nums = balloonNumbers([...parts, ...runParts]);
  const panels = parts.filter((p) => p.category !== 'laminate');
  const lams = parts.filter((p) => p.category === 'laminate');

  const head = (label: string, laminate: boolean) => (
    <thead>
      <tr>
        <th scope="col">{label}</th>
        {!laminate && (
          <th scope="col" className={styles.center}>
            Grain
          </th>
        )}
        <th scope="col" className={styles.right}>
          Length
        </th>
        <th scope="col" className={styles.right}>
          Width
        </th>
        {!laminate && (
          <th scope="col" className={styles.right}>
            Thick.
          </th>
        )}
        <th scope="col" className={styles.right}>
          Qty
        </th>
        <th scope="col" className={styles.deltaCell}>
          <span className="visually-hidden">Revision</span>
        </th>
      </tr>
    </thead>
  );

  const rows = (list: Part[], laminate: boolean) =>
    list.map((part, i) => (
      <PartRow
        // A split platform has two of a role; they trace together.
        key={`${part.role}#${i}`}
        part={part}
        num={nums.get(part.role) ?? 0}
        deps={deps}
        hot={hot}
        pinned={pinned === part.role}
        marks={marks}
        note={evaluation ? shelfNote(part, rules, evaluation) : undefined}
        laminate={laminate}
      />
    ));

  return (
    <Sheet padding="sm" aria-labelledby="ws-pt">
      <div className={styles.panelHead}>
        <ViewTitle
          id="ws-pt"
          mark="4"
          title={`Parts · ${name}`}
          sub={cabinet && cabinet.quantity > 1 ? `QUANTITIES INCLUDE ×${cabinet.quantity}` : 'QUANTITY 1'}
        />
        <ButtonLink href={routeHref({ name: 'cutlist', jobId })} className={styles.smallLink}>
          Whole-job cut list →
        </ButtonLink>
      </div>
      {parts.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.parts}>
              {head('Panel part', false)}
              <tbody>{rows(panels, false)}</tbody>
            </table>
            {runParts.length > 0 && base && (
              <table className={cx(styles.parts, styles.runTable)} aria-describedby="ws-run-note">
                <caption className={styles.runCaption}>
                  <span className={styles.runRef}>{base.ref}</span>
                  <span id="ws-run-note" className={styles.runNote}>
                    {runCaption(base)}
                  </span>
                </caption>
                {head('Run part', false)}
                <tbody>{rows(runParts, false)}</tbody>
              </table>
            )}
            {base && base.issues.length > 0 && (
              <ul className={styles.baseIssues}>
                {base.issues.map((issue) => (
                  <li key={issue.message} className={issue.severity === 'error' ? styles.baseError : styles.baseWarning}>
                    <span aria-hidden="true">{issue.severity === 'error' ? '⚠ ' : '△ '}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
            <table className={cx(styles.parts, styles.lamTable)}>
              {head('Laminate', true)}
              <tbody>{rows(lams, true)}</tbody>
            </table>
          </div>
          <p className={styles.footnote}>
            Inches, nearest 1/16″; <span className="mono">≈</span> marks a rounded size. Length runs with the grain. Laminate is{' '}
            {displayInches(rules.laminateOversizePerEdge)} oversize past every edge. <span className={styles.footDelta}>△</span> marks parts your
            last edit changed.
          </p>
        </>
      ) : (
        <p className={styles.partsEmpty}>{cabinet ? 'Parts appear when every size is valid.' : 'No cabinet selected.'}</p>
      )}
    </Sheet>
  );
}
