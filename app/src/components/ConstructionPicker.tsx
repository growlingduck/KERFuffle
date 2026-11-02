import { useId } from 'react';
import { CONSTRUCTION_CHOICES, CONSTRUCTION_NAMES } from '@kerfuffle/engine';
import type { ConstructionChoice } from '@kerfuffle/engine';
import { cx } from '../lib/interaction';
import styles from './ConstructionPicker.module.css';

/**
 * A small section through a base cabinet built each way, front at the left:
 * countertop, box, and what carries the box off the floor. Decorative; the
 * option's name and summary say the same in words.
 */
export function ConstructionDiagram({ choice, className }: { choice: ConstructionChoice; className?: string }) {
  const floor = 58;
  const kick = 47; // top of the toe kick
  return (
    <svg className={cx(styles.diagram, className)} viewBox="0 0 84 64" aria-hidden="true" data-diagram={choice}>
      <rect className={styles.counter} x="6" y="4" width="72" height="4" />
      {choice === 'B' ? (
        <>
          {/* Side to the floor, notched at the front for the kick. */}
          <path className={styles.box} d={`M10 8H74V${floor}H20V${kick}H10Z`} />
          <path className={styles.inner} d={`M10 ${kick - 3}H74`} />
          <rect className={styles.solid} x="20" y={kick} width="3" height={floor - kick} />
        </>
      ) : (
        <>
          <rect className={styles.box} x="10" y="8" width="64" height={kick - 8} />
          {choice === 'A1' ? (
            <>
              {/* Ladder base: kick skin and front rail set back, back rail, a sleeper between. */}
              <rect className={styles.solid} x="19" y={kick} width="1.5" height={floor - kick} />
              <rect className={styles.solid} x="20.5" y={kick} width="3" height={floor - kick} />
              <rect className={styles.sleeper} x="23.5" y={kick + 1} width="47.5" height={floor - kick - 2} />
              <rect className={styles.solid} x="71" y={kick} width="3" height={floor - kick} />
            </>
          ) : (
            <>
              {/* Leveling legs, and a kick board clipped to the front pair. */}
              <rect className={styles.solid} x="20" y={kick} width="3" height={floor - kick} />
              <path className={styles.leg} d={`M28 ${kick}V${floor}M26 ${floor}H30M68 ${kick}V${floor}M66 ${floor}H70`} />
            </>
          )}
        </>
      )}
      <path className={styles.floor} d={`M2 ${floor}H82`} />
    </svg>
  );
}

export interface ConstructionPickerProps {
  value: ConstructionChoice;
  onChange: (choice: ConstructionChoice) => void;
  /** The group's visible name. */
  legend: string;
  /** Text under the legend, tied to the group for screen readers. */
  hint?: string | undefined;
  /** Shown beside the option the job (or shop) has now. */
  currentLabel?: { choice: ConstructionChoice; text: string } | undefined;
  disabled?: boolean;
  className?: string | undefined;
}

/** Method A on a ladder base, method A on legs, or method B, each with its diagram. Arrow keys move between them. */
export function ConstructionPicker({ value, onChange, legend, hint, currentLabel, disabled = false, className }: ConstructionPickerProps) {
  const name = useId();
  const hintId = `${name}-hint`;
  return (
    <fieldset className={cx(styles.group, className)} aria-describedby={hint ? hintId : undefined} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.options}>
        {CONSTRUCTION_CHOICES.map((choice) => {
          const text = CONSTRUCTION_NAMES[choice];
          const nameId = `${name}-${choice}-name`;
          const summaryId = `${name}-${choice}`;
          return (
            <label key={choice} className={styles.option}>
              <input
                type="radio"
                name={name}
                value={choice}
                checked={value === choice}
                onChange={() => onChange(choice)}
                aria-labelledby={nameId}
                aria-describedby={summaryId}
              />
              <ConstructionDiagram choice={choice} />
              <span className={styles.text}>
                <span id={nameId} className={styles.name}>
                  {text.long}
                </span>
                <span id={summaryId} className={styles.summary}>
                  {text.summary}
                  {currentLabel?.choice === choice && <span className={styles.current}> {currentLabel.text}</span>}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
