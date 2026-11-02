import type { CabinetType, ConstructionRules, FinishedEnds, Ticks } from '@kerfuffle/engine';

/**
 * Records exchanged with the job database. They mirror the Rust types in
 * app/src-tauri/src/db/models.rs field for field (camelCase on the wire).
 * Sizes are integer Ticks (1/64″), never floats or formatted strings.
 */

export type JobStatus = 'draft' | 'ready' | 'completed' | 'archived';

export const JOB_STATUSES: readonly JobStatus[] = ['draft', 'ready', 'completed', 'archived'];

export interface CabinetRecord {
  /** Stable database id (uuid). Not shown to the user. */
  id: string;
  /** Shown on parts, e.g. "B1". The engine's `CabinetSpec.id`. */
  label: string;
  type: CabinetType;
  width: Ticks;
  height: Ticks;
  depth: Ticks;
  shelfCount: number;
  finishedEnds: FinishedEnds;
  quantity: number;
  /** Optional grouping by room or area; not in the UI yet. */
  room: string | null;
  /**
   * The run of base cabinets this one stands in, e.g. "Sink wall" (method A1
   * shares one ladder base per run). Separate from `room`. Missing or null: none.
   */
  run?: string | null;
}

export interface JobRecord {
  id: string;
  /** Shown as J-0014. */
  number: number;
  name: string;
  customer: string | null;
  notes: string | null;
  status: JobStatus;
  /** This job's own rules, snapshotted when it was created. */
  rules: ConstructionRules;
  rulesVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Bumped by every save. */
  revision: number;
  /** In list order. */
  cabinets: CabinetRecord[];
}

/** The fields the database owns; edits to a job never change them. */
export type ServerOwnedField = 'id' | 'number' | 'rules' | 'rulesVersion' | 'createdAt' | 'updatedAt' | 'revision';

/** Everything the user edits in a job, saved as one snapshot. */
export type JobSnapshot = Omit<JobRecord, ServerOwnedField | 'id'> & { id: string };

export interface NewJob {
  name: string;
  customer?: string | null;
  notes?: string | null;
}

export interface JobFields {
  name: string;
  customer: string | null;
  notes: string | null;
}

export interface Saved {
  revision: number;
  updatedAt: string;
}

export interface CabinetOutline {
  label: string;
  type: CabinetType;
  width: Ticks;
  height: Ticks;
  depth: Ticks;
  quantity: number;
}

export interface JobListItem {
  id: string;
  number: number;
  name: string;
  customer: string | null;
  notes: string | null;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  /** Cabinet rows, not multiplied by quantity. */
  cabinetCount: number;
  cabinets: CabinetOutline[];
}

export interface RecoveredJob {
  jobId: string;
  jobName: string;
  revision: number;
  updatedAt: string;
}

/** How an imported job is stored (`ImportMode` in app/src-tauri/src/db/transfer.rs). */
export type ImportMode = 'new' | 'copy' | 'replace';

/** One backup file (`BackupInfo` in app/src-tauri/src/db/backup.rs). */
export interface BackupInfo {
  fileName: string;
  /** This PC's local time, without a zone: `2026-11-01T08:02:00`. */
  createdAt: string;
  sizeBytes: number;
  /** Null when the backup holds no job table (a very old schema). */
  jobCount: number | null;
}

export interface BackupOverview {
  folder: string;
  defaultFolder: string;
  keep: number;
  /** Newest first. */
  backups: BackupInfo[];
}

/** Kept in a settings file beside the database, not in it, so a restore never moves the folder. */
export interface BackupSettings {
  /** Null: the default folder (Documents\KERFuffle\Backups). */
  folder: string | null;
  keep: number;
}

export interface RestoreResult {
  restored: BackupInfo;
  /** The jobs from just before the restore; null if they couldn't be read. */
  safety: BackupInfo | null;
}

export const RULES_SETTING = 'construction_rules';
export const DISPLAY_SETTING = 'display';
/** `backups` is reserved; backup settings live in their own file (see BackupSettings). */
export type ShopSettingKey = typeof RULES_SETTING | typeof DISPLAY_SETTING | 'backups';

/** Denominator sizes are rounded to on screen and paper. Storage is always exact (1/64″). */
export type RoundTo = 8 | 16 | 32;
export const ROUND_TO_OPTIONS: readonly RoundTo[] = [8, 16, 32];
export const DEFAULT_ROUND_TO: RoundTo = 16;

export interface DisplaySettings {
  roundTo: RoundTo;
}

/** Read the stored display setting; anything unexpected means the default. */
export function parseDisplaySettings(raw: unknown): DisplaySettings {
  const roundTo = (raw as { roundTo?: unknown } | null | undefined)?.roundTo;
  return { roundTo: ROUND_TO_OPTIONS.includes(roundTo as RoundTo) ? (roundTo as RoundTo) : DEFAULT_ROUND_TO };
}

export interface ShopSettings {
  /** Defaults for new jobs. Always present (built-in defaults until saved). */
  rules: ConstructionRules;
  /** Other settings by key, as stored. */
  other: Partial<Record<Exclude<ShopSettingKey, typeof RULES_SETTING>, unknown>>;
}

export function formatJobNumber(n: number): string {
  return `J-${String(n).padStart(4, '0')}`;
}

export function toSnapshot(job: JobRecord): JobSnapshot {
  return {
    id: job.id,
    name: job.name,
    customer: job.customer,
    notes: job.notes,
    status: job.status,
    cabinets: job.cabinets,
  };
}
