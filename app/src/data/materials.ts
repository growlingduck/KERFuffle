import { DEFAULT_ESTIMATE_OPTIONS, JOB_SLOTS, SLOT_INFO, ticks } from '@kerfuffle/engine';
import type { EstimateOptions, JobMaterials, JobSlot, Material, MaterialGrain, MaterialKind } from '@kerfuffle/engine';
import standardMaterialsJson from '../../src-tauri/src/db/standard_materials.json';
import type { JobMaterialsRecord, JobRecord, MaterialRecord, MaterialSnapshot } from './types';

/**
 * Materials as the app handles them: the catalog, the shop's estimate
 * settings, and each job's copy of the materials it uses
 * (docs/plan-methods-optimizer-costing.md §3). The engine sees plain
 * `Material`s; everything here turns records into those.
 */

export const MATERIAL_KINDS: readonly MaterialKind[] = ['sheet', 'laminate', 'banding', 'hardware'];

export const KIND_NAMES: Readonly<Record<MaterialKind, { one: string; many: string }>> = {
  sheet: { one: 'Sheet goods', many: 'Sheet goods' },
  laminate: { one: 'Laminate', many: 'Laminate' },
  banding: { one: 'Edge banding', many: 'Edge banding' },
  hardware: { one: 'Hardware', many: 'Hardware' },
};

export const GRAIN_NAMES: Readonly<Record<MaterialGrain, string>> = { none: 'None', length: 'Along length' };

type StandardMaterial = Partial<Material> & Pick<Material, 'id' | 'kind' | 'name'>;

/** A material with every field the kind doesn't use left empty, like the database stores it. */
export function normalizeMaterial<T extends Material>(m: T): T {
  const sheet = m.kind === 'sheet';
  const sized = sheet || m.kind === 'laminate';
  const blank = (text: string | null | undefined) => (text == null || text.trim() === '' ? null : text);
  const out = {
    ...m,
    name: m.name.trim(),
    thickness: sheet ? m.thickness : null,
    length: sized ? m.length : null,
    width: sized ? m.width : null,
    grain: sized ? m.grain : 'none',
    bandingWidth: m.kind === 'banding' ? m.bandingWidth : null,
    rollFeet: m.kind === 'banding' ? m.rollFeet : null,
    unit: m.kind === 'hardware' ? blank(m.unit) : null,
  };
  return out;
}

/** A catalog record as the database stores it: kind fields only, blank text as none. */
export function normalizeRecord(m: MaterialRecord): MaterialRecord {
  const blank = (text: string | null) => (text == null || text.trim() === '' ? null : text);
  return { ...normalizeMaterial(m), supplier: blank(m.supplier), sku: blank(m.sku), notes: blank(m.notes) };
}

const EMPTY: Omit<MaterialRecord, 'id' | 'kind' | 'name'> = {
  thickness: null,
  length: null,
  width: null,
  grain: 'none',
  bandingWidth: null,
  rollFeet: null,
  unit: null,
  price: null,
  onHand: null,
  supplier: null,
  sku: null,
  notes: null,
  archived: false,
  createdAt: '',
  updatedAt: '',
};

/** A blank material of a kind, for the Add material form. */
export function blankMaterial(kind: MaterialKind, id: string): MaterialRecord {
  return { ...EMPTY, id, kind, name: '', grain: kind === 'sheet' || kind === 'laminate' ? 'length' : 'none', unit: kind === 'hardware' ? 'each' : null };
}

/** The catalog a new database starts with (app/src-tauri/src/db/standard_materials.json), without prices. */
export const STANDARD_MATERIALS: readonly MaterialRecord[] = (standardMaterialsJson as StandardMaterial[]).map((m) =>
  normalizeMaterial({ ...EMPTY, ...m }),
);

/** Ids of the standard materials, for the built-in defaults. */
const STD = {
  birch34: 'std-birch-3-4',
  birch14: 'std-birch-1-4',
  ply1: 'std-plywood-1',
  hpl: 'std-hpl-48x96',
  banding: 'std-pvc-banding-15-16',
  leg: 'std-leveling-leg',
  clip: 'std-kick-clip',
} as const;

export interface EstimateSettings extends EstimateOptions {
  /** The material each slot starts with in a new job, by catalog id. */
  defaults: Partial<Record<JobSlot, string>>;
}

export const BUILT_IN_ESTIMATE: Readonly<EstimateSettings> = Object.freeze({
  ...DEFAULT_ESTIMATE_OPTIONS,
  defaults: Object.freeze({
    box: STD.birch34,
    back: STD.birch34,
    shelves: STD.birch34,
    'wide-shelves': STD.ply1,
    base: STD.birch34,
    'kick-face': STD.birch14,
    laminate: STD.hpl,
    'edge-banding': STD.banding,
    'leveling-leg': STD.leg,
    'kick-clip': STD.clip,
  }),
});

export const MAX_WASTE_PERCENT = 100;

/** Read the stored estimate setting; anything missing or unreadable is the built-in value. */
export function parseEstimateSettings(raw: unknown): EstimateSettings {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const waste = source.wastePercent;
  const trim = source.edgeTrim;
  const defaults: Partial<Record<JobSlot, string>> = { ...BUILT_IN_ESTIMATE.defaults };
  if (typeof source.defaults === 'object' && source.defaults !== null) {
    for (const [slot, id] of Object.entries(source.defaults as Record<string, unknown>)) {
      if (!(JOB_SLOTS as readonly string[]).includes(slot)) continue;
      if (typeof id === 'string' && id !== '') defaults[slot as JobSlot] = id;
      else if (id === null) delete defaults[slot as JobSlot];
    }
  }
  return {
    wastePercent: Number.isInteger(waste) && (waste as number) >= 0 && (waste as number) <= MAX_WASTE_PERCENT ? (waste as number) : BUILT_IN_ESTIMATE.wastePercent,
    edgeTrim: Number.isSafeInteger(trim) && (trim as number) >= 0 ? ticks(trim as number) : BUILT_IN_ESTIMATE.edgeTrim,
    defaults,
  };
}

/** The setting as stored. A slot set to no material is stored as null, so the built-in default doesn't come back. */
export function estimateSettingValue(settings: EstimateSettings): Record<string, unknown> {
  const defaults: Record<string, string | null> = {};
  for (const slot of JOB_SLOTS) defaults[slot] = settings.defaults[slot] ?? null;
  return { wastePercent: settings.wastePercent, edgeTrim: settings.edgeTrim, defaults };
}

/** A job's copy of a catalog material. */
export function snapshotMaterial(record: Material, at: string): MaterialSnapshot {
  // On hand is the shop's stock, not part of the copy.
  const rest = normalizeMaterial(record);
  const copy: MaterialSnapshot = {
    id: rest.id,
    kind: rest.kind,
    name: rest.name,
    thickness: rest.thickness,
    length: rest.length,
    width: rest.width,
    grain: rest.grain,
    bandingWidth: rest.bandingWidth,
    rollFeet: rest.rollFeet,
    unit: rest.unit,
    price: rest.price,
    pricedAt: at,
  };
  return copy;
}

/** The shop defaults for a new job, from what's in the catalog now. Archived or missing defaults are left empty. */
export function defaultJobMaterials(catalog: readonly MaterialRecord[], settings: EstimateSettings, at: string): JobMaterialsRecord {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const slots: JobMaterialsRecord['slots'] = {};
  for (const slot of JOB_SLOTS) {
    const id = settings.defaults[slot];
    const found = id ? byId.get(id) : undefined;
    if (found && !found.archived && found.kind === SLOT_INFO[slot].kind) slots[slot] = snapshotMaterial(found, at);
  }
  return { slots };
}

/** The job's materials, or the shop defaults for a job made before materials. */
export function effectiveJobMaterials(
  job: Pick<JobRecord, 'materials'>,
  catalog: readonly MaterialRecord[],
  settings: EstimateSettings,
  at: string,
): JobMaterialsRecord {
  return job.materials ?? defaultJobMaterials(catalog, settings, at);
}

/** What the engine reads: the job's copies, with this shop's stock on hand. */
export function engineMaterials(record: JobMaterialsRecord, catalog: readonly MaterialRecord[]): JobMaterials {
  const stock = new Map(catalog.map((m) => [m.id, m.onHand]));
  const out: Partial<Record<JobSlot, Material>> = {};
  for (const [slot, snap] of Object.entries(record.slots) as [JobSlot, MaterialSnapshot][]) {
    const material: Material & { pricedAt?: string } = { ...snap, onHand: stock.get(snap.id) ?? null };
    delete material.pricedAt;
    out[slot] = material;
  }
  return out;
}

/** Choose a material for one slot (or none), copying it now. */
export function withSlotMaterial(record: JobMaterialsRecord, slot: JobSlot, material: Material | null, at: string): JobMaterialsRecord {
  const slots = { ...record.slots };
  if (material) slots[slot] = snapshotMaterial(material, at);
  else delete slots[slot];
  return { slots };
}

/** The oldest price copy among these slots: "prices as of …". Null when none are used. */
export function pricesAsOf(record: JobMaterialsRecord, slots: readonly JobSlot[]): string | null {
  const dates = slots.map((s) => record.slots[s]?.pricedAt).filter((d): d is string => typeof d === 'string' && d !== '');
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

export interface PriceChange {
  slot: JobSlot;
  /** The material's catalog id: several slots can share one material. */
  id: string;
  name: string;
  from: number | null;
  to: number | null;
}

/** Slots (among `slots`) whose catalog price differs from the job's copy. Materials not in this catalog are skipped. */
export function priceChanges(record: JobMaterialsRecord, catalog: readonly MaterialRecord[], slots: readonly JobSlot[]): PriceChange[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const changes: PriceChange[] = [];
  for (const slot of slots) {
    const snap = record.slots[slot];
    const now = snap ? byId.get(snap.id) : undefined;
    if (snap && now && now.price !== snap.price) changes.push({ slot, id: snap.id, name: snap.name, from: snap.price, to: now.price });
  }
  return changes;
}

/** How many materials (not slots) have a new price. */
export function changedMaterialCount(changes: readonly PriceChange[]): number {
  return new Set(changes.map((c) => c.id)).size;
}

/** Update prices: every listed slot takes the catalog's current price, stamped now. Nothing else changes. */
export function withCurrentPrices(record: JobMaterialsRecord, catalog: readonly MaterialRecord[], slots: readonly JobSlot[], at: string): JobMaterialsRecord {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const next = { ...record.slots };
  for (const slot of slots) {
    const snap = next[slot];
    const now = snap ? byId.get(snap.id) : undefined;
    if (snap && now) next[slot] = { ...snap, price: now.price, pricedAt: at };
  }
  return { slots: next };
}

/** Jobs from the database and from .kerfjob files: an object of slots, each a material copy. Anything else is refused. */
export function parseJobMaterials(raw: unknown): JobMaterialsRecord | null {
  if (raw === null || raw === undefined) return null;
  const slots = (raw as { slots?: unknown }).slots;
  if (typeof raw !== 'object' || typeof slots !== 'object' || slots === null || Array.isArray(slots)) {
    throw new Error('the materials are unreadable');
  }
  const out: JobMaterialsRecord['slots'] = {};
  for (const [slot, value] of Object.entries(slots as Record<string, unknown>)) {
    if (!(JOB_SLOTS as readonly string[]).includes(slot)) continue;
    const m = value as Partial<MaterialSnapshot> | null;
    const okSize = (v: unknown) => v === null || v === undefined || (Number.isSafeInteger(v) && (v as number) > 0);
    const valid =
      typeof m === 'object' &&
      m !== null &&
      typeof m.id === 'string' &&
      m.id !== '' &&
      typeof m.name === 'string' &&
      MATERIAL_KINDS.includes(m.kind as MaterialKind) &&
      [m.thickness, m.length, m.width, m.bandingWidth, m.rollFeet].every(okSize) &&
      (m.price === null || m.price === undefined || (Number.isSafeInteger(m.price) && m.price >= 0));
    if (!valid) throw new Error(`the ${slot} material is unreadable`);
    out[slot as JobSlot] = {
      id: m.id!,
      kind: m.kind!,
      name: m.name!,
      thickness: (m.thickness ?? null),
      length: (m.length ?? null),
      width: (m.width ?? null),
      grain: m.grain === 'length' ? 'length' : 'none',
      bandingWidth: (m.bandingWidth ?? null),
      rollFeet: m.rollFeet ?? null,
      unit: typeof m.unit === 'string' ? m.unit : null,
      price: m.price ?? null,
      pricedAt: typeof m.pricedAt === 'string' ? m.pricedAt : '',
    };
  }
  return { slots: out };
}

/** Catalog materials a slot can use: its kind, not archived (the job's current one is always kept in the list). */
export function choicesFor(slot: JobSlot, catalog: readonly MaterialRecord[], current: string | null = null): MaterialRecord[] {
  const kind = SLOT_INFO[slot].kind;
  return catalog.filter((m) => m.kind === kind && (!m.archived || m.id === current));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "$1,234.50". */
export function formatMoney(cents: number): string {
  return DOLLARS.format(cents / 100);
}

export type MoneyParse = { ok: true; cents: number | null } | { ok: false; message: string };

/** "68", "$68.00", "1,234.5" → cents. Blank → null (needs a price). */
export function parseMoney(text: string): MoneyParse {
  const clean = text.replace(/[$,\s]/g, '');
  if (clean === '') return { ok: true, cents: null };
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(clean)) return { ok: false, message: 'Type a price like 68.00' };
  const cents = Math.round(Number(clean) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) return { ok: false, message: 'That price is too large' };
  return { ok: true, cents };
}

/** "68.00" for an input field; "" for no price. */
export function moneyInput(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

/** What a price is per: "per sheet", "per foot", "per roll", "each". */
export function priceUnit(m: Pick<Material, 'kind' | 'rollFeet' | 'unit'>): string {
  if (m.kind === 'sheet' || m.kind === 'laminate') return 'per sheet';
  if (m.kind === 'banding') return m.rollFeet ? `per ${m.rollFeet} ft roll` : 'per foot';
  const unit = m.unit?.trim() || 'each';
  return unit === 'each' ? 'each' : `per ${unit}`;
}
