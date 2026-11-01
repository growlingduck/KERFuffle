import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../src/components/Button';
import { Dialog } from '../src/components/Dialog';
import { DimensionLine, HatchDefs, labelFits, useHatchIds } from '../src/components/drawing';
import { IconButton } from '../src/components/IconButton';
import { Menu } from '../src/components/Menu';
import { Segmented } from '../src/components/Segmented';
import { Stepper } from '../src/components/Stepper';
import { Switch } from '../src/components/Switch';
import { Toast, TOAST_DURATION_MS, ToastHost } from '../src/components/Toast';
import { Tooltip, TOOLTIP_DELAY_MS } from '../src/components/Tooltip';
import { showToast } from '../src/state/toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Button', () => {
  it('stays focusable when disabled, ignores clicks and explains why', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled disabledReason="Nothing to undo" onClick={onClick}>
        Undo
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks busy work with aria-busy and blocks clicks', () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Saving…
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Tooltip', () => {
  it('waits 400 ms of hover intent before showing', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Change job status">
        <button type="button">Status</button>
      </Tooltip>,
    );
    fireEvent.pointerEnter(screen.getByRole('button').parentElement!);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Change job status');
    fireEvent.pointerLeave(screen.getByRole('button').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows on keyboard focus, describes its trigger, and Esc hides it', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Door / front-laminate size" describe>
        <button type="button">REF</button>
      </Tooltip>,
    );
    await user.tab();
    const tip = await screen.findByRole('tooltip', {}, { timeout: TOOLTIP_DELAY_MS * 3 });
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', tip.id);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('IconButton', () => {
  it('always has an accessible name', () => {
    render(
      <IconButton label="Duplicate B1">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Duplicate B1' })).toBeInTheDocument();
  });
});

describe('Menu', () => {
  function StatusMenu({ onSelect }: { onSelect: (id: string) => void }) {
    return (
      <>
        <Menu
          label="Job status"
          items={[
            { id: 'draft', label: 'Draft', checked: true, onSelect: () => onSelect('draft') },
            { id: 'ready', label: 'Ready to cut', checked: false, onSelect: () => onSelect('ready') },
            { id: 'done', label: 'Completed', checked: false, disabled: true, onSelect: () => onSelect('done') },
            { id: 'archived', label: 'Archived', checked: false, onSelect: () => onSelect('archived') },
          ]}
          trigger={(props) => (
            <button type="button" {...props}>
              Status
            </button>
          )}
        />
        <button type="button">outside</button>
      </>
    );
  }

  it('opens on the checked item, moves with arrows past disabled items, and chooses with Enter', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<StatusMenu onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'Status' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Draft' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Ready to cut' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Archived' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Draft' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('archived');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<StatusMenu onSelect={() => undefined} />);
    const trigger = screen.getByRole('button', { name: 'Status' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    render(<StatusMenu onSelect={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens from the keyboard with ↓', async () => {
    const user = userEvent.setup();
    render(<StatusMenu onSelect={() => undefined} />);
    screen.getByRole('button', { name: 'Status' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Draft' })).toHaveFocus();
  });
});

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          New job
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="New job"
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              Create
            </button>
          }
        >
          <label>
            Job name <input />
          </label>
        </Dialog>
      </>
    );
  }

  it('focuses the first field, traps Tab, closes on Esc and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'New job' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'New job' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const name = screen.getByRole('textbox', { name: 'Job name' });
    expect(name).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe('Toast', () => {
  it('dismisses itself after 6 s and pauses while hovered', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Removed B3" action={{ label: 'Undo', run: () => undefined }} onDismiss={onDismiss} />);
    const toast = screen.getByText('Removed B3').parentElement!;

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 2000 - 10);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('runs its single action and closes', async () => {
    const run = vi.fn();
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Toast message="Removed B3" action={{ label: 'Undo', run }} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(run).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('shows at most one toast: a new one replaces the old', () => {
    render(<ToastHost />);
    act(() => {
      showToast('First');
      showToast('Second');
    });
    const host = screen.getByRole('status');
    expect(host).toHaveTextContent('Second');
    expect(host).not.toHaveTextContent('First');
  });
});

describe('Segmented, Switch, Stepper', () => {
  it('Segmented options are toggle buttons with aria-pressed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Segmented
        label="Cabinet type"
        options={[
          { value: 'base', label: 'Base' },
          { value: 'wall', label: 'Wall' },
        ]}
        value="base"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Cabinet type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Base' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Wall' }));
    expect(onChange).toHaveBeenCalledWith('wall');
  });

  it('Switch toggles from its label', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Switch checked={false} onChange={onChange}>
        Include fronts
      </Switch>,
    );
    const sw = screen.getByRole('switch', { name: 'Include fronts' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByText('Include fronts'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Stepper disables − at the minimum and steps once per click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Stepper label="Quantity" value={1} min={1} onChange={onChange} decrementLabel="Build one fewer" incrementLabel="Build one more" />);
    const minus = screen.getByRole('button', { name: 'Build one fewer' });
    expect(minus).toHaveAttribute('aria-disabled', 'true');
    await user.click(minus);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Build one more' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
    await user.click(screen.getByRole('spinbutton', { name: 'Quantity' }));
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});

describe('Drawing primitives', () => {
  it('moves a label beside a segment too short for it', () => {
    expect(labelFits('3/4″', 20)).toBe(false);
    expect(labelFits('23 3/4″', 200)).toBe(true);
    const { container } = render(
      <svg>
        <DimensionLine x1={0} y1={50} x2={20} y2={50} label="3/4″" />
        <DimensionLine x1={0} y1={90} x2={200} y2={90} label="23 3/4″" />
      </svg>,
    );
    const [short, long] = [...container.querySelectorAll('text')];
    expect(Number(short!.getAttribute('x'))).toBeGreaterThan(20);
    expect(Number(long!.getAttribute('x'))).toBe(100);
  });

  it('gives each drawing its own hatch pattern ids', () => {
    function Drawing() {
      const ids = useHatchIds();
      return (
        <svg>
          <HatchDefs ids={ids} />
        </svg>
      );
    }
    const { container } = render(
      <>
        <Drawing />
        <Drawing />
      </>,
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('marks traced and faded state and exposes pointer and click handlers', () => {
    const onClick = vi.fn();
    const onPointerEnter = vi.fn();
    const { container } = render(
      <svg>
        <DimensionLine x1={0} y1={50} x2={200} y2={50} label="24″" traced onClick={onClick} onPointerEnter={onPointerEnter} />
        <DimensionLine x1={0} y1={90} x2={200} y2={90} label="12″" faded />
      </svg>,
    );
    const [traced, faded] = [...container.querySelectorAll('svg > g')];
    expect(traced).toHaveAttribute('data-traced', 'true');
    expect(faded).toHaveAttribute('data-faded', 'true');
    fireEvent.pointerEnter(traced!);
    fireEvent.click(traced!);
    expect(onPointerEnter).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
