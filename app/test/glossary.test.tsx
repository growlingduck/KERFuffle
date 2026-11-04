import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { InfoTip, SymbolMark } from '../src/components/InfoTip';
import { TOOLTIP_DELAY_MS } from '../src/components/Tooltip';
import { loadShopSettings } from '../src/data/storage';
import { DISPLAY_SETTING } from '../src/data/types';
import { GLOSSARY, isGlossaryKey, SYMBOLS } from '../src/lib/glossary';
import { setDisplaySettings } from '../src/state/display';
import { testJob, useTestDatabase } from './storage';

const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Every glossary key the screens name: `term="run"`, `info="boxHeight"`,
 * `term: 'kerf'` in a row table, and the last item of the rule tuples
 * (`[label, value, 'nailer']`) in the Construction sections.
 */
function keysUsedInSource(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (key: string, file: string) => used.set(key, [...(used.get(key) ?? []), file]);
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith('glossary.ts')) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:term|info)(?:=|:\s*)["'](\w+)["']/g)) add(m[1]!, file);
    if (/[\\/](construction\.ts|Editor\.tsx)$/.test(file)) {
      for (const m of text.matchAll(/,\s*'(\w+)'\]/g)) if (/[A-Z]/.test(m[1]!) || isGlossaryKey(m[1]!)) add(m[1]!, file);
    }
  }
  return used;
}

describe('glossary', () => {
  it('every glossary key used in the UI exists', () => {
    const used = keysUsedInSource();
    const missing = [...used].filter(([key]) => !isGlossaryKey(key)).map(([key, files]) => `${key} (${files.join(', ')})`);
    expect(missing).toEqual([]);
    // The scan really found the info tips, not nothing.
    for (const key of ['run', 'finishedEnds', 'boxHeight', 'constructionMethod', 'sawProfile', 'kerf', 'laminate', 'ladderBase', 'nailer']) {
      expect(used.has(key), key).toBe(true);
    }
  });

  it('every entry says what the term is in one or two sentences', () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term, key).not.toBe('');
      const sentences = entry.text.split(/(?<=[.!?])\s+(?=[A-Z])/);
      expect(sentences.length, `${key}: ${entry.text}`).toBeLessThanOrEqual(2);
    }
  });

  it('lists the three symbols', () => {
    expect(Object.values(SYMBOLS).map((s) => [s.glyph, s.label])).toEqual([
      ['△', 'Warning'],
      ['◆', 'Differs from shop defaults'],
      ['⚠', 'Needs a fix'],
    ]);
  });
});

describe('InfoTip', () => {
  it('is a button announced as "About {term}", described by the entry', () => {
    render(<InfoTip term="run" />);
    const button = screen.getByRole('button', { name: 'About Run' });
    expect(button).toHaveAccessibleDescription(GLOSSARY.run.text);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the entry on hover, after the tooltip delay', () => {
    vi.useFakeTimers();
    render(<InfoTip term="kerf" />);
    const wrap = screen.getByRole('button', { name: 'About Kerf' }).parentElement!;
    fireEvent.pointerEnter(wrap);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(GLOSSARY.kerf.text);
    fireEvent.pointerLeave(wrap);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the entry on keyboard focus, and Esc hides it', async () => {
    const user = userEvent.setup();
    render(<InfoTip term="shelfSetback" />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'About Shelf setback' })).toHaveFocus();
    expect(await screen.findByRole('tooltip', {}, { timeout: TOOLTIP_DELAY_MS * 3 })).toHaveTextContent(GLOSSARY.shelfSetback.text);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('SymbolMark', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the symbol and shows the name on hover', () => {
    vi.useFakeTimers();
    render(<SymbolMark symbol="differs" />);
    const mark = screen.getByRole('img', { name: 'Differs from shop defaults' });
    expect(mark).toHaveTextContent('◆');
    fireEvent.pointerEnter(mark.parentElement!);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Differs from shop defaults');
  });

  it('is hidden from screen readers when words beside it already say it', () => {
    const { container } = render(<SymbolMark symbol="needsFix" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container).toHaveTextContent('⚠');
  });
});

describe('the workspace explains its terms', () => {
  beforeEach(async () => {
    await useTestDatabase();
    await loadShopSettings();
  });

  it('has an info tip beside Height, Finished ends, every Construction rule and the method', async () => {
    window.location.hash = '#/jobs/j-0014/workspace';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument());
    for (const name of ['About Height, overall', 'About Finished ends', 'About Panel thickness', 'About Shelf clearance', 'About Laminate oversize', 'About Construction method']) {
      // The method's tip also explains a pre-methods job's "Base: not on the cut list" row.
      expect(screen.getAllByRole('button', { name }).length, name).toBeGreaterThan(0);
    }
    // Every tip on the screen reads from the glossary.
    const keys = [...document.querySelectorAll('[data-glossary]')].map((el) => el.getAttribute('data-glossary')!);
    expect(keys.length).toBeGreaterThan(8);
    expect(keys.filter((k) => !isGlossaryKey(k))).toEqual([]);
  });
});

describe('the tracing hint', () => {
  const HINT = 'Point at any size or rule to see what it changes in the drawing.';
  const hint = () => screen.queryByText(HINT);

  beforeEach(() => {
    // As at startup, before the shop settings are read.
    setDisplaySettings({ roundTo: 16, tracingHintDismissed: true });
  });

  it('shows once on a fresh profile, and never again after it is dismissed', async () => {
    const db = await useTestDatabase([testJob(), testJob({ id: 'j-0015', number: 15, name: 'Second job' })]);
    await loadShopSettings();
    window.location.hash = '#/jobs/j-0014/workspace';
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await act(async () => {});
    expect(hint()).toBeInTheDocument();
    // The existing footnote stays.
    expect(screen.getByText(/Point at a rule to see what it moves\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
    expect(hint()).toBeNull();
    await waitFor(async () => expect((await db.getShopSettings()).other[DISPLAY_SETTING]).toEqual({ roundTo: 16, tracingHintDismissed: true }));

    // Another job: not shown, because it's once per PC, not per job.
    window.location.hash = '#/jobs/j-0015/workspace';
    await act(async () => {});
    expect(screen.getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument();
    expect(hint()).toBeNull();

    // After a restart.
    unmount();
    setDisplaySettings({ roundTo: 16, tracingHintDismissed: true });
    await loadShopSettings();
    window.location.hash = '#/jobs/j-0014/workspace';
    render(<App />);
    await act(async () => {});
    expect(within(document.body).getByRole('heading', { name: /^Cabinet / })).toBeInTheDocument();
    expect(hint()).toBeNull();
  });

  it('stays dismissed when Settings saves the rounding', async () => {
    const db = await useTestDatabase();
    await db.setShopSetting(DISPLAY_SETTING, { roundTo: 16, tracingHintDismissed: true });
    await loadShopSettings();
    window.location.hash = '#/settings';
    const user = userEvent.setup();
    render(<App />);
    await act(async () => {});
    await user.click(await screen.findByRole('radio', { name: '1/8″' }));
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(async () => expect((await db.getShopSettings()).other[DISPLAY_SETTING]).toEqual({ roundTo: 8, tracingHintDismissed: true }));
  });
});
