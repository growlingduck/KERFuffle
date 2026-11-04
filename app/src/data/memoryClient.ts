/* eslint-disable @typescript-eslint/require-await --
   Methods are async without awaiting so that a thrown StorageError becomes a
   rejected promise, exactly like a failed Tauri command. */
import { applyConstructionChoice, usesRuns } from '@kerfuffle/engine';
import type { ConstructionChoice, ConstructionRules } from '@kerfuffle/engine';
import defaultRulesJson from '../../src-tauri/src/db/default_rules.json';
import exampleJobJson from '../../src-tauri/src/db/example_job.json';
import sampleJobsJson from '../../src-tauri/src/db/sample_jobs.json';
import type { StorageClient } from './client';
import { StorageError } from './errors';
import { parseSavedLayouts } from './layouts';
import { normalizeRecord, STANDARD_MATERIALS } from './materials';
import { parseRules, RULES_VERSION } from './rules';
import type {
  BackupInfo,
  BackupOverview,
  BackupSettings,
  CabinetRecord,
  JobListItem,
  JobMaterialsRecord,
  JobRecord,
  JobSnapshot,
  MaterialRecord,
  RecoveredJob,
  Saved,
} from './types';
import { parseSawProfile } from './sawProfiles';
import { DEFAULTS_CHECKED_SETTING, ESTIMATE_SETTING, JOB_STATUSES, RULES_SETTING, SAW_PROFILES_SETTING } from './types';

/**
 * An in-memory job database with the same rules as the Rust one: used by
 * `npm run dev:web` (no Tauri) and by tests. Like the real database it outlives
 * the job session, so a test can "kill" a session and recover from the journal.
 */
export interface MemoryStorageClient extends StorageClient {
  /** Put jobs in directly (tests). */
  seed(jobs: JobRecord[]): void;
  /** Rows in the crash-recovery journal (tests). */
  pendingJobIds(): string[];
  /** Make the next backup fail with this message, as a failed integrity check would (tests). */
  failNextBackup(message: string): void;
}

/** Shown as the backup folder when there is no real one (browser preview, tests). */
export const MEMORY_BACKUP_FOLDER = 'Documents\\KERFuffle\\Backups';

interface MemoryBackup {
  info: BackupInfo;
  jobs: Map<string, JobRecord>;
  settings: Map<string, unknown>;
  materials: MaterialRecord[];
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const MAX_TICKS = Number.MAX_SAFE_INTEGER;
const MAX_SHELVES = 1_000;
const MAX_QUANTITY = 100_000;

interface Pending {
  snapshot: JobSnapshot;
  baseRevision: number;
}

export const BUILTIN_DEFAULT_RULES: ConstructionRules = parseRules(defaultRulesJson, RULES_VERSION);

export function createMemoryClient(options: { now?: () => string } = {}): MemoryStorageClient {
  const now = options.now ?? (() => new Date().toISOString());
  const jobs = new Map<string, JobRecord>();
  const settings = new Map<string, unknown>();
  const pending = new Map<string, Pending>();
  // Like a new database: the standard materials, no prices.
  let materials: MaterialRecord[] = STANDARD_MATERIALS.map((m) => ({ ...m, createdAt: now(), updatedAt: now() }));
  let backups: MemoryBackup[] = [];
  let backupSettings: BackupSettings = { folder: null, keep: 14 };
  let nextBackupFailure: string | null = null;

  const copy = <T>(value: T): T => structuredClone(value);
  const job = (id: string) => {
    const found = jobs.get(id);
    if (!found) throw new StorageError('notFound', 'That job no longer exists. It may have been deleted.');
    return found;
  };
  const nextNumber = () => Math.max(0, ...[...jobs.values()].map((j) => j.number)) + 1;
  // Like the Rust repo: shop defaults saved before construction methods gain the default method.
  const currentRules = (): ConstructionRules => {
    const stored = copy((settings.get(RULES_SETTING) as ConstructionRules | undefined) ?? BUILTIN_DEFAULT_RULES);
    return 'method' in stored ? stored : { ...(stored as ConstructionRules), method: copy(BUILTIN_DEFAULT_RULES.method) };
  };
  const blankToNull = (text: string | null | undefined) => (text == null || text.trim() === '' ? null : text);
  const touch = (record: JobRecord): Saved => {
    record.revision += 1;
    record.updatedAt = now();
    return { revision: record.revision, updatedAt: record.updatedAt };
  };
  const invalid = (message: string) => new StorageError('invalid', message);

  function checkCabinet(c: CabinetRecord) {
    if (c.id.trim() === '') throw invalid('A cabinet is missing its id.');
    const name = c.label.trim() === '' ? 'A cabinet' : c.label;
    if (!['base', 'wall'].includes(c.type)) throw invalid(`${name} has an unknown type.`);
    if (!['none', 'left', 'right', 'both'].includes(c.finishedEnds)) throw invalid(`${name} has unknown finished ends.`);
    for (const key of ['width', 'height', 'depth'] as const) {
      if (!Number.isInteger(c[key]) || c[key] < 0) throw invalid(`${name} has a negative ${key}.`);
      if (c[key] > MAX_TICKS) throw invalid(`${name} has a ${key} too large to store.`);
    }
    if (!Number.isInteger(c.shelfCount) || c.shelfCount < 0 || c.shelfCount > MAX_SHELVES) {
      throw invalid(`${name} has ${c.shelfCount} shelves; the number must be between 0 and ${MAX_SHELVES}.`);
    }
    if (!Number.isInteger(c.quantity) || c.quantity < 0 || c.quantity > MAX_QUANTITY) {
      throw invalid(`${name} has a quantity of ${c.quantity}; it must be between 0 and ${MAX_QUANTITY}.`);
    }
  }

  function checkMaterials(m: JobMaterialsRecord | null | undefined) {
    if (m == null) return;
    const ok =
      typeof m === 'object' &&
      typeof m.slots === 'object' &&
      m.slots !== null &&
      Object.values(m.slots).every((s) => typeof s?.id === 'string' && s.id !== '');
    if (!ok) throw invalid('The job’s materials are incomplete.');
  }

  function checkSawProfile(p: unknown) {
    if (p == null) return;
    if (!parseSawProfile(p)) throw invalid('The job’s saw profile is incomplete.');
  }

  function checkLayouts(layouts: unknown) {
    try {
      parseSavedLayouts(layouts);
    } catch {
      throw invalid('The job’s sheet layouts are incomplete.');
    }
  }

  function checkMaterial(m: MaterialRecord) {
    if (m.id.trim() === '') throw invalid('A material is missing its id.');
    if (m.name.trim() === '') throw invalid('A material needs a name.');
    const size = (label: string, value: number | null, required: boolean) => {
      if (value === null) {
        if (required) throw invalid(`${m.name} needs a ${label}.`);
      } else if (!Number.isSafeInteger(value) || value <= 0) throw invalid(`${m.name} has an impossible ${label}.`);
    };
    const sheet = m.kind === 'sheet';
    const sized = sheet || m.kind === 'laminate';
    size('thickness', m.thickness, sheet);
    size('sheet length', m.length, sized);
    size('sheet width', m.width, sized);
    size('width', m.bandingWidth, false);
    size('roll length', m.rollFeet, false);
    if (m.price !== null && (!Number.isSafeInteger(m.price) || m.price < 0)) throw invalid(`${m.name} has an impossible price.`);
    if (m.onHand !== null && (!Number.isSafeInteger(m.onHand) || m.onHand < 0)) throw invalid(`${m.name} has an impossible count on hand.`);
  }

  function checkSnapshot(s: JobSnapshot) {
    if (!JOB_STATUSES.includes(s.status)) throw invalid('That job status is unknown.');
    checkMaterials(s.materials);
    checkSawProfile(s.sawProfile);
    checkCabinets(s.cabinets);
  }

  function checkCabinets(cabinets: readonly CabinetRecord[]) {
    const seen = new Set<string>();
    for (const c of cabinets) {
      checkCabinet(c);
      if (seen.has(c.id)) throw invalid(`Cabinet ${c.label} appears twice in the job.`);
      seen.add(c.id);
    }
  }

  function cabinetOwner(cabinetId: string): string | undefined {
    for (const j of jobs.values()) if (j.cabinets.some((c) => c.id === cabinetId)) return j.id;
    return undefined;
  }

  function applySnapshot(s: JobSnapshot): Saved {
    const record = job(s.id);
    for (const c of s.cabinets) {
      const owner = cabinetOwner(c.id);
      if (owner && owner !== s.id) throw invalid(`Cabinet ${c.label} belongs to a different job.`);
    }
    // Like the Rust repo: a changed construction saves only while the job is (or becomes) a draft.
    if (s.rules !== undefined) {
      if (typeof s.rules !== 'object' || s.rules === null || typeof s.rules.method !== 'object') {
        throw invalid('The job’s construction settings are incomplete.');
      }
      if (record.status !== 'draft' && s.status !== 'draft') {
        throw invalid('This job’s construction is locked because it is no longer a draft. Duplicate the job to try another method.');
      }
      record.rules = copy(s.rules);
      record.rulesVersion = RULES_VERSION;
    }
    // Like the Rust repo: no materials in the snapshot leaves the job's as they are.
    if (s.materials != null) record.materials = copy(s.materials);
    if (s.sawProfile != null) record.sawProfile = copy(s.sawProfile);
    record.name = s.name;
    record.customer = blankToNull(s.customer);
    record.notes = blankToNull(s.notes);
    record.status = s.status;
    record.cabinets = copy(s.cabinets).map((c) => ({ ...c, room: blankToNull(c.room), ...(c.run !== undefined ? { run: blankToNull(c.run) } : {}) }));
    pending.delete(s.id);
    return touch(record);
  }

  /** A backup of everything, named for the local time like the real ones. */
  function takeBackup(): BackupInfo {
    if (nextBackupFailure !== null) {
      const message = nextBackupFailure;
      nextBackupFailure = null;
      throw new StorageError('backup', message);
    }
    const at = new Date(now());
    const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
    let fileName = `kerfuffle-${stamp}.db`;
    for (let n = 2; backups.some((b) => b.info.fileName === fileName); n++) fileName = `kerfuffle-${stamp}-${n}.db`;
    const snapshot = { jobs: copy(jobs), settings: copy(settings), materials: copy(materials) };
    const info: BackupInfo = {
      fileName,
      createdAt: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}`,
      sizeBytes: JSON.stringify([...snapshot.jobs.values()]).length + 4096,
      jobCount: jobs.size,
    };
    backups = [{ info, ...snapshot }, ...backups];
    return copy(info);
  }

  /** Keeps the latest n. (The real rotation also keeps one a week for a month; see db/backup.rs.) */
  function rotate() {
    backups = backups.slice(0, Math.max(1, backupSettings.keep));
  }

  function overview(): BackupOverview {
    return copy({
      folder: backupSettings.folder ?? MEMORY_BACKUP_FOLDER,
      defaultFolder: MEMORY_BACKUP_FOLDER,
      keep: backupSettings.keep,
      backups: backups.map((b) => b.info),
    });
  }

  function insert(fields: Omit<JobRecord, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'revision'>, number = nextNumber()) {
    const at = now();
    const record: JobRecord = { ...fields, id: crypto.randomUUID(), number, createdAt: at, updatedAt: at, revision: 0 };
    jobs.set(record.id, record);
    return record;
  }

  const client: MemoryStorageClient = {
    async listJobs() {
      const items: JobListItem[] = [...jobs.values()].map((j) => ({
        id: j.id,
        number: j.number,
        name: j.name,
        customer: j.customer,
        notes: j.notes,
        status: j.status,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
        revision: j.revision,
        cabinetCount: j.cabinets.length,
        cabinets: j.cabinets.map(({ label, type, width, height, depth, quantity }) => ({ label, type, width, height, depth, quantity })),
      }));
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number);
      return copy(items);
    },
    async getJob(id) {
      return copy(job(id));
    },
    async createJob(input) {
      const name = input.name.trim();
      if (name === '') throw invalid('A job needs a name.');
      checkMaterials(input.materials);
      checkSawProfile(input.sawProfile);
      const cabinets = input.cabinets ?? [];
      checkCabinets(cabinets);
      for (const c of cabinets) if (cabinetOwner(c.id)) throw invalid(`Cabinet ${c.label} belongs to a different job.`);
      const record = insert({
        name,
        customer: blankToNull(input.customer),
        notes: blankToNull(input.notes),
        status: 'draft',
        rules: input.construction ? { ...currentRules(), method: applyConstructionChoice(currentRules().method, input.construction) } : currentRules(),
        rulesVersion: RULES_VERSION,
        cabinets: copy(cabinets),
        materials: input.materials ? copy(input.materials) : null,
        sawProfile: input.sawProfile ? copy(input.sawProfile) : null,
      });
      return copy(record);
    },
    async duplicateJob(id) {
      const source = job(id);
      const record = insert({
        name: `${source.name} (copy)`,
        customer: source.customer,
        notes: source.notes,
        status: 'draft',
        rules: copy(source.rules),
        rulesVersion: source.rulesVersion,
        cabinets: source.cabinets.map((c) => ({ ...copy(c), id: crypto.randomUUID() })),
        materials: source.materials ? copy(source.materials) : null,
        sawProfile: source.sawProfile ? copy(source.sawProfile) : null,
      });
      return copy(record);
    },
    async updateJobFields(id, fields) {
      const record = job(id);
      record.name = fields.name;
      record.customer = blankToNull(fields.customer);
      record.notes = blankToNull(fields.notes);
      return touch(record);
    },
    async setJobStatus(id, status) {
      if (!JOB_STATUSES.includes(status)) throw invalid('That job status is unknown.');
      const record = job(id);
      record.status = status;
      return touch(record);
    },
    async deleteJob(id) {
      job(id);
      jobs.delete(id);
      pending.delete(id);
    },
    async saveJob(snapshot) {
      checkSnapshot(snapshot);
      return applySnapshot(snapshot);
    },
    async upsertCabinet(jobId, cabinet, position) {
      checkCabinet(cabinet);
      const record = job(jobId);
      const owner = cabinetOwner(cabinet.id);
      if (owner && owner !== jobId) throw invalid(`Cabinet ${cabinet.label} belongs to a different job.`);
      const list = [...record.cabinets];
      const existing = list.findIndex((c) => c.id === cabinet.id);
      if (existing >= 0) list.splice(existing, 1);
      const index =
        position !== undefined ? Math.min(Math.max(0, position), list.length) : existing >= 0 ? existing : list.length;
      list.splice(index, 0, copy(cabinet));
      record.cabinets = list;
      return touch(record);
    },
    async reorderCabinets(jobId, cabinetIds) {
      const record = job(jobId);
      const byId = new Map(record.cabinets.map((c) => [c.id, c]));
      if (new Set(cabinetIds).size !== cabinetIds.length || cabinetIds.length !== byId.size || cabinetIds.some((id) => !byId.has(id))) {
        throw invalid("The new cabinet order doesn't match the job's cabinets. Reopen the job and try again.");
      }
      record.cabinets = cabinetIds.map((id) => byId.get(id) as CabinetRecord);
      return touch(record);
    },
    async deleteCabinet(jobId, cabinetId) {
      const record = job(jobId);
      if (!record.cabinets.some((c) => c.id === cabinetId)) {
        throw new StorageError('notFound', 'That cabinet no longer exists in this job.');
      }
      record.cabinets = record.cabinets.filter((c) => c.id !== cabinetId);
      return touch(record);
    },
    async writePendingEdit(snapshot, baseRevision) {
      checkSnapshot(snapshot);
      job(snapshot.id);
      pending.set(snapshot.id, { snapshot: copy(snapshot), baseRevision });
    },
    async recoverPendingEdits() {
      const recovered: RecoveredJob[] = [];
      for (const [jobId, entry] of [...pending]) {
        try {
          const saved = applySnapshot(entry.snapshot);
          recovered.push({ jobId, jobName: entry.snapshot.name, ...saved });
        } catch (error) {
          console.error(`Couldn't recover unsaved changes for job ${jobId}`, error);
        }
      }
      return recovered;
    },
    async getShopSettings() {
      const other: Record<string, unknown> = {};
      for (const [key, value] of settings) if (key !== RULES_SETTING) other[key] = copy(value);
      return { rules: currentRules(), other };
    },
    async setShopSetting(key, value) {
      if (![RULES_SETTING, 'display', 'backups', ESTIMATE_SETTING, SAW_PROFILES_SETTING, DEFAULTS_CHECKED_SETTING].includes(key)) {
        throw invalid(`"${key}" is not a shop setting.`);
      }
      if (key === DEFAULTS_CHECKED_SETTING && typeof value !== 'boolean') throw invalid('Whether the shop defaults were checked must be true or false.');
      if (key === RULES_SETTING && (typeof value !== 'object' || value === null || Array.isArray(value))) {
        throw invalid('Construction rules must be a set of named values.');
      }
      settings.set(key, copy(value));
    },
    async saveJobLayouts(jobId, layouts) {
      checkLayouts(layouts);
      // Like the Rust repo: not an edit, so the revision stays.
      job(jobId).layouts = copy([...layouts]);
    },
    async devLoadSampleJobs() {
      const rules = currentRules();
      const added = (sampleJobsJson as unknown as SampleJob[]).map((sample) => {
        const own = sample.construction ? { ...rules, method: applyConstructionChoice(rules.method, sample.construction) } : rules;
        const taken = [...jobs.values()].some((j) => j.number === sample.number);
        return insert(
          {
            name: sample.name,
            customer: sample.customer,
            notes: sample.notes,
            status: sample.status,
            rules: copy(own),
            rulesVersion: RULES_VERSION,
            cabinets: sample.cabinets.map((c) => ({ ...c, id: crypto.randomUUID(), room: null, run: c.run ?? null })),
          },
          taken ? nextNumber() : sample.number,
        );
      });
      return copy(added);
    },
    async addExampleJob() {
      // Like the Rust one: the shop's defaults, the next number, and the run only where the method uses runs.
      const example = exampleJobJson as unknown as SampleJob;
      const rules = currentRules();
      const runs = usesRuns(rules.method);
      const added = insert({
        name: example.name,
        customer: example.customer,
        notes: example.notes,
        status: example.status,
        rules,
        rulesVersion: RULES_VERSION,
        cabinets: example.cabinets.map((c) => ({ ...c, id: crypto.randomUUID(), room: null, run: runs ? (c.run ?? null) : null })),
      });
      return copy(added);
    },
    async importJob(incoming, mode) {
      if (incoming.id.trim() === '') throw invalid('The job in this file has no id.');
      if (incoming.name.trim() === '') throw invalid('The job in this file has no name.');
      if (!Number.isInteger(incoming.number) || incoming.number <= 0) throw invalid('The job in this file has no job number.');
      if (incoming.rulesVersion < 1 || incoming.rulesVersion > RULES_VERSION) {
        throw invalid('This job was made by a newer KERFuffle. Update this PC first.');
      }
      checkSnapshot({ ...incoming, cabinets: incoming.cabinets, materials: incoming.materials ?? null, sawProfile: incoming.sawProfile ?? null });
      checkLayouts(incoming.layouts);
      const existing = jobs.get(incoming.id);
      if (mode === 'new' && existing) throw invalid('This job is already on this PC. Import it as a copy, or replace the existing one.');
      if (mode === 'replace' && !existing) throw new StorageError('notFound', 'That job no longer exists. It may have been deleted.');
      if (mode === 'replace') {
        takeBackup();
        rotate();
        jobs.delete(incoming.id);
        pending.delete(incoming.id);
      }
      const numberTaken = (n: number) => [...jobs.values()].some((j) => j.number === n);
      const number =
        mode === 'copy'
          ? nextNumber()
          : !numberTaken(incoming.number)
            ? incoming.number
            : existing && !numberTaken(existing.number)
              ? existing.number
              : nextNumber();
      const id = mode === 'copy' ? crypto.randomUUID() : incoming.id;
      const freshCabinetIds = mode === 'copy' || incoming.cabinets.some((c) => (cabinetOwner(c.id) ?? id) !== id);
      const at = now();
      const record: JobRecord = {
        ...copy(incoming),
        id,
        number,
        name: mode === 'copy' ? `${incoming.name.trim()} (copy)` : incoming.name.trim(),
        customer: blankToNull(incoming.customer),
        notes: blankToNull(incoming.notes),
        cabinets: incoming.cabinets.map((c) => ({ ...copy(c), id: freshCabinetIds ? crypto.randomUUID() : c.id })),
        materials: incoming.materials ? copy(incoming.materials) : null,
        sawProfile: incoming.sawProfile ? copy(incoming.sawProfile) : null,
        ...(mode === 'copy' ? { createdAt: at, updatedAt: at, revision: 0 } : {}),
      };
      jobs.set(id, record);
      return copy(record);
    },
    async backupOverview() {
      return overview();
    },
    async backUpNow() {
      const info = takeBackup();
      rotate();
      return info;
    },
    async runDailyBackup() {
      const today = new Date(now());
      const prefix = `kerfuffle-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}-`;
      if (jobs.size === 0 || backups.some((b) => b.info.fileName.startsWith(prefix))) return null;
      const info = takeBackup();
      rotate();
      return info;
    },
    async restoreBackup(fileName) {
      const chosen = backups.find((b) => b.info.fileName === fileName);
      if (!chosen) throw new StorageError('backup', 'That backup is no longer in the backup folder. Nothing was changed.');
      const safety = takeBackup();
      jobs.clear();
      for (const [id, record] of copy(chosen.jobs)) jobs.set(id, record);
      settings.clear();
      for (const [key, value] of copy(chosen.settings)) settings.set(key, value);
      materials = copy(chosen.materials);
      pending.clear();
      return { restored: copy(chosen.info), safety };
    },
    async setBackupSettings(next) {
      if (!Number.isInteger(next.keep) || next.keep < 1 || next.keep > 365) throw invalid('Keep between 1 and 365 backups.');
      const folder = next.folder?.trim() || null;
      backupSettings = { folder: folder === MEMORY_BACKUP_FOLDER ? null : folder, keep: next.keep };
      return overview();
    },
    async listMaterials() {
      return copy(materials);
    },
    async saveMaterial(input) {
      const m = normalizeRecord(input);
      checkMaterial(m);
      const at = now();
      const index = materials.findIndex((x) => x.id === m.id);
      const stored: MaterialRecord = { ...copy(m), createdAt: index >= 0 ? materials[index]!.createdAt : at, updatedAt: at };
      if (index >= 0) materials = materials.map((x, i) => (i === index ? stored : x));
      else materials = [...materials, stored];
      return copy(stored);
    },
    async deleteMaterial(id) {
      const users = [...jobs.values()]
        .sort((a, b) => a.number - b.number)
        .filter((j) => Object.values(j.materials?.slots ?? {}).some((s) => s?.id === id))
        .map((j) => j.name);
      if (users.length > 0) {
        const others = users.length === 1 ? '' : users.length === 2 ? ' and 1 other job' : ` and ${users.length - 1} other jobs`;
        throw invalid(`This material is used by ${users[0]}${others}, so it can't be deleted. Archive it instead.`);
      }
      const estimate = settings.get(ESTIMATE_SETTING) as { defaults?: Record<string, unknown> } | undefined;
      if (Object.values(estimate?.defaults ?? {}).includes(id)) {
        throw invalid('This material is a default for new jobs. Choose another default in Settings first, or archive it.');
      }
      if (!materials.some((m) => m.id === id)) throw invalid('That material no longer exists.');
      materials = materials.filter((m) => m.id !== id);
    },
    seed(records) {
      for (const record of records) jobs.set(record.id, copy(record));
      // A database that already has jobs has checked its defaults (migration 6).
      if (records.length > 0 && !settings.has(DEFAULTS_CHECKED_SETTING)) settings.set(DEFAULTS_CHECKED_SETTING, true);
    },
    pendingJobIds() {
      return [...pending.keys()];
    },
    failNextBackup(message) {
      nextBackupFailure = message;
    },
  };
  return client;
}

type SampleJob = Pick<JobRecord, 'number' | 'name' | 'customer' | 'notes' | 'status'> & {
  /** Absent: the shop's default construction. */
  construction?: ConstructionChoice;
  cabinets: (Omit<CabinetRecord, 'id' | 'room' | 'run'> & { run?: string })[];
};
