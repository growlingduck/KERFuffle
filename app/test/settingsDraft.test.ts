import { DEFAULT_RULES, inches } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_ESTIMATE } from '../src/data/materials';
import type { DraftAction, SettingsDraft, SettingsValues } from '../src/screens/settings/draft';
import {
  canSave,
  changedSettings,
  createDraft,
  draftReducer,
  effectLine,
  isDirty,
  REFERENCE_CABINET,
  RULE_FIELDS,
  ruleIssues,
} from '../src/screens/settings/draft';

const SAVED: SettingsValues = { rules: { ...DEFAULT_RULES }, roundTo: 16, backups: { folder: null, keep: 14 }, estimate: BUILT_IN_ESTIMATE };

function run(...actions: DraftAction[]): SettingsDraft {
  return actions.reduce(draftReducer, createDraft(SAVED));
}

describe('Settings draft', () => {
  it('shows every shop rule and none of the legacy-reproduction flags', () => {
    expect(RULE_FIELDS).toEqual([
      'panelThickness',
      'toeKickHeight',
      'countertopThickness',
      'shelfThickness',
      'wideShelfThickness',
      'shelfThickWidthThreshold',
      'shelfClearancePerSide',
      'shelfSetback',
      'laminateOversizePerEdge',
    ]);
  });

  it('tracks changes against what is saved, not against the defaults', () => {
    const draft = run({ type: 'rule', field: 'panelThickness', value: inches(23 / 32) }, { type: 'roundTo', value: 32 }, { type: 'keep', value: 30 });
    expect(changedSettings(draft)).toEqual(['panelThickness', 'roundTo', 'keep']);
    expect(canSave(draft)).toBe(true);

    // Typing the saved value back is not a change.
    const back = draftReducer(draft, { type: 'rule', field: 'panelThickness', value: inches(3 / 4) });
    expect(changedSettings(back)).toEqual(['roundTo', 'keep']);

    const discarded = draftReducer(draft, { type: 'discard' });
    expect(isDirty(discarded)).toBe(false);
    expect(discarded.generation).toBe(draft.generation + 1);
  });

  it('Reset goes back to the built-in default and refreshes only that field', () => {
    const shop = { ...SAVED, rules: { ...DEFAULT_RULES, toeKickHeight: inches(3.5) } };
    const draft = [{ type: 'reset', field: 'toeKickHeight' } as const].reduce(draftReducer, createDraft(shop));
    expect(draft.current.rules.toeKickHeight).toBe(DEFAULT_RULES.toeKickHeight);
    expect(changedSettings(draft)).toEqual(['toeKickHeight']);
    expect(draft.resets).toEqual({ toeKickHeight: 1 });
    expect(draft.generation).toBe(0);
  });

  it('an unreadable field blocks Save until it reads again or is reset', () => {
    const typing = run({ type: 'rule', field: 'shelfSetback', value: null });
    expect(typing.current.rules.shelfSetback).toBe(DEFAULT_RULES.shelfSetback);
    expect(changedSettings(typing)).toEqual(['shelfSetback']);
    expect(canSave(typing)).toBe(false);
    expect(canSave(draftReducer(typing, { type: 'rule', field: 'shelfSetback', value: inches(0) }))).toBe(true);
    expect(isDirty(draftReducer(typing, { type: 'reset', field: 'shelfSetback' }))).toBe(false);
  });

  it('checks the draft with the engine on the reference cabinet, beside the right field', () => {
    expect(REFERENCE_CABINET).toMatchObject({ type: 'base', width: inches(30), height: inches(34.5), depth: inches(24) });
    expect(ruleIssues(run())).toEqual({});

    // A rule the engine checks directly.
    const zero = run({ type: 'rule', field: 'panelThickness', value: inches(0) });
    expect(ruleIssues(zero).panelThickness?.[0]?.message).toBe('Panel thickness must be greater than zero.');
    expect(canSave(zero)).toBe(false);

    // A cabinet-size error goes to the rule that was changed to cause it.
    const tall = run({ type: 'rule', field: 'countertopThickness', value: inches(31) });
    const issues = ruleIssues(tall);
    expect(Object.keys(issues)).toEqual(['countertopThickness']);
    expect(issues.countertopThickness?.[0]?.message).toMatch(/^On a 30″ × 34 1\/2″ × 24″ base: Height must be more than toe kick plus countertop/);
    expect(canSave(tall)).toBe(false);

    // Clearance and setback accept 0.
    expect(canSave(run({ type: 'rule', field: 'shelfClearancePerSide', value: inches(0) }, { type: 'rule', field: 'shelfSetback', value: inches(0) }))).toBe(true);
  });

  it('warnings show but never block Save', () => {
    const draft = run({ type: 'rule', field: 'panelThickness', value: inches(23 / 32) });
    expect(ruleIssues(draft).shelfThickness?.[0]?.severity).toBe('warning');
    expect(canSave(draft)).toBe(true);
  });

  it('keeps between 1 and 365 backups', () => {
    expect(canSave(run({ type: 'keep', value: 0 }))).toBe(false);
    expect(canSave(run({ type: 'keep', value: 366 }))).toBe(false);
    expect(canSave(run({ type: 'keep', value: 365 }))).toBe(true);
  });

  it('computes every effect line with the engine', () => {
    const { rules } = SAVED;
    expect(effectLine('panel', rules, 16)).toBe('30″ cabinet → bottom 28 1/2″ long');
    expect(effectLine('toeKick', rules, 16)).toBe('34 1/2″ base → box height 29″');
    expect(effectLine('countertop', rules, 16)).toBe('34 1/2″ base → box height 29″');
    expect(effectLine('clearance', rules, 16)).toBe('30″ cabinet → shelf 28 1/4″ long');
    expect(effectLine('setback', rules, 16)).toBe('24″ deep → shelf 23 1/8″ wide');
    expect(effectLine('laminate', rules, 16)).toBe('30″ × 29″ face → laminate 32″ × 31″');
    expect(effectLine('wide', rules, 16)).toBe('36″ cabinet → 1″ shelves · 35 3/4″ → 3/4″');

    const draft = run(
      { type: 'rule', field: 'panelThickness', value: inches(1) },
      { type: 'comparison', value: 'gt' },
      { type: 'rule', field: 'shelfClearancePerSide', value: inches(0) },
    );
    expect(effectLine('panel', draft.current.rules, 16)).toBe('30″ cabinet → bottom 28″ long');
    expect(effectLine('clearance', draft.current.rules, 16)).toBe('30″ cabinet → shelf 28″ long');
    expect(effectLine('wide', draft.current.rules, 16)).toBe('36 1/4″ cabinet → 1″ shelves · 36″ → 3/4″');

    // Rules that don't calculate have no effect to show.
    expect(effectLine('panel', { ...rules, panelThickness: inches(20) }, 16)).toBeNull();
  });
});
