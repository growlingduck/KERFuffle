import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DIMENSION_EXAMPLES } from '@kerfuffle/engine';
import { Button } from '../../components/Button';
import { PrintIcon } from '../../components/icons';
import { SymbolMark } from '../../components/InfoTip';
import { Sheet } from '../../components/Sheet';
import { ViewTitle } from '../../components/ViewTitle';
import { addExampleJob } from '../../data/storage';
import { openShortcuts } from '../../keyboard/ShortcutsPopover';
import { GLOSSARY, SYMBOLS } from '../../lib/glossary';
import type { SymbolKey } from '../../lib/glossary';
import { cx } from '../../lib/interaction';
import { printSheets, toExportError } from '../../platform/export';
import { navigate, routeHref } from '../../routes';
import { useLastJobId } from '../../state/jobs';
import { showToast } from '../../state/toast';
import c from '../cutlist/CutList.module.css';
import { Zones } from '../cutlist/Sheets';
import h from './Help.module.css';
import { useSectionLink } from './sectionLink';
import s from './Settings.module.css';

type StepPlace = 'defaults' | 'newJob' | 'workspace' | 'cutlist';

interface Step {
  title: string;
  text: string;
  place: StepPlace;
}

/**
 * Your first job, in six steps. The Help section and the printed quick start
 * both read them from here; docs/quick-start.md says the same in its own words.
 */
const FIRST_JOB: readonly Step[] = [
  {
    title: 'Check shop defaults',
    text: 'How cabinets are built, panel thickness, toe kick and countertop. New jobs copy them; a job you already made keeps its own.',
    place: 'defaults',
  },
  {
    title: 'Start a new job',
    text: 'Click New job (Ctrl+N). Give it a name and the customer, and check how it’s built.',
    place: 'newJob',
  },
  {
    title: 'Enter the sizes',
    text: `Width, height and depth of each cabinet. ${DIMENSION_EXAMPLES} ↑ and ↓ nudge a size by 1/16″.`,
    place: 'workspace',
  },
  {
    title: 'Finished ends, shelves and quantity',
    text: 'Pick the ends that show, the number of shelves, and how many of this cabinet to build. Add cabinet (Ctrl+N) for the next one.',
    place: 'workspace',
  },
  {
    title: 'Check the cut list, layouts and estimate',
    text: 'Cut list lists every part. Layouts shows the parts placed on sheets; Estimate shows what to buy and what it costs.',
    place: 'cutlist',
  },
  {
    title: 'Print or save as PDF',
    text: 'Print… (Ctrl+P) or Save PDF… puts out what’s showing: the cut list, the layouts or the estimate. Export CSV… saves the cut list or estimate for a spreadsheet; on Layouts, Export DXF… saves each sheet pattern as a DXF for CAD or CNC software.',
    place: 'cutlist',
  },
];

/** Where each step happens, in words: the link on screen, "Where:" on paper. */
const PLACE_NAMES: Record<StepPlace, string> = {
  defaults: 'Settings → Construction',
  newJob: 'Jobs → New job',
  workspace: 'Workspace',
  cutlist: 'Output',
};

/** Tall cabinets in one paragraph; docs/quick-start.md says the same. */
export const TALL_CABINETS_HELP =
  'Add tall cabinet (in the Add cabinet ▾ menu, or the type switch in the editor) makes a pantry, oven or utility cabinet: 18″ × 84″ × 24″ to start. It stands on the floor like a base cabinet, on the same base or legs, but has no countertop, so its box is the overall height minus the toe kick. Fixed shelves are structural shelves cut from the box stock and spaced evenly up the inside; a new tall cabinet with a box over 72″ starts with one, and the adjustable shelves are shared among the sections they make. With an inset back you can add a mid nailer under the lowest fixed shelf, and a back too long for one sheet can be split in two at that shelf.';

/** The glossary by term, as a reader looks a word up. */
const TERMS = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
const SYMBOL_KEYS = Object.keys(SYMBOLS) as SymbolKey[];

/** Words and symbols, rendered from glossary.ts: there's no second copy of the text. */
function WordsAndSymbols() {
  return (
    <>
      <dl className={h.symbols}>
        {SYMBOL_KEYS.map((key) => (
          <div key={key} className={h.entry}>
            <dt className={h.term}>
              <SymbolMark symbol={key} decorative /> {SYMBOLS[key].label}
            </dt>
            <dd className={h.text}>{SYMBOLS[key].text}</dd>
          </div>
        ))}
      </dl>
      <dl className={h.terms}>
        {TERMS.map((entry) => (
          <div key={entry.term} className={h.entry}>
            <dt className={h.term}>{entry.term}</dt>
            <dd className={h.text}>{entry.text}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** A step's link to its place. Job screens open the last job; with none yet, Jobs. */
function StepLink({ place }: { place: StepPlace }) {
  const lastJobId = useLastJobId();
  const defaults = useSectionLink('construction');
  if (place === 'defaults') {
    return (
      <a className={h.stepLink} {...defaults}>
        {PLACE_NAMES.defaults}
      </a>
    );
  }
  if (place === 'newJob') {
    return (
      <a className={h.stepLink} href={routeHref({ name: 'jobs', newJob: true })}>
        {PLACE_NAMES.newJob}
      </a>
    );
  }
  if (!lastJobId) {
    return (
      <a className={h.stepLink} href={routeHref({ name: 'jobs' })}>
        Jobs: open a job first
      </a>
    );
  }
  return (
    <a className={h.stepLink} href={routeHref({ name: place, jobId: lastJobId })}>
      {PLACE_NAMES[place]}
    </a>
  );
}

async function printQuickStart(): Promise<void> {
  try {
    await printSheets();
  } catch (error) {
    showToast(toExportError(error).message, { label: 'Try again', run: () => void printQuickStart() });
  }
}

/** Settings → Help: your first job, words and symbols, shortcuts and the example job. */
export function HelpSection() {
  const [adding, setAdding] = useState(false);

  const addExample = async () => {
    setAdding(true);
    const example = await addExampleJob();
    setAdding(false);
    if (example) showToast(`Added “${example.name}” to Jobs.`, { label: 'Open', run: () => navigate({ name: 'workspace', jobId: example.id }) });
  };

  return (
    <Sheet id="help" className={s.section} aria-labelledby="set-help">
      <div className={s.sectionHead}>
        <ViewTitle id="set-help" mark="7" title="Help" sub="YOUR FIRST JOB, WORDS AND SHORTCUTS" />
        <Button icon={<PrintIcon />} tooltip="Steps and words on one Letter page" onClick={() => void printQuickStart()}>
          Print quick start
        </Button>
      </div>

      <h3 className={h.heading}>Your first job</h3>
      <ol className={h.steps}>
        {FIRST_JOB.map((step) => (
          <li key={step.title} className={h.step}>
            <span className={h.stepTitle}>{step.title}</span>
            <span className={h.stepText}>{step.text}</span>
            <StepLink place={step.place} />
          </li>
        ))}
      </ol>

      <h3 className={h.heading}>Tall cabinets and fixed shelves</h3>
      <p className={h.paragraph}>{TALL_CABINETS_HELP}</p>

      <h3 className={h.heading}>Words and symbols</h3>
      <WordsAndSymbols />

      <div className={s.backupGrid} style={{ marginTop: 18 }}>
        <div>
          <h3 className={h.heading}>Keyboard shortcuts</h3>
          <p className={s.footnote}>Each screen lists its own. Press ? anywhere to see them.</p>
          <div className={s.buttonRow}>
            <Button onClick={openShortcuts}>Show keyboard shortcuts</Button>
          </div>
        </div>
        <div>
          <h3 className={h.heading}>Example job</h3>
          <p className={s.footnote}>A small kitchen built with your shop defaults, to look around in. It’s an ordinary job: change it, print it, archive it.</p>
          <div className={s.buttonRow}>
            <Button busy={adding} onClick={() => void addExample()}>
              Add the example job
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

const LETTER = { '--page-w': '8.5in', '--page-h': '11in' } as CSSProperties;

/**
 * The quick start on one Letter page: the six steps and the words and
 * symbols. Only ever printed (Print quick start), in the cut list's sheet frame.
 */
export function QuickStartSheet() {
  return (
    <div className={h.printOnly} aria-hidden="true">
      <style>{'@page { size: 8.5in 11in; margin: 0; }'}</style>
      <div className={c.pages} style={LETTER}>
        <article className={c.frame} data-sheet={1}>
          <div className={c.border}>
            <Zones />
            <header className={c.head}>
              <div>
                <div className={cx('cap', c.kicker)}>KERFuffle · Quick start</div>
                <div className={c.jobName}>Your first job</div>
              </div>
              <div className={cx('mono', h.sheetNote)}>The same help is in the app: Settings → Help</div>
            </header>
            <ol className={h.sheetSteps}>
              {FIRST_JOB.map((step) => (
                <li key={step.title} className={h.step}>
                  <span className={h.stepTitle}>{step.title}</span>
                  <span className={h.stepText}>{step.text}</span>
                  <span className={h.where}>Where: {PLACE_NAMES[step.place]}</span>
                </li>
              ))}
            </ol>
            <div className={h.sheetWords}>
              <h2 className={cx('cap', h.sheetHeading)}>Words and symbols</h2>
              <WordsAndSymbols />
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
