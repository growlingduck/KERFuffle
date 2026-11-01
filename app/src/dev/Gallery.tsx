import { useState } from 'react';
import type { ReactNode } from 'react';
import { inches } from '@kerfuffle/engine';
import type { Ticks } from '@kerfuffle/engine';
import { Button } from '../components/Button';
import { DimensionInput } from '../components/DimensionInput';
import { Dialog } from '../components/Dialog';
import {
  Balloon,
  Centerline,
  ChainDimension,
  DimensionLine,
  HatchDefs,
  HatchRect,
  SectionMark,
  useHatchIds,
} from '../components/drawing';
import { IconButton } from '../components/IconButton';
import { DuplicateIcon, PlusIcon, TrashIcon, UndoIcon } from '../components/icons';
import { Kbd, KeyCombo } from '../components/Kbd';
import { Menu } from '../components/Menu';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { SplitButton } from '../components/SplitButton';
import { Stamp } from '../components/Stamp';
import { Stepper } from '../components/Stepper';
import { Switch } from '../components/Switch';
import { TitleBlock } from '../components/TitleBlock';
import { Toast } from '../components/Toast';
import { Tooltip } from '../components/Tooltip';
import { ViewTitle } from '../components/ViewTitle';
import { useShortcutScope } from '../keyboard/shortcuts';
import { displayInches } from '../lib/dimensions';
import { showToast } from '../state/toast';
import styles from './Gallery.module.css';

const STATES = ['Rest', 'Hover', 'Focus', 'Pressed', 'Disabled', 'Invalid', 'Busy'] as const;
type State = (typeof STATES)[number];

const noop = () => undefined;

/** One component, one row of states. A missing state renders as "n/a". */
function StateRow({ name, children }: { name: string; children: Partial<Record<State, ReactNode>> }) {
  return (
    <tr>
      <th scope="row" className={styles.rowHead}>
        {name}
      </th>
      {STATES.map((state) => (
        <td key={state} className={styles.cell}>
          {children[state] ?? <span className={styles.na}>n/a</span>}
        </td>
      ))}
    </tr>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <Sheet aria-labelledby={id} className={styles.section}>
      <ViewTitle id={id} title={title} {...(sub ? { sub } : {})} />
      <div className={styles.sectionBody}>{children}</div>
    </Sheet>
  );
}

const PRESETS = [
  {
    type: 'group' as const,
    id: 'base',
    label: 'Base cabinets',
    items: [12, 18, 24].map((w) => ({ id: `b${w}`, label: `${w}″ base`, hint: `${w} × 34 1/2 × 24`, onSelect: noop })),
  },
  {
    type: 'group' as const,
    id: 'wall',
    label: 'Wall cabinets',
    items: [12, 18, 24].map((w) => ({ id: `w${w}`, label: `${w}″ wall`, hint: `${w} × 30 × 12`, onSelect: noop })),
  },
];

function DrawingDemo() {
  const hatch = useHatchIds();
  const [hot, setHot] = useState<string | null>(null);
  const trace = (key: string) => ({
    traced: hot === key,
    faded: hot !== null && hot !== key,
    onPointerEnter: () => setHot(key),
    onPointerLeave: () => setHot(null),
  });

  // A 24″ × 34 1/2″ base cabinet at 1:8 (1″ = 4 px), plus a section.
  const s = 4;
  const ox = 40;
  const oy = 40;
  const W = 24 * s;
  const H = 34.5 * s;
  const ctop = 1.5 * s;
  const toe = 4 * s;
  const bot = oy + H;
  const sx = ox + W + 150;
  const D = 24 * s;
  const p = 0.75 * s;

  return (
    <svg viewBox="0 0 470 260" role="img" aria-label="Sample drawing: a 24 inch wide, 34 1/2 inch high base cabinet in elevation and section" className={styles.drawing}>
      <HatchDefs ids={hatch} />
      {/* Elevation */}
      <rect x={ox} y={oy} width={W} height={ctop} className={styles.countertop} />
      <HatchRect ids={hatch} hatch="light" x={ox + p} y={oy + ctop + p} width={W - 2 * p} height={H - ctop - toe - 2 * p} />
      <rect x={ox} y={oy + ctop} width={W} height={H - ctop - toe} className={styles.box} />
      <rect x={ox + 3 * s} y={bot - toe} width={W - 6 * s} height={toe} className={styles.toe} />
      <Centerline x1={ox + W / 2} y1={oy - 22} x2={ox + W / 2} y2={bot + 10} {...trace('cl')} />
      <SectionMark x={ox + W / 2 - 6} y={oy - 14} letter="B" {...trace('cut')} />
      <DimensionLine x1={ox} y1={bot + 24} x2={ox + W} y2={bot + 24} extendFrom={bot} label={displayInches(inches(24))} {...trace('w')} />
      <ChainDimension
        orientation="vertical"
        at={ox + W + 22}
        stops={[oy, oy + ctop, bot - toe, bot]}
        extendFrom={ox + W}
        segments={[
          { id: 'ctop', label: displayInches(inches(1.5)), ...trace('ctop') },
          { id: 'box', label: displayInches(inches(29)), ...trace('box') },
          { id: 'toe', label: displayInches(inches(4)), ...trace('toe') },
        ]}
        overall={{ at: ox + W + 92, label: displayInches(inches(34.5)), ...trace('h') }}
      />
      {/* Section */}
      <HatchRect ids={hatch} x={sx} y={oy + ctop} width={D - p} height={p} {...trace('top')} />
      <HatchRect ids={hatch} x={sx} y={bot - toe - p} width={D - p} height={p} {...trace('bottom')} />
      <HatchRect ids={hatch} x={sx + D - p} y={oy + ctop} width={p} height={H - ctop - toe} {...trace('back')} />
      <HatchRect ids={hatch} x={sx + 0.125 * s} y={oy + ctop + 14 * s} width={D - p - 0.125 * s} height={p} {...trace('shelf')} />
      <DimensionLine x1={sx} y1={bot + 24} x2={sx + D} y2={bot + 24} extendFrom={bot} label={displayInches(inches(24))} {...trace('d')} />
      <Balloon cx={sx + D + 26} cy={oy + ctop + 14 * s} label={7} {...trace('shelf')} />
      <Balloon cx={sx + D + 26} cy={oy + 20} label={1} {...trace('back')} />
    </svg>
  );
}

/** Every shared component in every state. Development builds only (#/dev/gallery). */
export default function Gallery() {
  useShortcutScope('fields');
  const [segment, setSegment] = useState<'base' | 'wall'>('base');
  const [on, setOn] = useState(true);
  const [shelves, setShelves] = useState(2);
  const [width, setWidth] = useState<Ticks>(inches(23.75));
  const [live, setLive] = useState<Ticks | null>(inches(23.75));
  const [commits, setCommits] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [traced, setTraced] = useState(false);

  const dim = inches(23.75);
  const type = [
    { value: 'base' as const, label: 'Base' },
    { value: 'wall' as const, label: 'Wall' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Component gallery</h1>
      <p className={styles.lead}>
        Development only. Hover, focus and pressed states are forced with <code>data-force</code>; the live examples underneath each table
        respond normally.
      </p>

      <Section id="g-buttons" title="Buttons" sub="Button · IconButton · SplitButton">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Component</th>
              {STATES.map((s) => (
                <th key={s} scope="col">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <StateRow name="Button">
              {{
                Rest: <Button>Import job…</Button>,
                Hover: <Button data-force="hover">Import job…</Button>,
                Focus: <Button data-force="focus">Import job…</Button>,
                Pressed: <Button data-force="active">Import job…</Button>,
                Disabled: (
                  <Button disabled disabledReason="Nothing to undo">
                    Undo
                  </Button>
                ),
                Busy: <Button busy>Back up now</Button>,
              }}
            </StateRow>
            <StateRow name="Button, primary">
              {{
                Rest: (
                  <Button variant="primary" size="lg">
                    New job
                  </Button>
                ),
                Hover: (
                  <Button variant="primary" size="lg" data-force="hover">
                    New job
                  </Button>
                ),
                Focus: (
                  <Button variant="primary" size="lg" data-force="focus">
                    New job
                  </Button>
                ),
                Pressed: (
                  <Button variant="primary" size="lg" data-force="active">
                    New job
                  </Button>
                ),
                Disabled: (
                  <Button variant="primary" size="lg" disabled disabledReason="Fix the width first">
                    Save
                  </Button>
                ),
                Busy: (
                  <Button variant="primary" size="lg" busy>
                    Saving…
                  </Button>
                ),
              }}
            </StateRow>
            <StateRow name="IconButton">
              {{
                Rest: (
                  <IconButton label="Duplicate B1">
                    <DuplicateIcon />
                  </IconButton>
                ),
                Hover: (
                  <IconButton label="Duplicate B1, hover" data-force="hover">
                    <DuplicateIcon />
                  </IconButton>
                ),
                Focus: (
                  <IconButton label="Duplicate B1, focus" data-force="focus">
                    <DuplicateIcon />
                  </IconButton>
                ),
                Pressed: (
                  <IconButton label="Duplicate B1, pressed" data-force="active">
                    <DuplicateIcon />
                  </IconButton>
                ),
                Disabled: (
                  <IconButton label="Remove B1" disabled disabledReason="You can't remove the last cabinet">
                    <TrashIcon />
                  </IconButton>
                ),
                Busy: (
                  <IconButton label="Undo, busy" busy>
                    <UndoIcon />
                  </IconButton>
                ),
              }}
            </StateRow>
            <StateRow name="SplitButton">
              {{
                Rest: (
                  <SplitButton icon={<PlusIcon />} onClick={noop} menuLabel="Add from a preset size" items={PRESETS}>
                    Add cabinet
                  </SplitButton>
                ),
                Hover: (
                  <SplitButton icon={<PlusIcon />} onClick={noop} menuLabel="Add from a preset size, hover" items={PRESETS} data-force="hover">
                    Add cabinet
                  </SplitButton>
                ),
                Focus: (
                  <SplitButton icon={<PlusIcon />} onClick={noop} menuLabel="Add from a preset size, focus" items={PRESETS} data-force="focus">
                    Add cabinet
                  </SplitButton>
                ),
                Pressed: (
                  <SplitButton icon={<PlusIcon />} onClick={noop} menuLabel="Add from a preset size, pressed" items={PRESETS} data-force="active">
                    Add cabinet
                  </SplitButton>
                ),
                Disabled: (
                  <SplitButton
                    icon={<PlusIcon />}
                    onClick={noop}
                    menuLabel="Add from a preset size, disabled"
                    items={PRESETS}
                    disabled
                    disabledReason="Fix the open cabinet first"
                  >
                    Add cabinet
                  </SplitButton>
                ),
              }}
            </StateRow>
          </tbody>
        </table>
        <div className={styles.live}>
          <Button onClick={() => showToast('Removed B3', { label: 'Undo', run: () => showToast('Restored B3') })}>Show a toast with Undo</Button>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <div className={styles.menuDemo}>
            <SplitButton icon={<PlusIcon />} onClick={() => showToast('Added B4')} menuLabel="Add from a preset size (live)" items={PRESETS}>
              Add cabinet (live)
            </SplitButton>
          </div>
        </div>
      </Section>

      <Section id="g-toggles" title="Toggles" sub="Segmented · Switch">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Component</th>
              {STATES.map((s) => (
                <th key={s} scope="col">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <StateRow name="Segmented">
              {{
                Rest: <Segmented label="Cabinet type, rest" options={type} value="base" onChange={noop} />,
                Hover: <Segmented label="Cabinet type, hover" options={type} value="wall" onChange={noop} data-force="hover" />,
                Focus: <Segmented label="Cabinet type, focus" options={type} value="wall" onChange={noop} data-force="focus" />,
                Pressed: <Segmented label="Cabinet type, pressed" options={type} value="wall" onChange={noop} data-force="active" />,
                Disabled: (
                  <Segmented
                    label="Units"
                    options={[
                      { value: 'in', label: 'Inches' },
                      { value: 'mm', label: 'mm', disabled: true },
                    ]}
                    value="in"
                    onChange={noop}
                  />
                ),
              }}
            </StateRow>
            <StateRow name="Switch">
              {{
                Rest: (
                  <Switch checked={false} onChange={noop}>
                    Include fronts
                  </Switch>
                ),
                Hover: (
                  <Switch checked onChange={noop} data-force="hover">
                    Include fronts
                  </Switch>
                ),
                Focus: (
                  <Switch checked onChange={noop} data-force="focus">
                    Include fronts
                  </Switch>
                ),
                Pressed: (
                  <Switch checked onChange={noop} data-force="active">
                    Include fronts
                  </Switch>
                ),
                Disabled: (
                  <Switch checked={false} onChange={noop} disabled>
                    Millimetres
                  </Switch>
                ),
              }}
            </StateRow>
          </tbody>
        </table>
        <div className={styles.live}>
          <Segmented label="Cabinet type (live)" options={type} value={segment} onChange={setSegment} />
          <Switch checked={on} onChange={setOn}>
            Include fronts (door / laminate size)
          </Switch>
        </div>
      </Section>

      <Section id="g-fields" title="Fields" sub="DimensionInput · Stepper">
        <div className={styles.fieldGrid}>
          <DimensionInput label="Width, rest" symbol="W" value={dim} onCommit={noop} />
          <DimensionInput label="Width, hover" symbol="W" value={dim} onCommit={noop} data-force="hover" />
          <DimensionInput label="Width, focus" symbol="W" value={dim} onCommit={noop} data-force="focus" />
          <DimensionInput label="Width, traced" symbol="W" value={dim} onCommit={noop} traced />
          <DimensionInput label="Width, invalid" symbol="W" value={inches(1)} onCommit={noop} error="Too narrow for two 3/4″ sides and shelf clearance" />
          <DimensionInput label="Depth, warning" symbol="D" value={inches(36)} onCommit={noop} warning="Unusually deep. Double-check it." />
          <DimensionInput label="Height, disabled" symbol="H" value={inches(34.5)} onCommit={noop} disabled />
          <DimensionInput label="Height, busy" symbol="H" value={inches(34.5)} onCommit={noop} busy />
          <Stepper label="Shelves, rest" symbol="n" value={2} onChange={noop} decrementLabel="One fewer shelf" incrementLabel="One more shelf" />
          <Stepper
            label="Shelves, hover"
            symbol="n"
            value={2}
            onChange={noop}
            decrementLabel="One fewer shelf (hover)"
            incrementLabel="One more shelf (hover)"
            data-force="hover"
          />
          <Stepper
            label="Quantity, at minimum"
            symbol="×"
            value={1}
            min={1}
            onChange={noop}
            decrementLabel="Build one fewer"
            incrementLabel="Build one more"
            minReason="A cabinet is built at least once"
          />
          <Stepper label="Quantity, disabled" symbol="×" value={1} min={1} onChange={noop} decrementLabel="Build one fewer (disabled)" incrementLabel="Build one more (disabled)" disabled />
        </div>
        <div className={styles.live}>
          <div className={styles.liveField}>
            <DimensionInput
              label="Width (live)"
              symbol="W"
              value={width}
              traced={traced}
              onLiveChange={setLive}
              onCommit={(v) => {
                setWidth(v);
                setCommits((n) => n + 1);
              }}
              warning={live !== null && live > inches(60) ? 'Unusually wide. Double-check it.' : null}
            />
          </div>
          <div className={styles.liveField}>
            <Stepper label="Shelves (live)" symbol="n" value={shelves} onChange={setShelves} decrementLabel="One fewer shelf (live)" incrementLabel="One more shelf (live)" minReason="No shelves already" />
          </div>
          <div className={styles.readout}>
            <div>
              Live: <span className="mono">{live === null ? '—' : displayInches(live, 64)}</span>
            </div>
            <div>
              Committed: <span className="mono">{displayInches(width, 64)}</span> · {commits} commit{commits === 1 ? '' : 's'}
            </div>
            <Switch checked={traced} onChange={setTraced}>
              Trace width
            </Switch>
          </div>
        </div>
      </Section>

      <Section id="g-overlays" title="Overlays" sub="Tooltip · Menu · Toast · Dialog">
        <div className={styles.overlays}>
          <div className={styles.overlayDemo}>
            <Tooltip content="Undo: Change width on B1" forceOpen placement="bottom">
              <Button>Tooltip (forced)</Button>
            </Tooltip>
          </div>
          <div className={styles.overlayDemo}>
            <Tooltip content="Shows after 400 ms, and on keyboard focus">
              <Button>Tooltip (live)</Button>
            </Tooltip>
          </div>
          <div className={styles.overlayDemo} style={{ minHeight: 230 }}>
            <Menu
              label="Job status (open)"
              defaultOpen
              items={[
                { id: 'draft', label: <Stamp status="draft" flat />, checked: true, hint: 'Current', onSelect: noop },
                { id: 'ready', label: <Stamp status="ready" flat />, checked: false, onSelect: noop },
                { id: 'completed', label: <Stamp status="completed" flat />, checked: false, onSelect: noop },
                { id: 'sep', type: 'separator' },
                { id: 'archived', label: <Stamp status="archived" flat />, checked: false, disabled: true, onSelect: noop },
              ]}
              trigger={(props) => (
                <Button {...props}>
                  Menu (open)
                </Button>
              )}
            />
          </div>
          <div className={styles.overlayDemo}>
            <div className={styles.toastStatic}>
              <Toast message="Removed B3" action={{ label: 'Undo', run: noop }} onDismiss={noop} persistent />
            </div>
          </div>
        </div>
      </Section>

      <Section id="g-motifs" title="Drafting motifs" sub="Sheet · ViewTitle · TitleBlock · Stamp · Kbd">
        <div className={styles.motifs}>
          <Sheet as="div" padding="sm">
            <ViewTitle mark="1" title="Cabinets" sub="5 cabinets · 9′-0″ run" level={3} />
          </Sheet>
          <Sheet as="div" padding="sm" selected>
            <ViewTitle mark="A" title="Front elevation" sub="selected sheet" level={3} size="sm" />
          </Sheet>
          <div className={styles.stamps}>
            <Stamp status="draft" />
            <Stamp status="ready" />
            <Stamp status="completed" />
            <Stamp status="archived" />
            <Stamp status="ready" flat />
          </div>
          <div className={styles.stamps}>
            <Kbd>?</Kbd>
            <KeyCombo keys={['Ctrl', 'Shift', 'Z']} />
            <KeyCombo keys={['Alt', '↑']} />
          </div>
        </div>
        <TitleBlock
          className={styles.titleBlock}
          cells={[
            { label: 'Job', value: 'Kitchen remodel', span: 2 },
            { label: 'No.', value: 'J-0014' },
            { label: 'Customer', value: '[Customer name]', span: 2 },
            { label: 'Status', value: <Stamp status="draft" flat /> },
            { label: 'Printed', value: 'Oct 31, 2026' },
            { label: 'Scale', value: 'N.T.S.' },
            { label: 'Revision', value: '△3' },
            { label: 'Cut by', value: '' },
            { label: 'Checked by', value: '' },
            { label: 'Sheet', value: '1 / 2' },
          ]}
        />
      </Section>

      <Section id="g-drawing" title="Drawing primitives" sub="Point at a dimension, part, balloon or mark to trace it">
        <DrawingDemo />
        <svg viewBox="0 0 470 60" role="img" aria-label="A dimension too short for its label, with the label moved beside the line" className={styles.drawing}>
          <DimensionLine x1={40} y1={30} x2={60} y2={30} extendFrom={10} label={displayInches(inches(0.75))} />
          <DimensionLine x1={200} y1={30} x2={330} y2={30} extendFrom={10} label={displayInches(inches(23 + 49 / 64))} traced />
        </svg>
      </Section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New job"
        sub="Construction copied from shop defaults"
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setDialogOpen(false);
                showToast('Created Kitchen remodel', { label: 'Open', run: noop });
              }}
            >
              Create job
            </Button>
          </>
        }
      >
        <DimensionInput label="Sample width" symbol="W" value={dim} onCommit={noop} />
      </Dialog>
    </div>
  );
}
