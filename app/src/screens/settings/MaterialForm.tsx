import { useId, useState } from 'react';
import { inches } from '@kerfuffle/engine';
import type { MaterialGrain, MaterialKind, Ticks } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { DimensionInput } from '../../components/DimensionInput';
import { Segmented } from '../../components/Segmented';
import { KIND_NAMES, MATERIAL_KINDS, moneyInput, normalizeRecord, parseMoney } from '../../data/materials';
import type { MaterialRecord } from '../../data/types';
import { cx } from '../../lib/interaction';
import s from './Settings.module.css';
import { SymbolMark } from '../../components/InfoTip';

/** Sizes a new material of each kind starts with, so every size field has a value to edit. */
const STARTING_SIZES: Readonly<Record<MaterialKind, Partial<MaterialRecord>>> = {
  sheet: { thickness: inches(3 / 4), length: inches(96), width: inches(48), grain: 'length' },
  laminate: { length: inches(96), width: inches(48), grain: 'length' },
  banding: { bandingWidth: inches(15 / 16) },
  hardware: { unit: 'each' },
};

/** The record with every size its kind needs filled in. */
export function withKind(record: MaterialRecord, kind: MaterialKind): MaterialRecord {
  const start = STARTING_SIZES[kind];
  const pick = <K extends keyof MaterialRecord>(key: K) => (record[key] ?? start[key] ?? null) as MaterialRecord[K];
  return {
    ...record,
    kind,
    thickness: pick('thickness'),
    length: pick('length'),
    width: pick('width'),
    grain: kind === 'sheet' || kind === 'laminate' ? (record.kind === kind ? record.grain : (start.grain ?? 'none')) : 'none',
    bandingWidth: pick('bandingWidth'),
    unit: pick('unit'),
  };
}

type SizeField = 'thickness' | 'length' | 'width' | 'bandingWidth';

export interface MaterialFormProps {
  /** The material being edited, or a blank one being added. */
  initial: MaterialRecord;
  /** True when adding: the kind can still be chosen. */
  adding: boolean;
  onClose: () => void;
  /** Resolves when stored; rejects with a message to show. */
  onSave: (material: MaterialRecord) => Promise<void>;
}

const ON_HAND_LABEL: Readonly<Record<MaterialKind, string>> = {
  sheet: 'Sheets on hand',
  laminate: 'Sheets on hand',
  banding: 'Feet on hand',
  hardware: 'On hand',
};

/**
 * Add or edit a material. Only the fields that matter to its kind are shown
 * (plan §3.1): sheet goods have a thickness, size and grain; laminate a size
 * and pattern direction; banding a width and how it's sold; hardware a unit.
 */
export function MaterialForm({ initial, adding, onClose, onSave }: MaterialFormProps) {
  const id = useId();
  const [m, setM] = useState<MaterialRecord>(() => withKind(initial, initial.kind));
  const [priceText, setPriceText] = useState(moneyInput(initial.price));
  const [onHandText, setOnHandText] = useState(initial.onHand === null ? '' : String(initial.onHand));
  const [rollText, setRollText] = useState(initial.rollFeet === null ? '' : String(initial.rollFeet));
  const [byRoll, setByRoll] = useState(initial.rollFeet !== null);
  const [unreadable, setUnreadable] = useState<ReadonlySet<SizeField>>(new Set());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const set = (patch: Partial<MaterialRecord>) => setM((prev) => ({ ...prev, ...patch }));
  const size = (field: SizeField) => (value: Ticks | null) => {
    setUnreadable((prev) => {
      const next = new Set(prev);
      if (value === null) next.add(field);
      else next.delete(field);
      return next;
    });
    if (value !== null) set({ [field]: value });
  };

  const price = parseMoney(priceText);
  const onHand = onHandText.trim() === '' ? null : Number(onHandText);
  const onHandOk = onHand === null || (Number.isInteger(onHand) && onHand >= 0 && onHand <= 1_000_000);
  const roll = Number(rollText);
  const rollOk = !byRoll || (Number.isInteger(roll) && roll > 0 && roll <= 1_000_000);
  const sizes: SizeField[] = m.kind === 'sheet' ? ['thickness', 'length', 'width'] : m.kind === 'laminate' ? ['length', 'width'] : m.kind === 'banding' ? ['bandingWidth'] : [];
  const zero = sizes.filter((f) => (m[f] ?? 0) <= 0);
  const errors = {
    name: m.name.trim() === '' ? 'Give the material a name' : null,
    price: price.ok ? null : price.message,
    onHand: onHandOk ? null : 'A whole number, 0 or more',
    roll: rollOk ? null : 'Feet per roll, a whole number',
  };
  const valid = Object.values(errors).every((e) => e === null) && unreadable.size === 0 && zero.length === 0;

  const save = async () => {
    setTried(true);
    if (!valid || !price.ok) return;
    setSaving(true);
    setProblem(null);
    try {
      await onSave(
        normalizeRecord({
          ...m,
          price: price.cents,
          onHand,
          rollFeet: m.kind === 'banding' && byRoll ? roll : null,
        }),
      );
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const show = (error: string | null) => (tried ? error : null);
  const priceLabel = m.kind === 'sheet' || m.kind === 'laminate' ? 'Price per sheet' : m.kind === 'banding' ? (byRoll ? 'Price per roll' : 'Price per foot') : 'Price each';
  const sizeError = (field: SizeField) => (unreadable.has(field) ? 'Type a size like 3/4' : zero.includes(field) ? 'Must be more than 0' : null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={adding ? 'Add material' : 'Edit material'}
      mark={adding ? '+' : 'M'}
      sub={KIND_NAMES[m.kind].one.toUpperCase()}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={saving} onClick={() => void save()}>
            {adding ? 'Add material' : 'Save material'}
          </Button>
        </>
      }
    >
      <form
        className={s.materialForm}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {adding && (
          <div className={s.formSpan}>
            <div className={s.choiceLabel} id={`${id}-kind`}>
              Kind
            </div>
            <Segmented<MaterialKind>
              label="Kind"
              value={m.kind}
              onChange={(kind) => {
                setM((prev) => withKind(prev, kind));
                setUnreadable(new Set());
              }}
              options={MATERIAL_KINDS.map((k) => ({ value: k, label: KIND_NAMES[k].one }))}
            />
          </div>
        )}
        <div className={s.formSpan}>
          <label className={s.formLabel} htmlFor={`${id}-name`}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className={s.formInput}
            value={m.name}
            data-autofocus
            aria-invalid={show(errors.name) ? true : undefined}
            aria-describedby={`${id}-name-msg`}
            onChange={(e) => set({ name: e.target.value })}
            autoComplete="off"
          />
          <div id={`${id}-name-msg`} className={s.formMsg}>
            {show(errors.name) && (
              <>
                <SymbolMark symbol="needsFix" /> {errors.name}
              </>
            )}
          </div>
        </div>

        {m.kind === 'sheet' && (
          <DimensionInput id={`${id}-thickness`} label="Thickness" value={m.thickness ?? inches(3 / 4)} error={sizeError('thickness')} onLiveChange={size('thickness')} onCommit={size('thickness')} />
        )}
        {(m.kind === 'sheet' || m.kind === 'laminate') && (
          <>
            <DimensionInput
              id={`${id}-length`}
              label="Sheet length (real size)"
              value={m.length ?? inches(96)}
              error={sizeError('length')}
              onLiveChange={size('length')}
              onCommit={size('length')}
            />
            <DimensionInput
              id={`${id}-width`}
              label="Sheet width (real size)"
              value={m.width ?? inches(48)}
              error={sizeError('width')}
              onLiveChange={size('width')}
              onCommit={size('width')}
            />
            <fieldset className={s.choices}>
              <legend className={s.choiceLabel}>{m.kind === 'laminate' ? 'Grain or pattern direction' : 'Grain'}</legend>
              {(['none', 'length'] as MaterialGrain[]).map((grain) => (
                <label key={grain} className={s.choice}>
                  <input type="radio" name={`${id}-grain`} checked={m.grain === grain} onChange={() => set({ grain })} />
                  <span className={s.choiceMark} aria-hidden="true" />
                  {grain === 'none' ? 'None' : 'Along the length'}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {m.kind === 'banding' && (
          <>
            <DimensionInput
              id={`${id}-banding`}
              label="Width"
              value={m.bandingWidth ?? inches(15 / 16)}
              error={sizeError('bandingWidth')}
              onLiveChange={size('bandingWidth')}
              onCommit={size('bandingWidth')}
            />
            <fieldset className={s.choices}>
              <legend className={s.choiceLabel}>Sold</legend>
              <label className={s.choice}>
                <input type="radio" name={`${id}-sold`} checked={!byRoll} onChange={() => setByRoll(false)} />
                <span className={s.choiceMark} aria-hidden="true" />
                By the foot
              </label>
              <label className={s.choice}>
                <input type="radio" name={`${id}-sold`} checked={byRoll} onChange={() => setByRoll(true)} />
                <span className={s.choiceMark} aria-hidden="true" />
                By the roll
              </label>
            </fieldset>
            {byRoll && (
              <div>
                <label className={s.formLabel} htmlFor={`${id}-roll`}>
                  Roll length (ft)
                </label>
                <input
                  id={`${id}-roll`}
                  className={cx(s.formInput, 'mono')}
                  inputMode="numeric"
                  value={rollText}
                  aria-invalid={show(errors.roll) ? true : undefined}
                  onChange={(e) => setRollText(e.target.value)}
                />
                <div className={s.formMsg}>{show(errors.roll) && (
                    <>
                      <SymbolMark symbol="needsFix" /> {errors.roll}
                    </>
                  )}</div>
              </div>
            )}
          </>
        )}
        {m.kind === 'hardware' && (
          <div>
            <label className={s.formLabel} htmlFor={`${id}-unit`}>
              Counted as
            </label>
            <input id={`${id}-unit`} className={s.formInput} value={m.unit ?? ''} placeholder="each" onChange={(e) => set({ unit: e.target.value })} />
            <div className={s.formMsg} />
          </div>
        )}

        <div>
          <label className={s.formLabel} htmlFor={`${id}-price`}>
            {priceLabel} <span className={s.formOptional}>(blank: needs a price)</span>
          </label>
          <input
            id={`${id}-price`}
            className={cx(s.formInput, 'mono')}
            inputMode="decimal"
            value={priceText}
            placeholder="$0.00"
            aria-invalid={show(errors.price) ? true : undefined}
            aria-describedby={`${id}-price-msg`}
            onChange={(e) => setPriceText(e.target.value)}
          />
          <div id={`${id}-price-msg`} className={s.formMsg}>
            {show(errors.price) && (
              <>
                <SymbolMark symbol="needsFix" /> {errors.price}
              </>
            )}
          </div>
        </div>
        <div>
          <label className={s.formLabel} htmlFor={`${id}-onhand`}>
            {m.kind === 'banding' && byRoll ? 'Rolls on hand' : ON_HAND_LABEL[m.kind]} <span className={s.formOptional}>(optional)</span>
          </label>
          <input
            id={`${id}-onhand`}
            className={cx(s.formInput, 'mono')}
            inputMode="numeric"
            value={onHandText}
            aria-invalid={show(errors.onHand) ? true : undefined}
            aria-describedby={`${id}-onhand-msg`}
            onChange={(e) => setOnHandText(e.target.value)}
          />
          <div id={`${id}-onhand-msg`} className={s.formMsg}>
            {show(errors.onHand) ? (
              <>
                <SymbolMark symbol="needsFix" /> {errors.onHand}
              </>
            ) : (
              'Counted by hand. The estimate buys only what’s missing.'
            )}
          </div>
        </div>
        <div>
          <label className={s.formLabel} htmlFor={`${id}-supplier`}>
            Supplier <span className={s.formOptional}>(optional)</span>
          </label>
          <input id={`${id}-supplier`} className={s.formInput} value={m.supplier ?? ''} onChange={(e) => set({ supplier: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label className={s.formLabel} htmlFor={`${id}-sku`}>
            SKU <span className={s.formOptional}>(optional)</span>
          </label>
          <input id={`${id}-sku`} className={cx(s.formInput, 'mono')} value={m.sku ?? ''} onChange={(e) => set({ sku: e.target.value })} autoComplete="off" />
        </div>
        <div className={s.formSpan}>
          <label className={s.formLabel} htmlFor={`${id}-notes`}>
            Notes <span className={s.formOptional}>(optional)</span>
          </label>
          <textarea id={`${id}-notes`} className={cx(s.formInput, s.formTextarea)} rows={2} value={m.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {problem && (
          <p className={cx(s.formSpan, s.noteError)} role="alert">
            <SymbolMark symbol="needsFix" />{' '}
            {problem}
          </p>
        )}
        {/* Enter in a field saves. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </Dialog>
  );
}
