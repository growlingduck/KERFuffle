import type {
  CabinetType,
  ConstructionChoice,
  ConstructionRules,
  FinishedEnds,
  JobSlot,
  LayoutMode,
  Material,
  MaterialLayout,
  SawProfile,
  Ticks,
} from '@kerfuffle/engine';

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
  /**
   * The material for each slot, with a copy of each as it was chosen. Null
   * (or missing): made before materials; the job uses the shop defaults until
   * a material is chosen for it.
   */
  materials?: JobMaterialsRecord | null;
  /**
   * The job's copy of its saw profile (data/sawProfiles.ts). Null (or
   * missing): made before saw profiles; the job uses the shop's default
   * profile until one is chosen for it.
   */
  sawProfile?: SawProfile | null;
  /**
   * Sheet layouts kept with the job (data/layouts.ts), one per material: saved
   * when the job is marked Ready to cut, or a layout is printed or saved as
   * PDF. Missing or empty: none kept; the layouts are worked out as needed.
   */
  layouts?: SavedLayoutRecord[];
}

/**
 * A sheet layout kept with a job (`layouts` table, schema version 5). It keeps
 * everything it was made from, so the app can show it as it was and say what
 * has changed since.
 */
export interface SavedLayoutRecord {
  materialId: string;
  /** `materialInputKeys` of the job when it was saved: the pieces, the sheet and the seed. */
  inputHash: string;
  /** The optimizer's ALGORITHM_VERSION that made it. */
  algorithmVersion: number;
  mode: LayoutMode;
  /** The saw profile it was cut for. */
  profile: SawProfile;
  /** The material's layout, as the optimizer gave it. */
  layout: MaterialLayout;
  createdAt: string;
}

/** One material in the shop's catalog (`Material` in app/src-tauri/src/db/models.rs). */
export interface MaterialRecord extends Material {
  supplier: string | null;
  sku: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A job's copy of a material: name, size, grain and price as they were when it
 * was chosen or its price last updated. On hand is not copied: it's the
 * shop's stock, read from the catalog.
 */
export interface MaterialSnapshot extends Omit<Material, 'onHand'> {
  /** When the price was copied: 2026-11-02T14:05:00.000Z. */
  pricedAt: string;
}

/** A job's materials (`materials_json` on the job). */
export interface JobMaterialsRecord {
  slots: Partial<Record<JobSlot, MaterialSnapshot>>;
}

/** The fields the database owns; edits to a job never change them. */
export type ServerOwnedField = 'id' | 'number' | 'rules' | 'rulesVersion' | 'createdAt' | 'updatedAt' | 'revision';

/**
 * Everything the user edits in a job, saved as one snapshot. `rules` is sent
 * only when the construction was changed, which the database allows only
 * while the job is a draft.
 */
export type JobSnapshot = Omit<JobRecord, ServerOwnedField | 'id' | 'layouts'> & { id: string; rules?: ConstructionRules };

export interface NewJob {
  name: string;
  customer?: string | null;
  notes?: string | null;
  /** Absent: the shop's default method. */
  construction?: ConstructionChoice;
  /** The shop's default materials, copied for the job. */
  materials?: JobMaterialsRecord;
  /** The shop's default saw profile, copied for the job. */
  sawProfile?: SawProfile;
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
/** Waste, edge trim and the default material per slot (data/materials.ts). */
export const ESTIMATE_SETTING = 'estimate';
/** The shop's saw profiles and the default for new jobs (data/sawProfiles.ts). */
export const SAW_PROFILES_SETTING = 'saw_profiles';
/** `backups` is reserved; backup settings live in their own file (see BackupSettings). */
export type ShopSettingKey = typeof RULES_SETTING | typeof DISPLAY_SETTING | typeof ESTIMATE_SETTING | typeof SAW_PROFILES_SETTING | 'backups';

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

/** The job's editable contents. `withRules` adds its rules, for a changed construction. */
export function toSnapshot(job: JobRecord, withRules = false): JobSnapshot {
  return {
    id: job.id,
    name: job.name,
    customer: job.customer,
    notes: job.notes,
    status: job.status,
    cabinets: job.cabinets,
    // Null tells the database to leave them as they are.
    materials: job.materials ?? null,
    sawProfile: job.sawProfile ?? null,
    ...(withRules ? { rules: job.rules } : {}),
  };
}
