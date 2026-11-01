import { dependenciesFor } from '@kerfuffle/engine';
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
import { hotPartOf, hoverPartHandlers, setUi, togglePin, traceKeyOf, useUi, workspaceUi } from '../../workspace/ui';
import styles from './Workspace.module.css';

/** Grain runs along the length: up and down on these, side to side on the rest. */
const VERTICAL_GRAIN: ReadonlySet<PartRole> = new Set(['back', 'side-left', 'side-right', 'front']);

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
  const vertical = VERTICAL_GRAIN.has(part.role) || part.category === 'laminate';
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

export function PartsPanel({ cabinet, evaluation, rules, jobId }: { cabinet: CabinetRecord | null; evaluation: Evaluation | null; rules: ConstructionRules; jobId: string }) {
  const trace = useUi(traceKeyOf);
  const hot = useUi(hotPartOf);
  const pinned = useUi((ui) => ui.pinPart);
  const allMarks = useUi((ui) => ui.marks);
  const marks = allMarks && allMarks.cabinetId === cabinet?.id ? allMarks : null;
  const name = cabinet ? cabinet.label.trim() || 'Unnamed' : '—';
  const deps = trace && cabinet ? dependenciesFor(trace, cabinet.type) : null;
  const parts = evaluation?.valid ? evaluation.parts : [];
  const nums = balloonNumbers(parts);
  const panels = parts.filter((p) => p.category === 'panel');
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
    list.map((part) => (
      <PartRow
        key={part.role}
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
