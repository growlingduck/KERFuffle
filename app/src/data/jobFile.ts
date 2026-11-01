import type { ValidationIssue } from '@kerfuffle/engine';
import { validateJob } from './jobSession';
import { parseRules, RULES_VERSION } from './rules';
import type { CabinetRecord, JobRecord } from './types';
import { formatJobNumber, JOB_STATUSES } from './types';

/**
 * The `.kerfjob` file: one job, moved between PCs by USB stick or email.
 *
 * A UTF-8 JSON document:
 *
 *   { format: "kerfuffle-job", formatVersion: 1, appVersion, exportedAt,
 *     job: { id, number, name, customer, notes, status, createdAt, updatedAt, revision },
 *     cabinets: [...], rules: {...}, rulesVersion, checksum }
 *
 * Sizes are integer ticks (1/64″). `checksum` is the SHA-256 (lowercase hex) of
 * the canonical JSON of the document without the checksum field: object keys
 * sorted by UTF-16 code unit, no whitespace, strings and numbers as
 * JSON.stringify writes them. The file itself is indented for people to read;
 * the indentation isn't part of the checksum.
 *
 * Reading is strict about the shape (anything a database must never hold is
 * refused) and lenient about cabinets the engine flags: those come in as they
 * are and show as needing attention, the same as in the workspace.
 */

export const JOB_FILE_FORMAT = 'kerfuffle-job';
/** Bump when the file's shape changes; older readers then refuse newer files. */
export const JOB_FILE_VERSION = 1;
export const JOB_FILE_EXTENSION = 'kerfjob';

export const NEWER_FILE_MESSAGE = 'This job was made by a newer KERFuffle. Update this PC first.';
export const NOT_A_JOB_FILE_MESSAGE = 'That file isn’t a KERFuffle job file, or it has been damaged.';
export const CHANGED_FILE_MESSAGE =
  'This job file was changed or damaged after it was exported, so it can’t be imported. Export it again on the other PC.';

const MAX_SHELVES = 1_000;
const MAX_QUANTITY = 100_000;

export interface JobFileHeader {
  appVersion: string;
  exportedAt: string;
}

export interface FlaggedCabinet {
  label: string;
  /** Engine errors: the cabinet has no parts until they're fixed. */
  messages: string[];
}

export type JobFileReading =
  | { ok: true; job: JobRecord; header: JobFileHeader; flagged: FlaggedCabinet[] }
  | { ok: false; message: string };

/** Canonical JSON (see the module comment): what the checksum covers. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The document for a job, with its checksum, as file text. */
export async function writeJobFile(job: JobRecord, header: JobFileHeader): Promise<string> {
  const body = {
    format: JOB_FILE_FORMAT,
    formatVersion: JOB_FILE_VERSION,
    appVersion: header.appVersion,
    exportedAt: header.exportedAt,
    job: {
      id: job.id,
      number: job.number,
      name: job.name,
      customer: job.customer,
      notes: job.notes,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      revision: job.revision,
    },
    cabinets: job.cabinets.map((c) => ({
      id: c.id,
      label: c.label,
      type: c.type,
      width: c.width,
      height: c.height,
      depth: c.depth,
      shelfCount: c.shelfCount,
      finishedEnds: c.finishedEnds,
      quantity: c.quantity,
      room: c.room,
    })),
    rules: job.rules,
    rulesVersion: job.rulesVersion,
  };
  const checksum = await sha256Hex(canonicalJson(body));
  return `${JSON.stringify({ ...body, checksum }, null, 2)}\n`;
}

/** `Kitchen remodel (J-0014).kerfjob`, with characters Windows won't allow in a file name replaced. */
export function jobFileName(job: Pick<JobRecord, 'name' | 'number'>): string {
  const safe = job.name
    // eslint-disable-next-line no-control-regex -- control characters are exactly what's being removed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120);
  return `${safe || 'Job'} (${formatJobNumber(job.number)}).${JOB_FILE_EXTENSION}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

class Refused extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new Refused(`${where} has no ${key}`);
  return value;
}

function optionalText(source: Record<string, unknown>, key: string, where: string): string | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Refused(`${where} has an unreadable ${key}`);
  return value;
}

function whole(source: Record<string, unknown>, key: string, where: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = source[key];
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Refused(`${where} has an impossible ${key} (${JSON.stringify(value)})`);
  }
  return value as number;
}

function oneOf<T extends string>(source: Record<string, unknown>, key: string, allowed: readonly T[], where: string): T {
  const value = source[key];
  if (!allowed.includes(value as T)) throw new Refused(`${where} has an unknown ${key} (${JSON.stringify(value)})`);
  return value as T;
}

function readCabinet(raw: unknown, index: number): CabinetRecord {
  if (!isObject(raw)) throw new Refused(`cabinet ${index + 1} is unreadable`);
  const label = typeof raw.label === 'string' ? raw.label : '';
  const where = `cabinet ${label || index + 1}`;
  const id = text(raw, 'id', where);
  if (id.trim() === '') throw new Refused(`${where} has no id`);
  return {
    id,
    label: text(raw, 'label', where),
    type: oneOf(raw, 'type', ['base', 'wall'] as const, where),
    width: whole(raw, 'width', where, 0) as CabinetRecord['width'],
    height: whole(raw, 'height', where, 0) as CabinetRecord['height'],
    depth: whole(raw, 'depth', where, 0) as CabinetRecord['depth'],
    shelfCount: whole(raw, 'shelfCount', where, 0, MAX_SHELVES),
    finishedEnds: oneOf(raw, 'finishedEnds', ['none', 'left', 'right', 'both'] as const, where),
    quantity: whole(raw, 'quantity', where, 0, MAX_QUANTITY),
    room: optionalText(raw, 'room', where),
  };
}

/**
 * Check a job file and turn it into a job record. Refuses other files, newer
 * formats, changed or damaged files and impossible values; cabinets the engine
 * flags come through, listed in `flagged`.
 */
export async function readJobFile(fileText: string): Promise<JobFileReading> {
  let doc: unknown;
  try {
    doc = JSON.parse(fileText.replace(/^FEFF/, ''));
  } catch {
    return { ok: false, message: NOT_A_JOB_FILE_MESSAGE };
  }
  if (!isObject(doc) || doc.format !== JOB_FILE_FORMAT || !Number.isSafeInteger(doc.formatVersion) || (doc.formatVersion as number) < 1) {
    return { ok: false, message: NOT_A_JOB_FILE_MESSAGE };
  }
  // A newer format may check itself differently, so this comes before the checksum.
  if ((doc.formatVersion as number) > JOB_FILE_VERSION) return { ok: false, message: NEWER_FILE_MESSAGE };

  const { checksum, ...body } = doc;
  if (typeof checksum !== 'string' || checksum.toLowerCase() !== (await sha256Hex(canonicalJson(body)))) {
    return { ok: false, message: CHANGED_FILE_MESSAGE };
  }

  try {
    if (!isObject(doc.job)) throw new Refused('the job is missing');
    if (!Array.isArray(doc.cabinets)) throw new Refused('the cabinet list is missing');
    const rulesVersion = whole(doc, 'rulesVersion', 'the file', 1);
    if (rulesVersion > RULES_VERSION) return { ok: false, message: NEWER_FILE_MESSAGE };
    let rules: JobRecord['rules'];
    try {
      rules = parseRules(doc.rules, rulesVersion);
    } catch {
      throw new Refused('its construction settings are unreadable');
    }

    const j = doc.job;
    const job: JobRecord = {
      id: text(j, 'id', 'the job'),
      number: whole(j, 'number', 'the job', 1),
      name: text(j, 'name', 'the job'),
      customer: optionalText(j, 'customer', 'the job'),
      notes: optionalText(j, 'notes', 'the job'),
      status: oneOf(j, 'status', JOB_STATUSES, 'the job'),
      rules,
      rulesVersion,
      createdAt: text(j, 'createdAt', 'the job'),
      updatedAt: text(j, 'updatedAt', 'the job'),
      revision: whole(j, 'revision', 'the job', 0),
      cabinets: doc.cabinets.map(readCabinet),
    };
    if (job.id.trim() === '') throw new Refused('the job has no id');
    if (job.name.trim() === '') throw new Refused('the job has no name');
    const ids = new Set(job.cabinets.map((c) => c.id));
    if (ids.size !== job.cabinets.length) throw new Refused('a cabinet appears twice');

    const header = { appVersion: text(doc, 'appVersion', 'the file'), exportedAt: text(doc, 'exportedAt', 'the file') };
    return { ok: true, job, header, flagged: flaggedCabinets(job) };
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return { ok: false, message: `This job file can’t be imported: ${error.message}.` };
  }
}

/** Cabinets with engine errors, in list order. */
export function flaggedCabinets(job: JobRecord): FlaggedCabinet[] {
  const issues = validateJob(job);
  return job.cabinets.flatMap((cabinet) => {
    const errors = (issues[cabinet.id] ?? []).filter((issue: ValidationIssue) => issue.severity === 'error');
    return errors.length > 0 ? [{ label: cabinet.label || 'A cabinet', messages: errors.map((issue) => issue.message) }] : [];
  });
}
