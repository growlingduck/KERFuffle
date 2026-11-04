import { inches } from '@kerfuffle/engine';
import type { Ticks } from '@kerfuffle/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DimensionInput } from '../src/components/DimensionInput';
import type { DimensionInputProps } from '../src/components/DimensionInput';

function setup(props: Partial<DimensionInputProps> = {}) {
  const onCommit = vi.fn<(v: Ticks) => void>();
  const onLiveChange = vi.fn<(v: Ticks | null) => void>();
  const user = userEvent.setup();
  const utils = render(
    <>
      <DimensionInput label="Width" symbol="W" value={inches(23.75)} onCommit={onCommit} onLiveChange={onLiveChange} {...props} />
      <button type="button">elsewhere</button>
    </>,
  );
  const input = screen.getByRole('textbox', { name: /width/i });
  const message = () => document.getElementById(input.getAttribute('aria-describedby') ?? '')!;
  return { ...utils, user, input, message, onCommit, onLiveChange };
}

/** A parent that owns the value, like the workspace will. */
function Controlled({ onCommit }: { onCommit: (v: Ticks) => void }) {
  const [value, setValue] = useState(inches(23.75));
  return (
    <>
      <DimensionInput
        label="Width"
        value={value}
        onCommit={(v) => {
          setValue(v);
          onCommit(v);
        }}
      />
      <button type="button" onClick={() => setValue(inches(30))}>
        external
      </button>
    </>
  );
}

describe('DimensionInput: parsing feedback', () => {
  it('shows the canonical value and no message at rest', () => {
    const { input, message } = setup();
    expect(input).toHaveValue('23 3/4');
    expect(message()).toHaveTextContent(/^$/);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows the focused hint with the read-back and nudge help', async () => {
    const { user, input, message } = setup();
    await user.click(input);
    expect(message()).toHaveTextContent('Reads as 23 3/4″ · ↑↓ nudges 1/16″');
  });

  it('reads back the canonical form after blur when the typed form differs', async () => {
    const { user, input, message } = setup();
    await user.clear(input);
    await user.type(input, '23.75');
    expect(message()).toHaveTextContent('Reads as 23 3/4″ · ↑↓ nudges 1/16″');
    await user.tab();
    expect(input).toHaveValue('23.75');
    expect(message()).toHaveTextContent('Reads as 23 3/4″');
    expect(message()).not.toHaveTextContent('nudges');
  });

  it.each([
    ['23', 23 * 64],
    ['.75', 48],
    ['23-3/4', 23.75 * 64],
    ['3/4', 48],
    ['23 3/4"', 23.75 * 64],
    ['23 3/4″', 23.75 * 64],
  ])('accepts %s', async (typed, expected) => {
    const { user, input, onLiveChange } = setup();
    await user.clear(input);
    await user.type(input, typed);
    expect(onLiveChange).toHaveBeenLastCalledWith(expected);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks unparseable text as an error, linked with aria-describedby', async () => {
    const { user, input, message, onLiveChange } = setup();
    await user.clear(input);
    await user.type(input, '23 3/');
    expect(onLiveChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(message()).toHaveTextContent('⚠ Error: Type inches, like 23 3/4, 23-3/4 or 23.75.');
    expect(input).toHaveAccessibleDescription('Error: Type inches, like 23 3/4, 23-3/4 or 23.75.');
  });

  it('puts a more specific problem in front of the examples', async () => {
    const { user, input, message } = setup();
    await user.clear(input);
    await user.type(input, '23 3/0');
    expect(message()).toHaveTextContent('⚠ Error: The bottom of a fraction cannot be zero. Type inches, like 23 3/4, 23-3/4 or 23.75.');
  });

  it('shows an error whole while typing, laid over what is below, and as one line again after', async () => {
    const { user, input, message } = setup();
    await user.clear(input);
    await user.type(input, '23 3/');
    expect(message().className).toMatch(/msgOpen/);
    await user.tab();
    expect(message().className).not.toMatch(/msgOpen/);
  });

  it('mentions Shift for 1″ steps while focused', async () => {
    const { user, input, message } = setup();
    await user.click(input);
    expect(message()).toHaveTextContent('Reads as 23 3/4″ · ↑↓ nudges 1/16″, Shift+↑↓ 1″');
  });

  it('shows an outside validation error', () => {
    const { input, message } = setup({ error: 'Too narrow for two 3/4″ sides' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(message()).toHaveTextContent('⚠ Error: Too narrow for two 3/4″ sides');
  });

  it('shows a warning without marking the field invalid', () => {
    const { input, message } = setup({ warning: 'Unusually deep. Double-check it.' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(message()).toHaveTextContent('△ Warning: Unusually deep. Double-check it.');
  });

  it('keeps the message line in the DOM in every state (fixed height, no shift)', async () => {
    const { user, input, message } = setup();
    const line = message();
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'abc');
    expect(message()).toBe(line);
  });
});

describe('DimensionInput: nudging', () => {
  it('↑ / ↓ move by 1/16″', async () => {
    const { user, input, onLiveChange } = setup();
    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('23 13/16');
    expect(onLiveChange).toHaveBeenLastCalledWith(inches(23 + 13 / 16));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveValue('23 11/16');
  });

  it('Shift+↑ / Shift+↓ move by 1″', async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(input).toHaveValue('24 3/4');
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(input).toHaveValue('22 3/4');
  });

  it('stays exact to 1/64″', async () => {
    const { user, input } = setup({ value: inches(23 + 1 / 64) });
    expect(input).toHaveValue('23 1/64');
    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('23 5/64');
  });

  it('stops at zero', async () => {
    const { user, input } = setup({ value: inches(1 / 32) });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('0');
  });

  it('does nothing while the text does not parse', async () => {
    const { user, input } = setup();
    await user.clear(input);
    await user.type(input, 'abc{ArrowUp}');
    expect(input).toHaveValue('abc');
  });
});

describe('DimensionInput: Enter and Esc', () => {
  it('Enter commits and blurs', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.type(input, '24{Enter}');
    expect(onCommit).toHaveBeenCalledWith(inches(24));
    expect(input).not.toHaveFocus();
  });

  it('Esc reverts to the value the field had when focused, without committing', async () => {
    const { user, input, onCommit, onLiveChange } = setup();
    await user.click(input);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    await user.type(input, '9');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('23 3/4');
    expect(input).toHaveFocus();
    expect(onLiveChange).toHaveBeenLastCalledWith(inches(23.75));
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Esc reverts to what was typed before this focus, not to the original prop', async () => {
    const { user, input } = setup();
    await user.clear(input);
    await user.type(input, '23.75');
    await user.tab();
    await user.click(input);
    await user.type(input, '1');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('23.75');
  });

  it('lets Esc through when there is nothing to revert', async () => {
    const onKeyDown = vi.fn<(key: string) => void>();
    const user = userEvent.setup();
    render(
      <div onKeyDown={(e) => onKeyDown(e.key)}>
        <DimensionInput label="Width" value={inches(10)} onCommit={() => undefined} />
      </div>,
    );
    await user.click(screen.getByRole('textbox'));
    await user.keyboard('{Escape}');
    expect(onKeyDown).toHaveBeenCalledWith('Escape');
  });
});

describe('DimensionInput: onCommit fires once per real change', () => {
  it('fires once for Enter followed by the blur it causes', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.type(input, '30{Enter}');
    await user.click(input);
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(inches(30));
  });

  it('does not fire on keystrokes, only on blur', async () => {
    const { user, input, onCommit, onLiveChange } = setup();
    await user.clear(input);
    await user.type(input, '31');
    expect(onLiveChange).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not fire when focus comes and goes without a change', async () => {
    const { user, input, onCommit } = setup();
    await user.click(input);
    await user.tab();
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not fire when the text changes but the value does not', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.type(input, '23.75');
    await user.tab();
    await user.click(input);
    await user.keyboard('{ArrowUp}{ArrowDown}');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not fire for invalid text', async () => {
    const { user, input, onCommit } = setup();
    await user.clear(input);
    await user.type(input, 'abc');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('fires once per commit across several edits', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onCommit={onCommit} />);
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{ArrowUp}{Enter}');
    await user.click(input);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    await user.tab();
    await user.click(input);
    await user.tab();
    expect(onCommit.mock.calls).toEqual([[inches(23 + 13 / 16)], [inches(24 + 13 / 16)]]);
  });
});

describe('DimensionInput: outside changes', () => {
  it('takes a new value from outside (undo, another control) when not focused', async () => {
    const user = userEvent.setup();
    render(<Controlled onCommit={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'external' }));
    expect(screen.getByRole('textbox')).toHaveValue('30');
  });

  it('shows the traced ring and solid symbol chip', () => {
    const { input, container } = setup({ traced: true });
    expect(input.className).toMatch(/traced/);
    expect(container.querySelector('[class*="symOn"]')).toHaveTextContent('W');
  });
});
