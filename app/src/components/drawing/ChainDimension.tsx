import { DimensionLine } from './DimensionLine';
import type { DrawingInteractionProps } from './types';

export interface ChainSegment extends DrawingInteractionProps {
  /** Stable key, e.g. 'ctop', 'box', 'toe'. */
  id: string;
  label: string;
}

export interface ChainDimensionProps {
  orientation: 'horizontal' | 'vertical';
  /** Position of the chain line: x for a vertical chain, y for a horizontal one. */
  at: number;
  /** Coordinates along the chain, in order; n + 1 stops for n segments. */
  stops: readonly number[];
  segments: readonly ChainSegment[];
  /** Object edge the extension lines start from (across the chain). */
  extendFrom?: number;
  /** Overall dimension drawn further out, spanning the whole chain. */
  overall?: (DrawingInteractionProps & { at: number; label: string }) | undefined;
}

/**
 * Stacked dimensions sharing ticks, e.g. countertop / box / toe kick, with an
 * optional overall dimension outside them (interaction-design §2).
 */
export function ChainDimension({ orientation, at, stops, segments, extendFrom, overall }: ChainDimensionProps) {
  const vertical = orientation === 'vertical';
  const point = (along: number, across: number) => (vertical ? { x: across, y: along } : { x: along, y: across });
  const first = stops[0];
  const last = stops[stops.length - 1];

  return (
    <g>
      {segments.map((segment, i) => {
        const from = stops[i];
        const to = stops[i + 1];
        if (from === undefined || to === undefined) return null;
        const a = point(from, at);
        const b = point(to, at);
        const { id, label, ...interaction } = segment;
        return (
          <DimensionLine key={id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} label={label} extendFrom={extendFrom} {...interaction} />
        );
      })}
      {overall && first !== undefined && last !== undefined && (
        // The overall's extension lines start just past the chain line.
        <DimensionLine
          {...overall}
          x1={point(first, overall.at).x}
          y1={point(first, overall.at).y}
          x2={point(last, overall.at).x}
          y2={point(last, overall.at).y}
          extendFrom={at}
          gap={6}
        />
      )}
    </g>
  );
}
