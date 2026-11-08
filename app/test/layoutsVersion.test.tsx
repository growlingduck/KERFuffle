import { DEFAULT_RULES, inches, upgradeVersion1Rules } from '@kerfuffle/engine';
import type * as EngineModule from '@kerfuffle/engine';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { cabinetSpec } from '../src/data/jobSession';
import { layoutRecords } from '../src/data/layouts';
import { BUILT_IN_ESTIMATE, defaultJobMaterials, engineMaterials, STANDARD_MATERIALS } from '../src/data/materials';
import { BUILT_IN_SAW } from '../src/data/sawProfiles';
import { layoutInputOf } from '../src/layout/jobInput';
import { testCabinet, testJob, useTestDatabase } from './storage';

/**
 * The optimizer has been updated since the job was marked Ready to cut: this
 * app's ALGORITHM_VERSION is one more than the engine that made the layout.
 */
vi.mock('@kerfuffle/engine', async (importOriginal) => {
  const real = await importOriginal<Engine>();
  const version = real.ALGORITHM_VERSION + 1;
  const layoutInput: Engine['layoutInput'] = (input, onProgress) => ({
    ...real.layoutInput(input, onProgress && ((p) => onProgress({ ...p, layout: { ...p.layout, algorithmVersion: version } }))),
    algorithmVersion: version,
  });
  return { ...real, ALGORITHM_VERSION: version, layoutInput };
});

type Engine = typeof EngineModule;

const CABINETS = [
  testCabinet('c-b1', 'B1', { width: inches(30), height: inches(36) }),
  testCabinet('c-w1', 'W1', { type: 'wall', width: inches(30), height: inches(30), depth: inches(12), shelfCount: 2 }),
];

beforeEach(() => {
  window.localStorage.clear();
});

describe('a Ready-to-cut job after the optimizer changes', () => {
  it('keeps showing, printing and counting its saved layout, says the optimizer changed, and recalculates only when asked', async () => {
    const engine = await vi.importActual<Engine>('@kerfuffle/engine');
    const MADE_BY = engine.ALGORITHM_VERSION;
    const input = layoutInputOf(
      {
        cabinets: CABINETS.map(cabinetSpec),
        rules: upgradeVersion1Rules(DEFAULT_RULES),
        materials: engineMaterials(defaultJobMaterials(STANDARD_MATERIALS, BUILT_IN_ESTIMATE, '2026-11-02T00:00:00.000Z'), STANDARD_MATERIALS),
        profile: BUILT_IN_SAW.profiles[0]!,
        includeFronts: true,
      },
      'cost',
    );
    // Made by the engine as it was: the real layout, recording the old version.
    const made = engine.layoutInput(input);
    expect(made.algorithmVersion).toBe(MADE_BY);
    const kept = layoutRecords(made, engine.materialInputKeys(input), '2026-11-01T09:00:00.000Z');
    const db = await useTestDatabase([testJob({ cabinets: CABINETS, status: 'ready', layouts: kept })]);

    window.location.hash = '#/jobs/j-0014/cut-list';
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.querySelector('[data-sheet="1"]')).not.toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Layouts' }));

    await screen.findByText(/The optimizer has been updated since this layout was saved/);
    expect(document.querySelector('[data-layout-status]')).toHaveTextContent(/^Kept with the job 2026-11-01 · Cost mode/);
    expect(document.querySelectorAll('[data-pattern-id]')).toHaveLength(kept[0]!.layout.patterns.length);
    // The printout and the estimate use the kept layout too.
    expect(document.querySelectorAll('[data-layout-page]').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Estimate' }));
    expect(document.querySelector(`[data-estimate-line="${kept[0]!.materialId}"]`)).toHaveTextContent(`${kept[0]!.layout.stats.sheets} sheetsfrom layout`);
    await user.click(screen.getByRole('tab', { name: 'Layouts' }));
    // Nothing was worked out again on its own.
    expect((await db.getJob('j-0014')).layouts).toEqual(kept);

    // Enabled once the job as it is now has been laid out.
    const recalc = () => within(document.querySelector<HTMLElement>('[data-layout-banner]')!).getByRole('button', { name: 'Recalculate' });
    await waitFor(() => expect(recalc()).not.toHaveAttribute('aria-disabled'), { timeout: 15_000 });
    await user.click(recalc());
    // The new layout is kept under the version this app has.
    await waitFor(async () => expect((await db.getJob('j-0014')).layouts?.[0]?.algorithmVersion).toBe(MADE_BY + 1));
    await waitFor(() => expect(document.querySelector('[data-layout-banner]')).toBeNull());
  }, 30_000);
});
