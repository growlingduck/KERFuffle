import { useId } from 'react';
import { cx } from '../../lib/interaction';
import styles from './drawing.module.css';
import { interactionAttrs } from './types';
import type { DrawingInteractionProps } from './types';

export interface HatchIds {
  /** 45° section hatch: a part cut by a section view. */
  section: string;
  /** Section hatch in blue, for a traced part. */
  sectionTraced: string;
  /** Light hatch: a surface seen beyond the cut (the back through the opening). */
  light: string;
}

/**
 * Pattern ids unique to one SVG. Two drawings on a page never share ids, so one
 * unmounting can't break the other's fills.
 */
export function useHatchIds(): HatchIds {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return { section: `kf-hatch-${id}`, sectionTraced: `kf-hatch-t-${id}`, light: `kf-hatch-l-${id}` };
}

/** <defs> with the hatch patterns. Place once inside each <svg>. */
export function HatchDefs({ ids }: { ids: HatchIds }) {
  return (
    <defs>
      <pattern id={ids.section} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" style={{ fill: 'var(--white)' }} />
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--ink)' }} strokeWidth="0.9" />
      </pattern>
      <pattern id={ids.sectionTraced} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" style={{ fill: 'var(--blue-tint)' }} />
        <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--blue)' }} strokeWidth="0.9" />
      </pattern>
      <pattern id={ids.light} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" style={{ fill: 'var(--white)' }} />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#cfcfc9" strokeWidth="0.8" />
      </pattern>
    </defs>
  );
}

export interface HatchRectProps extends DrawingInteractionProps {
  ids: HatchIds;
  x: number;
  y: number;
  width: number;
  height: number;
  /** `section` for cut parts, `light` for surfaces seen beyond the cut. */
  hatch?: 'section' | 'light';
}

/** A part drawn with a hatch fill. Traced section parts switch to the blue hatch. */
export function HatchRect({ ids, x, y, width, height, hatch = 'section', className, ...interaction }: HatchRectProps) {
  const fill = hatch === 'light' ? ids.light : interaction.traced ? ids.sectionTraced : ids.section;
  return (
    <g className={cx(styles.group, className)} {...interactionAttrs(interaction)}>
      <rect className={styles.part} x={x} y={y} width={width} height={height} fill={`url(#${fill})`} />
    </g>
  );
}
