import { DEFAULT_RULES, inches } from '@kerfuffle/engine';
import type { ConstructionRules } from '@kerfuffle/engine';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { Result } from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { loadShopSettings } from '../src/data/storage';
import Gallery from '../src/dev/Gallery';
import { testCabinet, testJob, useTestDatabase } from './storage';

/** Serious and critical axe violations only (interaction-design §10). */
async function seriousViolations(root: Element): Promise<Result[]> {
  // jsdom can't render, so axe can't measure contrast; test/contrast.test.ts checks the token pairs instead.
  const results = await axe.run(root, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } });
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

function describeViolations(violations: Result[]): string {
  return violations.map((v) => `${v.impact} ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`).join('\n');
}

// axe takes a couple of seconds per screen alone, and several times that while the whole suite runs in parallel.
describe('accessibility (axe)', { timeout: 20_000 }, () => {
  beforeEach(async () => {
    await useTestDatabase();
  });

  it('the component gallery has no serious or critical violations', async () => {
    const { container } = render(<Gallery />);
    const violations = await seriousViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('the cut list’s Layouts tab, laid out, with a piece pinned, has no serious or critical violations', async () => {
    window.location.hash = '#/jobs/j-0014/cut-list';
    const user = userEvent.setup();
    const { container } = render(<App />);
    await act(async () => {});
    await user.click(screen.getByRole('button', { name: 'Layouts' }));
    await waitFor(() => expect(document.querySelector('[data-layout-status]')?.textContent).not.toMatch(/Laying out|Searching/), { timeout: 15_000 });
    await user.click(within(document.querySelector<HTMLElement>('[data-pattern-id]')!).getAllByRole('button')[0]!);
    const violations = await seriousViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it.each(['#/jobs', '#/jobs/j-0014/workspace', '#/jobs/j-0014/cut-list', '#/settings'])('%s has no serious or critical violations', async (hash) => {
    window.location.hash = hash;
    const { container } = render(<App />);
    await act(async () => {});
    const violations = await seriousViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('the cut list’s empty states (no cabinets, no materials, no saw profile) have no serious or critical violations', async () => {
    await useTestDatabase([testJob({ cabinets: [], materials: { slots: {} }, sawProfile: null })]);
    window.location.hash = '#/jobs/j-0014/cut-list';
    const user = userEvent.setup();
    const { container } = render(<App />);
    await act(async () => {});
    expect(document.querySelector('[data-notice="no-cabinets"]')).not.toBeNull();
    for (const view of ['Cut list', 'Layouts', 'Estimate']) {
      await user.click(screen.getByRole('button', { name: view }));
      const violations = await seriousViolations(container);
      expect(violations, `${view}:\n${describeViolations(violations)}`).toEqual([]);
    }
  });

  it('the workspace with Cut list →, a cabinet needing a fix, and the status menu open has no serious or critical violations', async () => {
    await useTestDatabase([testJob({ cabinets: [testCabinet('c-b1', 'B1'), testCabinet('c-b2', 'B2', { height: inches(2) })] })]);
    window.location.hash = '#/jobs/j-0014/workspace';
    const user = userEvent.setup();
    const { container } = render(<App />);
    await act(async () => {});
    expect(screen.getByText('1 cabinet needs a fix')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Job status/ }));
    expect(screen.getByRole('menuitemradio', { name: 'Ready to cut' })).toHaveAccessibleDescription('Locks construction');
    const violations = await seriousViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('the workspace with the tracing hint and the Construction rules’ info tips has no serious or critical violations', async () => {
    await loadShopSettings(); // a fresh profile: the hint shows
    window.location.hash = '#/jobs/j-0014/workspace';
    const user = userEvent.setup();
    const { container } = render(<App />);
    await act(async () => {});
    expect(screen.getByText('Point at any size or rule to see what it changes in the drawing.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Construction/ }));
    // A tip open from the keyboard, too.
    screen.getByRole('button', { name: 'About Panel thickness' }).focus();
    const violations = await seriousViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  describe('Jobs screen', () => {
    beforeEach(async () => {
      window.location.hash = '#/jobs';
      await useTestDatabase([
        testJob(),
        testJob({ id: 'j-0009', number: 9, name: 'Office storage', status: 'archived', cabinets: [testCabinet('c-o1', 'B1', { width: inches(0) })] }),
      ]);
    });

    it('has no serious or critical violations with a row menu open', async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await act(async () => {});
      await user.click(screen.getByRole('button', { name: 'More actions for Kitchen remodel' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    it('has no serious or critical violations with the New job dialog open, including its error', async () => {
      const user = userEvent.setup();
      render(<App />);
      await act(async () => {});
      await user.click(screen.getByRole('button', { name: 'New job' }));
      await user.click(screen.getByRole('button', { name: 'Create and open' }));
      expect(screen.getByRole('dialog', { name: 'New job' })).toBeInTheDocument();
      const violations = await seriousViolations(document.body);
      expect(violations, describeViolations(violations)).toEqual([]);

      // And with construction opened by Change….
      await user.click(await screen.findByRole('button', { name: 'Change…' }));
      expect(screen.getByRole('group', { name: 'Construction' })).toBeInTheDocument();
      const open = await seriousViolations(document.body);
      expect(open, describeViolations(open)).toEqual([]);
    });

    it('has no serious or critical violations in the empty and archived views', async () => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      await act(async () => {});
      await user.click(screen.getByRole('button', { name: /^Archived/ }));
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'nothing like this');
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
  describe('Workspace', () => {
    /** Not a React hook, despite the name. */
    const seedDatabase = useTestDatabase;
    const open = async () => {
      await seedDatabase([
        testJob({
          cabinets: [
            testCabinet('c-b1', 'B1', { height: inches(36), finishedEnds: 'left' }),
            testCabinet('c-b2', 'B2', { height: inches(0) }),
            testCabinet('c-w1', 'W1', { type: 'wall', height: inches(30), depth: inches(12) }),
          ],
        }),
      ]);
      window.location.hash = '#/jobs/j-0014/workspace';
      const user = userEvent.setup();
      const view = render(<App />);
      await screen.findByRole('heading', { name: 'Cabinet B1' });
      return { user, ...view };
    };

    it.each([
      ['the status menu', 'Job status'],
      ['the Add cabinet preset menu', 'Add from a preset size'],
    ])('has no serious or critical violations with %s open', async (_name, trigger) => {
      const { user, container } = await open();
      await user.click(screen.getByRole('button', { name: new RegExp(trigger) }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    it('has no serious or critical violations while tracing, with revision marks and Construction open', async () => {
      const { user, container } = await open();
      await user.click(screen.getByRole('button', { name: /^Construction/ }));
      await user.click(screen.getByRole('button', { name: 'Oversize' }));
      const width = screen.getByLabelText(/^Width/, { selector: 'input' });
      await user.clear(width);
      await user.type(width, '32{Enter}');
      await user.hover(width);
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    it('has no serious or critical violations in a job with no cabinets', async () => {
      await seedDatabase([testJob({ cabinets: [] })]);
      window.location.hash = '#/jobs/j-0014/workspace';
      const { container } = render(<App />);
      await screen.findByRole('button', { name: 'Add base cabinet' });
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });

    it('has no serious or critical violations on an invalid cabinet', async () => {
      const { user, container } = await open();
      await user.click(screen.getByRole('button', { name: /^B2/ }));
      expect(screen.getByRole('button', { name: 'Go to height' })).toBeInTheDocument();
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
    describe('construction', () => {
      const openWith = async (rules: ConstructionRules, status: 'draft' | 'ready' = 'draft') => {
        await seedDatabase([
          testJob({
            rules,
            rulesVersion: 2,
            status,
            cabinets: [
              testCabinet('c-b1', 'B1', { height: inches(36), finishedEnds: 'left', run: 'Sink wall' }),
              testCabinet('c-b2', 'B2', { height: inches(36), run: 'Sink wall' }),
              testCabinet('c-b3', 'B3', { height: inches(36) }),
              testCabinet('c-w1', 'W1', { type: 'wall', height: inches(30), depth: inches(12) }),
            ],
          }),
        ]);
        window.location.hash = '#/jobs/j-0014/workspace';
        const user = userEvent.setup();
        const view = render(<App />);
        await screen.findByRole('heading', { name: 'Cabinet B1' });
        return { user, ...view };
      };

      it('has no serious or critical violations with the run field, the list grouped by run and a run’s base traced', async () => {
        const { user, container } = await openWith(DEFAULT_RULES);
        expect(screen.getByLabelText('Run')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Group by run' }));
        await user.click(screen.getByRole('button', { name: /^Construction/ }));
        await user.hover(screen.getByLabelText(/^Width/, { selector: 'input' }));
        const violations = await seriousViolations(container);
        expect(violations, describeViolations(violations)).toEqual([]);
      });

      it('has no serious or critical violations with the Change construction dialog open', async () => {
        const { user } = await openWith(DEFAULT_RULES);
        await user.click(screen.getByRole('button', { name: /^Construction/ }));
        await user.click(screen.getByRole('button', { name: 'Change…' }));
        await user.click(screen.getByRole('radio', { name: 'Frameless with integral toe kick' }));
        const violations = await seriousViolations(document.body);
        expect(violations, describeViolations(violations)).toEqual([]);
      });

      it.each([
        ['method B', { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, id: 'B' } }],
        ['legs, an inset back and stretchers', { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, baseType: 'legs', backType: 'dado', baseTop: 'stretchers' } }],
      ] as [string, ConstructionRules][])('has no serious or critical violations drawing %s', async (_name, rules) => {
        const { container } = await openWith(rules);
        const violations = await seriousViolations(container);
        expect(violations, describeViolations(violations)).toEqual([]);
      });

      it('has no serious or critical violations with the construction locked', async () => {
        const { user, container } = await openWith(DEFAULT_RULES, 'ready');
        await user.click(screen.getByRole('button', { name: /^Construction/ }));
        const violations = await seriousViolations(container);
        expect(violations, describeViolations(violations)).toEqual([]);
      });
    });
  });

  describe('Settings: construction', () => {
    it('has no serious or critical violations with every construction setting showing, and an error', async () => {
      await useTestDatabase();
      window.location.hash = '#/settings';
      const user = userEvent.setup();
      const { container } = render(<App />);
      await screen.findByRole('heading', { name: 'Construction defaults' });
      await user.click(screen.getByRole('radio', { name: 'Frameless on leveling legs' }));
      await user.click(screen.getByRole('radio', { name: 'Inset in a dado' }));
      await user.click(screen.getByRole('radio', { name: 'Two stretchers' }));
      const kick = screen.getByLabelText(/^Kick depth/, { selector: 'input' });
      await user.clear(kick);
      await user.type(kick, '30');
      expect(screen.getByRole('img', { name: /^Detail J: Toe kick/ })).toBeInTheDocument();
      const violations = await seriousViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});
