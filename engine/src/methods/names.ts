import type { MethodSettings } from '../types';

/**
 * How a job's construction is named on screen and on paper. One place, so the
 * new-job dialog, the workspace, the cut list, the title block and the CSV
 * header all say the same thing.
 */

/** The three ways the shop can build: method A on a ladder base or on legs, or method B. */
export type ConstructionChoice = 'A1' | 'A2' | 'B';

export const CONSTRUCTION_CHOICES: readonly ConstructionChoice[] = ['A1', 'A2', 'B'];

/** Which of the three a method block is. */
export function constructionChoiceOf(method: Pick<MethodSettings, 'id' | 'baseType'>): ConstructionChoice {
  if (method.id === 'B') return 'B';
  return method.baseType === 'legs' ? 'A2' : 'A1';
}

/** The method id and base type a choice sets. Base type is kept as is for method B. */
export function applyConstructionChoice(method: MethodSettings, choice: ConstructionChoice): MethodSettings {
  if (choice === 'B') return { ...method, id: 'B' };
  return { ...method, id: 'A', baseType: choice === 'A2' ? 'legs' : 'ladder' };
}

/** Plain-language names for each choice. */
export const CONSTRUCTION_NAMES: Readonly<Record<ConstructionChoice, { short: string; long: string; summary: string }>> = {
  A1: {
    short: 'Frameless · separate ladder base',
    long: 'Frameless on a separate ladder base',
    summary: 'Plain boxes on a ladder base of rails and sleepers, one per run of base cabinets.',
  },
  A2: {
    short: 'Frameless · separate base on legs',
    long: 'Frameless on leveling legs',
    summary: 'Plain boxes on leveling legs, with a clip-on kick board per cabinet.',
  },
  B: {
    short: 'Frameless · integral toe kick',
    long: 'Frameless with integral toe kick',
    summary: 'Base cabinet sides run to the floor, notched for the toe kick, with a kick board between them.',
  },
};

/**
 * "Frameless · separate ladder base". A job made before construction methods
 * never listed its base, and says so.
 */
export function constructionName(method: MethodSettings): string {
  const choice = constructionChoiceOf(method);
  if (method.id === 'A' && !method.listBase) return 'Frameless · separate base (not on this list)';
  return CONSTRUCTION_NAMES[choice].short;
}

/** Whether base cabinets are grouped into runs that share a ladder base (method A1 with the base listed). */
export function usesRuns(method: MethodSettings): boolean {
  return method.id === 'A' && method.baseType === 'ladder' && method.listBase;
}
