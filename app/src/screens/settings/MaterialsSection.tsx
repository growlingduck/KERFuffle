import { useState } from 'react';
import type { Dispatch } from 'react';
import { JOB_SLOTS, SLOT_INFO } from '@kerfuffle/engine';
import type { MaterialKind } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { DimensionInput } from '../../components/DimensionInput';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { Switch } from '../../components/Switch';
import { ViewTitle } from '../../components/ViewTitle';
import { Tooltip } from '../../components/Tooltip';
import { toStorageError } from '../../data/errors';
import { blankMaterial, BUILT_IN_ESTIMATE, choicesFor, formatMoney, GRAIN_NAMES, KIND_NAMES, MATERIAL_KINDS, MAX_WASTE_PERCENT, priceUnit, ROUGH_PRICE_NOTE, ROUGH_PRICES } from '../../data/materials';
import type { MaterialRecord } from '../../data/types';
import { displayInches, exactInches } from '../../lib/dimensions';
import { cx } from '../../lib/interaction';
import { removeMaterial, storeMaterial, useMaterials } from '../../state/materials';
import { showToast } from '../../state/toast';
import type { DraftAction, SettingsDraft } from './draft';
import { MaterialForm } from './MaterialForm';
import s from './Settings.module.css';
import { SymbolMark } from '../../components/InfoTip';

type Filter = MaterialKind | 'all';

/** "3/4″ · 48 × 96", "49 × 97", "15/16″ wide · 250 ft rolls", "each". */
export function materialSize(m: MaterialRecord): string {
  const sheet = m.length !== null && m.width !== null ? `${displayInches(m.width).replace('″', '')} × ${displayInches(m.length).replace('″', '')}` : '';
  switch (m.kind) {
    case 'sheet':
      return [m.thickness !== null ? displayInches(m.thickness) : null, sheet].filter(Boolean).join(' · ');
    case 'laminate':
      return sheet;
    case 'banding':
      return [m.bandingWidth !== null ? `${displayInches(m.bandingWidth)} wide` : null, m.rollFeet ? `${m.rollFeet} ft rolls` : 'by the foot'].filter(Boolean).join(' · ');
    case 'hardware':
      return m.unit ?? 'each';
  }
}

const newId = () => crypto.randomUUID();

export interface MaterialsSectionProps {
  draft: SettingsDraft;
  dispatch: Dispatch<DraftAction>;
}

/**
 * Settings → Materials (plan §3.1): the shop's catalog, and the estimate
 * defaults. Catalog changes save at once (each job keeps its own copies, so
 * none change); the defaults wait for Save with the other settings.
 */
export function MaterialsSection({ draft, dispatch }: MaterialsSectionProps) {
  const { catalog } = useMaterials();
  const [filter, setFilter] = useState<Filter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ record: MaterialRecord; adding: boolean } | null>(null);
  const { estimate } = draft.current;

  const live = catalog.filter((m) => showArchived || !m.archived);
  const shown = live.filter((m) => filter === 'all' || m.kind === filter);
  const count = (kind: Filter) => live.filter((m) => kind === 'all' || m.kind === kind).length;
  const archivedCount = catalog.filter((m) => m.archived).length;

  const save = async (record: MaterialRecord) => {
    try {
      await storeMaterial(record);
    } catch (error) {
      throw new Error(toStorageError(error).message, { cause: error });
    }
  };

  const archive = (m: MaterialRecord, archived: boolean) => {
    storeMaterial({ ...m, archived })
      .then(() =>
        showToast(archived ? `Archived ${m.name}. Jobs that use it keep their copy.` : `Restored ${m.name}`, {
          label: 'Undo',
          run: () => void storeMaterial({ ...m, archived: !archived }).catch((e: unknown) => showToast(toStorageError(e).message)),
        }),
      )
      .catch((error: unknown) => showToast(toStorageError(error).message));
  };

  const remove = (m: MaterialRecord) => {
    removeMaterial(m.id)
      .then(() =>
        showToast(`Deleted ${m.name}`, {
          label: 'Undo',
          run: () => void storeMaterial(m).catch((e: unknown) => showToast(toStorageError(e).message)),
        }),
      )
      .catch((error: unknown) => showToast(toStorageError(error).message));
  };

  const duplicate = (m: MaterialRecord) => setEditing({ record: { ...m, id: newId(), name: `${m.name} (copy)`, archived: false }, adding: true });
  const edgeTrimField = 'estimate.edgeTrim' as const;
  const trimUnreadable = draft.unparsed.has(edgeTrimField);

  return (
    <Sheet id="materials" className={s.section} aria-labelledby="set-materials">
      <div className={s.sectionHead}>
        <ViewTitle id="set-materials" mark="2" title="Materials" sub="CATALOG AND PURCHASE ESTIMATE" />
        <p className={s.banner}>
          Each job keeps a copy of its materials and prices. <strong>Editing a material here never changes a job</strong>; use Update prices on a
          job’s cut list to pull in new prices.
        </p>
        {catalog.some((m) => m.priceEstimated && !m.archived) && (
          <p className={s.roughBanner} data-rough-prices>
            <span className={s.roughTag}>Rough</span> prices are best guesses KERFuffle filled in ({ROUGH_PRICES.region} area,{' '}
            {new Date(`${ROUGH_PRICES.asOf}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}) so estimates have a total
            right away. Replace them with your supplier’s prices; estimates say when they use one.
          </p>
        )}
      </div>

      <div className={s.materialBar}>
        <Segmented<Filter>
          label="Show kind"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${count('all')})` },
            ...MATERIAL_KINDS.map((k) => ({ value: k, label: `${KIND_NAMES[k].many} (${count(k)})` })),
          ]}
        />
        <Switch checked={showArchived} onChange={setShowArchived}>
          Show archived ({archivedCount})
        </Switch>
        <Button
          variant="primary"
          onClick={() => setEditing({ record: blankMaterial(filter === 'all' ? 'sheet' : filter, newId()), adding: true })}
        >
          Add material
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className={s.footnote}>No materials of this kind yet. Add one with Add material.</p>
      ) : (
        <table className={s.materialTable}>
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Size</th>
              <th scope="col">Grain</th>
              <th scope="col" className={s.right}>
                Price
              </th>
              <th scope="col" className={s.right}>
                On hand
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className={cx(m.archived && s.archived)} data-material={m.id}>
                <td>
                  <div className={s.materialName}>
                    {m.name}
                    {m.archived && <span className={s.tag}>Archived</span>}
                  </div>
                  <div className={s.materialSub}>
                    {KIND_NAMES[m.kind].one}
                    {m.supplier && ` · ${m.supplier}`}
                    {m.sku && <span className="mono"> · {m.sku}</span>}
                  </div>
                </td>
                <td className="mono">{materialSize(m)}</td>
                <td>{m.kind === 'sheet' || m.kind === 'laminate' ? GRAIN_NAMES[m.grain] : '—'}</td>
                <td className={cx(s.right, 'mono')}>
                  {m.price === null ? (
                    <span className={s.needsPrice}>
                      <SymbolMark symbol="warning" decorative /> needs a price
                    </span>
                  ) : (
                    <>
                      {m.priceEstimated && (
                        <Tooltip content={`${ROUGH_PRICE_NOTE}. Edit to enter your supplier’s price.`} describe>
                          <span className={s.roughTag} tabIndex={0}>
                            Rough<span className="visually-hidden"> starting price</span>
                          </span>
                        </Tooltip>
                      )}{' '}
                      {formatMoney(m.price)} <span className={s.materialSub}>{priceUnit(m)}</span>
                    </>
                  )}
                </td>
                <td className={cx(s.right, 'mono')}>{m.onHand ?? '—'}</td>
                <td className={s.materialActions}>
                  <button type="button" className={s.link} aria-label={`Edit ${m.name}`} onClick={() => setEditing({ record: m, adding: false })}>
                    Edit
                  </button>
                  <button type="button" className={s.link} aria-label={`Duplicate ${m.name}`} onClick={() => duplicate(m)}>
                    Duplicate
                  </button>
                  <button type="button" className={s.link} aria-label={`${m.archived ? 'Restore' : 'Archive'} ${m.name}`} onClick={() => archive(m, !m.archived)}>
                    {m.archived ? 'Restore' : 'Archive'}
                  </button>
                  <button type="button" className={s.link} aria-label={`Delete ${m.name}`} onClick={() => remove(m)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={s.footnote}>
        Sheet sizes are the real size (49 × 97 is fine). A material a job uses can’t be deleted: archive it, and jobs keep their copy.
      </p>

      <div role="group" aria-label="Estimate">
        <div className={cx('cap', s.groupLabel)} aria-hidden="true">
          Estimate
        </div>
        <div className={s.row}>
          <Stepper
            id="set-waste"
            label="Waste allowance (%)"
            value={estimate.wastePercent}
            min={0}
            max={MAX_WASTE_PERCENT}
            decrementLabel="Less waste allowance"
            incrementLabel="More waste allowance"
            minReason="No less than 0%"
            maxReason={`At most ${MAX_WASTE_PERCENT}%`}
            className={cx(estimate.wastePercent !== draft.saved.estimate.wastePercent && s.modified)}
            onChange={(value) => dispatch({ type: 'wastePercent', value })}
          />
          <div className={s.side}>
            <div className={s.help}>Added to the part area before sheets are counted. Sheet counts from area are marked ≈.</div>
            <div className={s.status}>
              <span className={s.statusDefault}>
                Default <span className="mono">{BUILT_IN_ESTIMATE.wastePercent}%</span>
              </span>
            </div>
          </div>
        </div>
        <div className={s.row}>
          <DimensionInput
            key={`trim-${draft.generation}`}
            id="set-edge-trim"
            label="Edge trim, each sheet edge"
            value={estimate.edgeTrim}
            error={trimUnreadable ? 'Can’t be saved like this' : null}
            className={cx(estimate.edgeTrim !== draft.saved.estimate.edgeTrim && s.modified)}
            onLiveChange={(value) => dispatch({ type: 'edgeTrim', value })}
            onCommit={(value) => dispatch({ type: 'edgeTrim', value })}
          />
          <div className={s.side}>
            <div className={s.help}>Taken off every sheet edge before parts are counted against it. 0 is allowed.</div>
            <div className={s.status}>
              <span className={s.statusDefault}>
                Default <span className="mono">{exactInches(BUILT_IN_ESTIMATE.edgeTrim)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Default materials for new jobs">
        <div className={cx('cap', s.groupLabel)} aria-hidden="true">
          Default materials for new jobs
        </div>
        <div className={s.slotGrid}>
          {JOB_SLOTS.map((slot) => {
            const value = estimate.defaults[slot] ?? '';
            const choices = choicesFor(slot, catalog, value || null);
            const changed = (draft.saved.estimate.defaults[slot] ?? '') !== value;
            return (
              <div key={slot}>
                <label className={s.formLabel} htmlFor={`set-default-${slot}`}>
                  {SLOT_INFO[slot].name} <span className={s.formOptional}>{SLOT_INFO[slot].parts.toLowerCase()}</span>
                </label>
                <select
                  id={`set-default-${slot}`}
                  className={cx(s.formInput, changed && s.modified)}
                  value={value}
                  onChange={(e) => dispatch({ type: 'slotDefault', slot, materialId: e.target.value || null })}
                >
                  <option value="">No material</option>
                  {choices.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.archived ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <p className={s.footnote}>New jobs start with these, copied with their prices. Change a job’s materials from its cut list.</p>
      </div>

      {editing && <MaterialForm initial={editing.record} adding={editing.adding} onClose={() => setEditing(null)} onSave={save} />}
    </Sheet>
  );
}
