import { useMemo } from 'react';
import type { ConstructionRules, DependencyMap } from '@kerfuffle/engine';
import { jobSession } from '../../data/storage';
import type { CabinetRecord } from '../../data/types';
import { useStore } from '../../state/createStore';
import { evaluateCabinet } from '../../workspace/calc';
import type { Draft, Evaluation } from '../../workspace/calc';
import { cabinetBase, traceMap } from '../../workspace/base';
import type { CabinetBase } from '../../workspace/base';
import { traceKeyOf, useUi } from '../../workspace/ui';

const NO_CABINETS: readonly CabinetRecord[] = [];

/** The open job's cabinets. The array only changes on a commit, never while typing. */
export function useCabinets(): readonly CabinetRecord[] {
  return useStore(jobSession.store, (s) => s.job?.cabinets ?? NO_CABINETS);
}

export function useCabinet(id: string | null): CabinetRecord | null {
  return useStore(jobSession.store, (s) => (id ? (s.job?.cabinets.find((c) => c.id === id) ?? null) : null));
}

/** The job's own rules snapshot. A new object only when the construction is changed. */
export function useRules(): ConstructionRules | null {
  return useStore(jobSession.store, (s) => s.job?.rules ?? null);
}

/** The draft for one cabinet only, so typing re-renders just the cabinet being typed in. */
export function useDraftFor(cabinetId: string | null): Draft | null {
  return useUi((ui) => (cabinetId && ui.draft?.cabinetId === cabinetId ? ui.draft : null));
}

/** A cabinet as shown right now (committed values plus anything being typed). */
export function useEvaluation(cabinet: CabinetRecord | null, rules: ConstructionRules | null): Evaluation | null {
  const draft = useDraftFor(cabinet?.id ?? null);
  return useMemo(() => (cabinet && rules ? evaluateCabinet(cabinet, rules, draft) : null), [cabinet, rules, draft]);
}

/** How many of the job's cabinets make parts, and how many need a fix (as saved). */
export function useJobReadiness(): { valid: number; needsFix: number } {
  const cabinets = useCabinets();
  const rules = useRules();
  return useMemo(() => {
    if (!rules) return { valid: 0, needsFix: 0 };
    const valid = cabinets.filter((c) => evaluateCabinet(c, rules).valid).length;
    return { valid, needsFix: cabinets.length - valid };
  }, [cabinets, rules]);
}

/** The base under a cabinet (method A1's ladder base), from the whole job. */
export function useCabinetBase(cabinet: CabinetRecord | null, evaluation: Evaluation | null): CabinetBase | null {
  const cabinets = useCabinets();
  const rules = useRules();
  return useMemo(
    () => (cabinet && rules ? cabinetBase(cabinets, rules, cabinet.id, evaluation) : null),
    [cabinets, rules, cabinet, evaluation],
  );
}

/** What the traced key moves on this cabinet and its base, or null when nothing is traced. */
export function useTraceMap(cabinet: CabinetRecord | null, evaluation: Evaluation | null): DependencyMap | null {
  const trace = useUi(traceKeyOf);
  const cabinets = useCabinets();
  const rules = useRules();
  return useMemo(
    () => (trace && cabinet && rules && evaluation ? traceMap(trace, cabinets, rules, cabinet.id, evaluation) : null),
    [trace, cabinets, rules, cabinet, evaluation],
  );
}
