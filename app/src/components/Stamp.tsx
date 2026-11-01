import type { JobStatus } from '../state/jobs';
import { cx } from '../lib/interaction';
import styles from './Stamp.module.css';

export const STATUS_INFO: Record<JobStatus, { label: string; glyph: string }> = {
  draft: { label: 'Draft', glyph: '○' },
  ready: { label: 'Ready to cut', glyph: '◆' },
  completed: { label: 'Completed', glyph: '✓' },
  archived: { label: 'Archived', glyph: '▭' },
};

export interface StampProps {
  status: JobStatus;
  /** Flat (not rotated) in menus and print. */
  flat?: boolean;
  className?: string | undefined;
}

/** Rubber stamp for job status: glyph + text, double border, rotated −2° on screen. */
export function Stamp({ status, flat = false, className }: StampProps) {
  const info = STATUS_INFO[status];
  return (
    <span className={cx(styles.stamp, styles[status], flat && styles.flat, className)}>
      <span className="mono" aria-hidden="true">
        {info.glyph}
      </span>
      {info.label}
    </span>
  );
}
