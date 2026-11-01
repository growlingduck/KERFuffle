import type { MouseEventHandler, PointerEventHandler } from 'react';

/** Props every drawing primitive shares (interaction-design §5.5). */
export interface DrawingInteractionProps {
  /** Being pointed at or linked: blue and heavier. */
  traced?: boolean | undefined;
  /** Something else is traced: drop back to 30–40% opacity. */
  faded?: boolean | undefined;
  onPointerEnter?: PointerEventHandler<SVGGElement> | undefined;
  onPointerLeave?: PointerEventHandler<SVGGElement> | undefined;
  onClick?: MouseEventHandler<SVGGElement> | undefined;
  className?: string | undefined;
}

export function interactionAttrs({ traced, faded, onPointerEnter, onPointerLeave, onClick }: DrawingInteractionProps) {
  return {
    'data-traced': traced || undefined,
    'data-faded': faded || undefined,
    'data-clickable': onClick ? true : undefined,
    onPointerEnter,
    onPointerLeave,
    onClick,
  };
}
