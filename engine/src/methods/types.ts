import type { CabinetSpec, CabinetType, ConstructionRules, MethodId, MethodSettings, Part, PartRole, ValidationIssue } from '../types';

/**
 * What each part is cut from, by job-level material slot. A job assigns one
 * material to each slot (prompt 11).
 */
export type MaterialSlot = 'box' | 'back' | 'shelves' | 'base' | 'kick-face' | 'laminate';

/** Bought items a method needs, counted per cabinet. Not on the cut list. */
export interface HardwareItem {
  item: 'leveling-leg' | 'kick-clip';
  name: string;
  cabinetId: string;
  quantity: number;
}

/** A cabinet that passed validation, with its place in the job's list. */
export interface ListedCabinet {
  index: number;
  cabinet: CabinetSpec;
}

/** A part made for the job rather than for one cabinet. */
export interface JobPart {
  part: Part;
  /**
   * The cabinet (by list position) whose own platform this is. Null for parts
   * a run of cabinets shares.
   */
  cabinetIndex: number | null;
}

/** A problem with a run or platform, which leaves its parts off. */
export interface JobIssue {
  /** "Run: Sink wall", or the cabinet label for a cabinet's own platform. */
  ref: string;
  issue: ValidationIssue;
}

export interface JobPartsResult {
  parts: JobPart[];
  issues: JobIssue[];
}

/** Parts for one validated cabinet, in any order (the caller sorts them). */
export type CabinetPartGenerator = (spec: CabinetSpec, rules: ConstructionRules) => Part[];

/**
 * A construction method. Each lives in its own module and is listed once in
 * methods/index.ts. A method decides which parts a cabinet has; the box sizes
 * come from the shared calculator in box.ts.
 *
 * Nothing here assumes sheet goods: a part's category can be 'lumber', so a
 * face-frame method can be added as one more module.
 */
export interface ConstructionMethod {
  id: MethodId;
  /** Plain-language name, e.g. "Frameless on a separate base". */
  name: string;
  /** One sentence for the new-job dialog. */
  summary: string;
  /** The settings this method reads, and their defaults. */
  settings: readonly (keyof MethodSettings)[];
  defaults: Readonly<Partial<MethodSettings>>;
  /** Parts per cabinet, by cabinet type. Called only for cabinets that pass validation. */
  parts: Readonly<Record<CabinetType, CabinetPartGenerator>>;
  /** Parts shared by a run of cabinets (method A1's ladder base). */
  jobParts?: (cabinets: readonly ListedCabinet[], rules: ConstructionRules) => JobPartsResult;
  /** Parts that show in the finished job (for grain mode and laminate). */
  visible: ReadonlySet<PartRole>;
  /** The material slot each part role is cut from. */
  slots: Readonly<Record<PartRole, MaterialSlot>>;
  /** Hardware per cabinet (method A2's legs and clips). */
  hardware?: (spec: CabinetSpec, rules: ConstructionRules) => HardwareItem[];
}
