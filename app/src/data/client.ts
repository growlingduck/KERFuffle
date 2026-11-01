import { invoke, isTauri } from '@tauri-apps/api/core';
import { toStorageError } from './errors';
import { createMemoryClient } from './memoryClient';
import { parseRules } from './rules';
import type {
  BackupInfo,
  BackupOverview,
  BackupSettings,
  CabinetRecord,
  ImportMode,
  JobFields,
  JobListItem,
  JobRecord,
  JobSnapshot,
  JobStatus,
  NewJob,
  RecoveredJob,
  RestoreResult,
  Saved,
  ShopSettingKey,
  ShopSettings,
} from './types';
import { RULES_SETTING } from './types';

/**
 * Typed access to the job database. The webview never sees SQL: in the desktop
 * app every call is a Tauri command (app/src-tauri/src/commands.rs). In the
 * browser (dev:web) and in tests an in-memory implementation stands in.
 *
 * Every method rejects with a StorageError whose message can be shown as is.
 */
export interface StorageClient {
  listJobs(): Promise<JobListItem[]>;
  getJob(id: string): Promise<JobRecord>;
  /** Snapshots the current shop rules into the new job. */
  createJob(job: NewJob): Promise<JobRecord>;
  /** New id and number, "(copy)", draft, new cabinet ids, the source's own rules. */
  duplicateJob(id: string): Promise<JobRecord>;
  updateJobFields(id: string, fields: JobFields): Promise<Saved>;
  setJobStatus(id: string, status: JobStatus): Promise<Saved>;
  deleteJob(id: string): Promise<void>;
  /** Job fields, status and the whole cabinet list in one transaction; clears the journal. */
  saveJob(job: JobSnapshot): Promise<Saved>;
  upsertCabinet(jobId: string, cabinet: CabinetRecord, position?: number): Promise<Saved>;
  reorderCabinets(jobId: string, cabinetIds: readonly string[]): Promise<Saved>;
  deleteCabinet(jobId: string, cabinetId: string): Promise<Saved>;
  /** Crash-recovery journal: the latest unsaved snapshot, written before the debounced save. */
  writePendingEdit(job: JobSnapshot, baseRevision: number): Promise<void>;
  /** Apply journaled snapshots left by a crash. Each is applied exactly once. */
  recoverPendingEdits(): Promise<RecoveredJob[]>;
  getShopSettings(): Promise<ShopSettings>;
  setShopSetting(key: ShopSettingKey, value: unknown): Promise<void>;
  /** Development builds only. */
  devLoadSampleJobs(): Promise<JobRecord[]>;

  /**
   * Store a job read from a .kerfjob file (already checked by data/jobFile.ts),
   * keeping its own rules. 'replace' backs up all jobs first.
   */
  importJob(job: JobRecord, mode: ImportMode): Promise<JobRecord>;

  /** Backup folder, how many to keep, and the backups there, newest first. */
  backupOverview(): Promise<BackupOverview>;
  backUpNow(): Promise<BackupInfo>;
  /** Once a day at startup. Null when today's backup exists or there are no jobs. */
  runDailyBackup(): Promise<BackupInfo | null>;
  /** Back up the current jobs, then make this backup the job database. */
  restoreBackup(fileName: string): Promise<RestoreResult>;
  /** Validates the folder (it must accept files) and returns the new overview. */
  setBackupSettings(settings: BackupSettings): Promise<BackupOverview>;
}

type WireJob = Omit<JobRecord, 'rules'> & { rules: unknown };

function fromWire(job: WireJob): JobRecord {
  return { ...job, rules: parseRules(job.rules, job.rulesVersion) };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toStorageError(error);
  }
}

export const tauriClient: StorageClient = {
  listJobs: () => call('list_jobs'),
  getJob: async (id) => fromWire(await call<WireJob>('get_job', { id })),
  createJob: async (job) =>
    fromWire(await call<WireJob>('create_job', { job: { name: job.name, customer: job.customer ?? null, notes: job.notes ?? null } })),
  duplicateJob: async (id) => fromWire(await call<WireJob>('duplicate_job', { id })),
  updateJobFields: (id, fields) => call('update_job_fields', { id, fields }),
  setJobStatus: (id, status) => call('set_job_status', { id, status }),
  deleteJob: (id) => call('delete_job', { id }),
  saveJob: (job) => call('save_job', { job }),
  upsertCabinet: (jobId, cabinet, position) => call('upsert_cabinet', { jobId, cabinet, position: position ?? null }),
  reorderCabinets: (jobId, cabinetIds) => call('reorder_cabinets', { jobId, cabinetIds }),
  deleteCabinet: (jobId, cabinetId) => call('delete_cabinet', { jobId, cabinetId }),
  writePendingEdit: (job, baseRevision) => call('write_pending_edit', { job, baseRevision }),
  recoverPendingEdits: () => call('recover_pending_edits'),
  getShopSettings: async () => {
    const { [RULES_SETTING]: rules, ...other } = await call<Record<string, unknown>>('get_shop_settings');
    return { rules: parseRules(rules, 1), other };
  },
  setShopSetting: (key, value) => call('set_shop_setting', { key, value }),
  devLoadSampleJobs: async () => (await call<WireJob[]>('dev_load_sample_jobs')).map(fromWire),
  importJob: async (job, mode) => fromWire(await call<WireJob>('import_job', { job, mode })),
  backupOverview: () => call('backup_overview'),
  backUpNow: () => call('back_up_now'),
  runDailyBackup: () => call('run_daily_backup'),
  restoreBackup: (fileName) => call('restore_backup', { fileName }),
  setBackupSettings: (settings) => call('set_backup_settings', { settings }),
};

let client: StorageClient | null = null;

/** The desktop database in the Tauri window; an empty in-memory one elsewhere. */
export function getStorageClient(): StorageClient {
  client ??= isTauri() ? tauriClient : createMemoryClient();
  return client;
}

/** Swap the client (tests). */
export function setStorageClient(next: StorageClient): void {
  client = next;
}
