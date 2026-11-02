import type { ConstructionRules, MethodId } from '../types';
import { FRAMELESS_ON_BASE } from './frameless';
import { INTEGRAL_KICK } from './integralKick';
import type { ConstructionMethod } from './types';

/** Every construction method, by id. A new method is one more module and one more entry. */
export const METHODS: Readonly<Record<MethodId, ConstructionMethod>> = Object.freeze({
  A: FRAMELESS_ON_BASE,
  B: INTEGRAL_KICK,
});

export const METHOD_IDS = Object.keys(METHODS) as MethodId[];

/** The method a job's rules choose. Rules are validated first, so the id is known. */
export function methodOf(rules: ConstructionRules): ConstructionMethod {
  return METHODS[rules.method.id];
}

export { boxGeometry, boxParts } from './box';
export type { BoxGeometry, BoxOptions } from './box';
export { kickNotch } from './integralKick';
export { runOf, runRef, sleeperCount, splitPlatform } from './ladderBase';
export type {
  CabinetPartGenerator,
  ConstructionMethod,
  HardwareItem,
  JobIssue,
  JobPart,
  JobPartsResult,
  ListedCabinet,
  MaterialSlot,
} from './types';
