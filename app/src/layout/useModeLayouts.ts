import { useEffect, useMemo, useState } from 'react';
import { LAYOUT_MODES, layoutKey } from '@kerfuffle/engine';
import type { JobLayout, LayoutInput, LayoutMode } from '@kerfuffle/engine';
import { comparisonRunner } from './runner';
import type { LayoutRunner } from './runner';

/**
 * The finished layout in each of the other modes, for the stats strip to set
 * beside the current one. They're laid out one after another in the
 * background, without sensitivity notes; a mode still to come is missing.
 */
export function useModeLayouts(
  input: LayoutInput | null,
  runner: LayoutRunner = comparisonRunner(),
): Partial<Record<LayoutMode, JobLayout>> {
  const others = useMemo(() => {
    if (!input) return [];
    return LAYOUT_MODES.filter((m) => m !== input.options.mode).flatMap((mode) => {
      const next: LayoutInput = { ...input, options: { ...input.options, mode } };
      try {
        return [{ mode, input: next, key: layoutKey(next) }];
      } catch {
        return [];
      }
    });
  }, [input]);
  const keys = others.map((o) => o.key).join(' ');
  const [heard, setHeard] = useState<Readonly<Record<string, JobLayout>>>({});

  useEffect(() => {
    let live = true;
    let cancel = () => {};
    const step = (i: number) => {
      const next = others[i];
      if (!live || !next) return;
      // A cached answer comes back inside run(): go on a tick later, once its cancel is known.
      const onward = () => queueMicrotask(() => step(i + 1));
      cancel = runner.run(
        next.input,
        {
          onLayout: (layout, final) => {
            if (!final) return;
            setHeard((h) => (h[next.key] === layout ? h : { ...h, [next.key]: layout }));
            onward();
          },
          onError: onward,
        },
        { notes: false },
      );
    };
    step(0);
    return () => {
      live = false;
      cancel();
    };
    // The keys stand for the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, runner]);

  const out: Partial<Record<LayoutMode, JobLayout>> = {};
  for (const o of others) {
    const layout = heard[o.key];
    if (layout) out[o.mode] = layout;
  }
  return out;
}
