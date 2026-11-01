import { useMemo } from 'react';
import type { ConstructionRules } from '@kerfuffle/engine';
import { jobSession } from '../../data/storage';
import type { CabinetRecord } from '../../data/types';
import { useStore } from '../../state/createStore';
import { evaluateCabinet } from '../../workspace/calc';
import type { Draft, Evaluation } from '../../workspace/calc';
import { useUi } from '../../workspace/ui';

const NO_CABINETS: readonly CabinetRecord[] = [];

/** The open job's cabinets. The array only changes on a commit, never while typing. */
export function useCabinets(): readonly CabinetRecord[] {
  return useStore(jobSession.store, (s) => s.job?.cabinets ?? NO_CABINETS);
}

export function useCabinet(id: string | null): CabinetRecord | null {
  return useStore(jobSession.store, (s) => (id ? (s.job?.cabinets.find((c) => c.id === id) ?? null) : null));
}

/** The job's own rules snapshot. The same object for as long as the job is open. */
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
