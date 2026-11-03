import { useEffect, useMemo, useState } from 'react';
import { layoutKey } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput, Sensitivity } from '@kerfuffle/engine';
import { layoutRunner } from './runner';
import type { LayoutRunner } from './runner';

export interface JobLayoutState {
  /** The best layout so far for the current input; the last one shown until the first arrives. */
  layout: JobLayout | null;
  /** The layout is for the current input and the search has finished. */
  final: boolean;
  /** Null until the background sensitivity run finishes for the current input. */
  sensitivity: Sensitivity | null;
  error: string | null;
}

/** What the runner last said, and for which input. */
interface Heard extends JobLayoutState {
  key: string | null;
}

const NOTHING: Heard = { key: null, layout: null, final: false, sensitivity: null, error: null };

/**
 * Lay a job out in the background. A new input cancels the run in progress;
 * the previous layout stays on screen until the new one's first result, so
 * the drawing never blanks out while typing.
 */
export function useJobLayout(input: LayoutInput | null, runner: LayoutRunner = layoutRunner()): JobLayoutState {
  const key = useMemo(() => {
    if (!input) return null;
    try {
      return layoutKey(input);
    } catch {
      return null;
    }
  }, [input]);
  const [heard, setHeard] = useState<Heard>(NOTHING);

  useEffect(() => {
    if (!input || key === null) return;
    const hear = (patch: Partial<JobLayoutState>) =>
      setHeard((h) => (h.key === key ? { ...h, ...patch } : { ...NOTHING, layout: h.layout, ...patch, key }));
    return runner.run(input, {
      onLayout: (layout, final) => hear({ layout, final }),
      onSensitivity: (sensitivity) => hear({ sensitivity }),
      onError: (error) => hear({ error }),
    });
    // The key stands for the input: a new object with the same contents doesn't restart the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, runner]);

  if (key === null) return { layout: null, final: false, sensitivity: null, error: null };
  const current = heard.key === key;
  return {
    layout: heard.layout,
    final: current && heard.final,
    sensitivity: current ? heard.sensitivity : null,
    error: current ? heard.error : null,
  };
}
