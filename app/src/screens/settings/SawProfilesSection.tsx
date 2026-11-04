import { useState } from 'react';
import type { Dispatch } from 'react';
import type { SawProfile } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { DimensionInput } from '../../components/DimensionInput';
import { InfoTip } from '../../components/InfoTip';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { ViewTitle } from '../../components/ViewTitle';
import { BUILT_IN_SAW, FIRST_CUT_NAMES, FIRST_CUTS, MAX_EXTRA_SHEETS, sawProfileIssues } from '../../data/sawProfiles';
import type { SawLengthField } from '../../data/sawProfiles';
import { exactInches } from '../../lib/dimensions';
import type { GlossaryKey } from '../../lib/glossary';
import { cx } from '../../lib/interaction';
import { sawField } from './draft';
import type { DraftAction, SettingsDraft } from './draft';
import s from './Settings.module.css';

const newId = () => crypto.randomUUID();

const LENGTH_ROWS: readonly { field: SawLengthField; label: string; help: string; term?: GlossaryKey }[] = [
  { field: 'kerf', term: 'kerf', label: 'Kerf', help: 'The blade’s width, lost at every cut. Check it against the real blade.' },
  { field: 'edgeTrim', label: 'Edge trim, each sheet edge', help: 'Taken off all four edges before anything is cut, the trim cut included. 0 is allowed.' },
  { field: 'minPiece', label: 'Smallest safe piece', help: 'Narrower pieces are still laid out, but flagged so they’re cut with care.' },
  { field: 'keepLength', label: 'Keepable offcut, length', help: 'Offcuts at least this size (either way round) are marked to keep.' },
  { field: 'keepWidth', label: 'Keepable offcut, width', help: 'The other side of a keepable offcut.' },
];

export interface SawProfilesSectionProps {
  draft: SettingsDraft;
  dispatch: Dispatch<DraftAction>;
}

/**
 * Settings → Saw profiles (plan §2.2): how the shop's saws cut, for the sheet
 * optimizer. Changes wait for Save with the other settings. Each job keeps a
 * copy of its profile, so saving here never changes a job.
 */
export function SawProfilesSection({ draft, dispatch }: SawProfilesSectionProps) {
  const { saw } = draft.current;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = saw.profiles.find((p) => p.id === selectedId) ?? saw.profiles.find((p) => p.id === saw.defaultId) ?? saw.profiles[0]!;
  const saved = draft.saved.saw.profiles.find((p) => p.id === selected.id);
  const issues = sawProfileIssues(selected);
  const builtIn = BUILT_IN_SAW.profiles.find((p) => p.id === selected.id) ?? BUILT_IN_SAW.profiles[0]!;

  const add = (profile: SawProfile, after?: string) => {
    dispatch({ type: 'sawAdd', profile, ...(after !== undefined ? { after } : {}) });
    setSelectedId(profile.id);
  };
  const duplicate = (p: SawProfile) => add({ ...p, id: newId(), name: `${p.name} (copy)` }, p.id);
  const changed = (field: keyof SawProfile) => saved === undefined || saved[field] !== selected[field];

  return (
    <Sheet id="saws" className={s.section} aria-labelledby="set-saws">
      <div className={s.sectionHead}>
        <ViewTitle id="set-saws" mark="3" title="Saw profiles" sub="HOW THE SHEET OPTIMIZER CUTS" />
        <p className={s.banner}>
          Each job keeps a copy of its saw profile. <strong>Changing a profile here never changes a job</strong>; choose a profile for a job
          from its cut list.
        </p>
      </div>

      <table className={s.materialTable}>
        <thead>
          <tr>
            <th scope="col">
              Profile <InfoTip term="sawProfile" />
            </th>
            <th scope="col">Kerf</th>
            <th scope="col">Edge trim</th>
            <th scope="col">First cut</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {saw.profiles.map((p) => (
            <tr key={p.id} data-profile={p.id} aria-current={p.id === selected.id ? 'true' : undefined}>
              <td>
                <div className={s.materialName}>
                  {p.name.trim() || 'Unnamed profile'}
                  {p.id === saw.defaultId && <span className={s.tag}>New jobs</span>}
                </div>
              </td>
              <td className="mono">{exactInches(p.kerf)}</td>
              <td className="mono">{exactInches(p.edgeTrim)}</td>
              <td>{FIRST_CUT_NAMES[p.firstCut]}</td>
              <td className={s.materialActions}>
                <button type="button" className={s.link} aria-label={`Edit ${p.name}`} aria-pressed={p.id === selected.id} onClick={() => setSelectedId(p.id)}>
                  Edit
                </button>
                <button type="button" className={s.link} aria-label={`Duplicate ${p.name}`} onClick={() => duplicate(p)}>
                  Duplicate
                </button>
                {p.id !== saw.defaultId && (
                  <>
                    <button type="button" className={s.link} aria-label={`Use ${p.name} for new jobs`} onClick={() => dispatch({ type: 'sawDefault', id: p.id })}>
                      Use for new jobs
                    </button>
                    <button type="button" className={s.link} aria-label={`Remove ${p.name}`} onClick={() => dispatch({ type: 'sawRemove', id: p.id })}>
                      Remove
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={s.materialBar}>
        <Button variant="primary" onClick={() => add({ ...builtIn, id: newId(), name: 'New profile' })}>
          Add profile
        </Button>
      </div>

      <div role="group" aria-label={`Edit ${selected.name.trim() || 'profile'}`}>
        <div className={cx('cap', s.groupLabel)} aria-hidden="true">
          {selected.name.trim() || 'Unnamed profile'}
        </div>
        <div className={s.row}>
          <div>
            <label className={s.formLabel} htmlFor="set-saw-name">
              Name
            </label>
            <input
              id="set-saw-name"
              className={cx(s.formInput, changed('name') && s.modified)}
              value={selected.name}
              aria-invalid={issues.name ? true : undefined}
              aria-describedby={issues.name ? 'set-saw-name-error' : undefined}
              onChange={(e) => dispatch({ type: 'sawField', id: selected.id, patch: { name: e.target.value } })}
            />
            {issues.name && (
              <div id="set-saw-name-error" className={s.help} role="alert">
                {issues.name}
              </div>
            )}
          </div>
          <div className={s.side}>
            <div className={s.help}>Shown in the job’s profile picker and on the layout printout.</div>
          </div>
        </div>

        {LENGTH_ROWS.map((row) => {
          const field = sawField(selected.id, row.field);
          const unreadable = draft.unparsed.has(field);
          return (
            <div className={s.row} key={row.field}>
              <DimensionInput
                key={`${selected.id}-${row.field}-${draft.generation}`}
                id={`set-saw-${row.field}`}
                label={row.label}
                info={row.term && <InfoTip term={row.term} />}
                value={selected[row.field]}
                error={unreadable ? 'Can’t be saved like this' : (issues[row.field] ?? null)}
                className={cx(changed(row.field) && s.modified)}
                onLiveChange={(value) => dispatch({ type: 'sawLength', id: selected.id, field: row.field, value })}
                onCommit={(value) => dispatch({ type: 'sawLength', id: selected.id, field: row.field, value })}
              />
              <div className={s.side}>
                <div className={s.help}>{row.help}</div>
                <div className={s.status}>
                  <span className={s.statusDefault}>
                    Default <span className="mono">{exactInches(builtIn[row.field])}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <div className={cx(s.row, s.choiceRow)} style={{ display: 'block' }}>
          <fieldset className={s.choices}>
            <legend className={s.choiceLabel}>First cut</legend>
            <p className={s.choiceHelp}>A table saw rips along the length first. A panel saw can cut either way; the optimizer picks per sheet.</p>
            {FIRST_CUTS.map((firstCut) => (
              <label key={firstCut} className={s.choice}>
                <input
                  type="radio"
                  name="saw-first-cut"
                  checked={selected.firstCut === firstCut}
                  onChange={() => dispatch({ type: 'sawField', id: selected.id, patch: { firstCut } })}
                />
                <span className={s.choiceMark} aria-hidden="true" />
                {FIRST_CUT_NAMES[firstCut]}
              </label>
            ))}
          </fieldset>
        </div>

        <div className={s.row}>
          <Stepper
            id="set-saw-extra"
            label="Time mode: extra sheets allowed"
            value={selected.extraSheets}
            min={0}
            max={MAX_EXTRA_SHEETS}
            decrementLabel="One fewer extra sheet"
            incrementLabel="One more extra sheet"
            minReason="No fewer than 0"
            maxReason={`At most ${MAX_EXTRA_SHEETS}`}
            className={cx(changed('extraSheets') && s.modified)}
            onChange={(extraSheets) => dispatch({ type: 'sawField', id: selected.id, patch: { extraSheets } })}
          />
          <div className={s.side}>
            <div className={s.help}>How many more sheets of each material Time mode may use than Cost mode, to save saw setups.</div>
            <div className={s.status}>
              <span className={s.statusDefault}>
                Default <span className="mono">{builtIn.extraSheets}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className={s.footnote}>New jobs copy the profile marked “New jobs”. The default can’t be removed; choose another first.</p>
    </Sheet>
  );
}
