import { DEFAULT_RULES, inches, upgradeVersion1Rules } from '@kerfuffle/engine';
import { setStorageClient } from '../src/data/client';
import { createMemoryClient } from '../src/data/memoryClient';
import type { MemoryStorageClient } from '../src/data/memoryClient';
import { jobSession, refreshJobList } from '../src/data/storage';
import { loadMaterials } from '../src/state/materials';
import { loadSawProfiles } from '../src/state/sawProfiles';
import { setLayoutWorkers } from '../src/layout/runner';
import type { CabinetRecord, JobRecord } from '../src/data/types';

export function testCabinet(id: string, label: string, overrides: Partial<CabinetRecord> = {}): CabinetRecord {
  return {
    id,
    label,
    type: 'base',
    width: inches(30),
    height: inches(34.5),
    depth: inches(24),
    shelfCount: 1,
    finishedEnds: 'none',
    quantity: 1,
    room: null,
    ...overrides,
  };
}

export function testJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'j-0014',
    number: 14,
    name: 'Kitchen remodel',
    customer: '[Customer name]',
    notes: null,
    status: 'draft',
    // A job saved before construction methods, as the app reads it now.
    rules: upgradeVersion1Rules(DEFAULT_RULES),
    rulesVersion: 1,
    createdAt: '2026-10-30T09:00:00.000Z',
    updatedAt: '2026-10-31T09:41:00.000Z',
    revision: 3,
    cabinets: [testCabinet('c-b1', 'B1')],
    // Made before materials: it uses the shop defaults until one is chosen.
    materials: null,
    sawProfile: null,
    ...overrides,
  };
}

/** Layout workers that never answer: the estimate stays area-based, the Layouts tab says "Laying out…" (tests). */
export function quietLayouts(): void {
  setLayoutWorkers(() => ({ onmessage: null, onerror: null, postMessage: () => {}, terminate: () => {} }));
}

/** A fresh in-memory database holding the Kitchen remodel job (id j-0014), loaded into the app. */
export async function useTestDatabase(jobs: JobRecord[] = [testJob()]): Promise<MemoryStorageClient> {
  await jobSession.close();
  // Fresh layout runners, with the worker's code run in this thread.
  setLayoutWorkers(null);
  const client = createMemoryClient();
  client.seed(jobs);
  setStorageClient(client);
  await refreshJobList();
  // A fresh catalog (the standard materials) and saw profiles (the built-in ones) for every test.
  await loadMaterials();
  await loadSawProfiles();
  return client;
}
