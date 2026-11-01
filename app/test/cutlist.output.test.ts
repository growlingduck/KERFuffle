import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCutList, DEFAULT_RULES, inches, parseDimension } from '@kerfuffle/engine';
import type { CabinetSpec, CutListOptions, Ticks } from '@kerfuffle/engine';
import { describe, expect, it } from 'vitest';
import { BOM, CSV_COLUMNS, cutListCsv, decimalInches } from '../src/cutlist/csv';
import { blockedText, exportFileName, generalNotes, isoDate, lineName, optionsText } from '../src/cutlist/format';
import { paginate } from '../src/cutlist/paginate';
import type { MeasuredGroup, PageLayout } from '../src/cutlist/paginate';

function loadJob(file: string): CabinetSpec[] {
  const path = join(import.meta.dirname, '..', '..', 'engine', 'fixtures', 'cutlist', file);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { cabinets: (Omit<CabinetSpec, 'width' | 'height' | 'depth'> & Record<'width' | 'height' | 'depth', string>)[] };
  const size = (text: string): Ticks => {
    const parsed = parseDimension(text);
    if (!parsed.ok) throw new Error(text);
    return parsed.value;
  };
  return raw.cabinets.map((c) => ({ ...c, width: size(c.width), height: size(c.height), depth: size(c.depth) }));
}

const MERGED: CutListOptions = { mode: 'merged', includeFronts: true, sort: { key: 'length', dir: 'desc' } };
const SAMPLE = loadJob('sample-job.json');
const META = { jobName: 'Kitchen remodel', jobNumber: 'J-0014', date: '2026-10-31', revision: 3 };

/** Minimal CSV reader for the tests (quoted fields, doubled quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += c;
  }
  return rows;
}

describe('CSV export', () => {
  const csv = cutListCsv(buildCutList(SAMPLE, DEFAULT_RULES, MERGED), META);
  const rows = parseCsv(csv.slice(1));

  it('starts with a BOM and uses CRLF line ends', () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('opens with a comment row naming the job, number, date and options', () => {
    expect(rows[0]).toEqual(['# KERFuffle cut list: Kitchen remodel · J-0014 · Rev. 3 · printed 2026-10-31 · Identical parts merged · fronts included · inches']);
    expect(rows[1]).toEqual([...CSV_COLUMNS]);
  });

  it('writes one row per merged line, in on-screen order', () => {
    expect(rows).toHaveLength(2 + 26);
    expect(rows[2]).toEqual(['P1', 'Bottom / Top', 'panel', '40 1/2″', '23 1/4″', '3/4″', '40.5', '23.25', '0.75', '2', 'B2×2']);
    expect(rows.find((r) => r[0] === 'P4')).toEqual([
      'P4', 'Left side / Right side', 'panel', '30 1/2″', '23 1/4″', '3/4″', '30.5', '23.25', '0.75', '8', 'B1×2, B2×2, B3×4',
    ]);
    expect(rows.find((r) => r[0] === 'L3')).toEqual(['L3', 'Left side / Right side', 'laminate', '32 1/2″', '26″', '', '32.5', '26', '', '3', 'B1, B3×2']);
  });

  it('keeps decimals exact to 1/64″', () => {
    expect(decimalInches(inches(23 / 32))).toBe('0.71875');
    expect(decimalInches(inches(28 + 7 / 64))).toBe('28.109375');
    expect(decimalInches(inches(28.25))).toBe('28.25');
  });

  it('marks rounded fractions with ≈, as on screen', () => {
    const rules = { ...DEFAULT_RULES, panelThickness: inches(23 / 32) };
    const out = parseCsv(cutListCsv(buildCutList(SAMPLE.slice(0, 1), rules, MERGED), META).slice(1));
    const back = out.find((r) => r[1]?.startsWith('Back'));
    expect(back?.[5]).toBe('≈3/4″');
    expect(back?.[8]).toBe('0.71875');
  });

  it('writes by-cabinet rows with the cabinet they belong to', () => {
    const byCab = parseCsv(cutListCsv(buildCutList(SAMPLE, DEFAULT_RULES, { ...MERGED, mode: 'by-cabinet' }), META).slice(1));
    expect(byCab[0]?.[0]).toContain('Listed by cabinet');
    expect(byCab.slice(2, 4)).toEqual([
      ['P3', 'Back', 'panel', '30 1/2″', '30″', '3/4″', '30.5', '30', '0.75', '1', 'B1'],
      ['P10', 'Bottom', 'panel', '28 1/2″', '23 1/4″', '3/4″', '28.5', '23.25', '0.75', '1', 'B1'],
    ]);
    // Lines, not pieces: B1 9, B2 8, B3 9, W1 10, W2 9.
    expect(byCab).toHaveLength(2 + 9 + 8 + 9 + 10 + 9);
  });

  it('quotes commas and quotes, and keeps labels from running as formulas', () => {
    const odd = [{ ...SAMPLE[0]!, id: '=HYPERLINK("x")' }, { ...SAMPLE[1]!, id: 'B,2' }];
    const text = cutListCsv(buildCutList(odd, DEFAULT_RULES, { ...MERGED, mode: 'by-cabinet' }), { ...META, jobName: 'Smith, "big" job' });
    const out = parseCsv(text.slice(1));
    expect(out[0]?.[0]).toContain('Smith, "big" job');
    expect(out[2]?.[10]).toBe('\'=HYPERLINK("x")');
    expect(out.at(-1)?.[10]).toBe('B,2');
  });

  it('says which cabinets were left out', () => {
    const broken = SAMPLE.map((c) => (c.id === 'B3' ? { ...c, width: inches(1) } : c));
    expect(cutListCsv(buildCutList(broken, DEFAULT_RULES, MERGED), META)).toContain('Excludes B3: needs a fix');
  });
});

describe('cut-list text', () => {
  it('states the options in words', () => {
    expect(optionsText({ mode: 'merged', includeFronts: false })).toBe('Identical parts merged · fronts left out · inches');
    expect(optionsText({ mode: 'by-cabinet', includeFronts: true })).toBe('Listed by cabinet · fronts included · inches');
  });

  it('names blocked cabinets', () => {
    expect(blockedText([])).toBeNull();
    expect(blockedText([{ index: 2, cabinetId: 'B3', issues: [] }])).toBe('Excludes B3: needs a fix');
    expect(blockedText([{ index: 0, cabinetId: ' ', issues: [] }, { index: 4, cabinetId: 'W2', issues: [] }])).toBe(
      'Excludes cabinet 1, W2: need a fix',
    );
  });

  it('drops "Laminate, " from laminate rows only', () => {
    expect(lineName({ category: 'laminate', names: ['Laminate, left side', 'Laminate, right side'] })).toBe('Left side / Right side');
    expect(lineName({ category: 'panel', names: ['Bottom', 'Top'] })).toBe('Bottom / Top');
  });

  it('prints dates as 2026-10-31', () => {
    expect(isoDate(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
    expect(isoDate(new Date(2027, 0, 5))).toBe('2027-01-05');
  });

  it('makes a safe default file name', () => {
    expect(exportFileName('Kitchen remodel', 'pdf')).toBe('Kitchen remodel – cut list.pdf');
    expect(exportFileName('Smith: unit 2/3?', 'csv')).toBe('Smith- unit 2-3- – cut list.csv');
    expect(exportFileName('  ...  ', 'pdf')).toBe('Job – cut list.pdf');
  });

  it('builds the general notes from the job rules', () => {
    expect(generalNotes(DEFAULT_RULES)).toEqual([
      'All dimensions in inches, to the nearest 1/16″. ≈ marks a rounded size.',
      'Length runs with the grain: ↕︎ up and down in the cabinet, ↔︎ side to side.',
      'Laminate is cut 1″ oversize past every edge. Trim after gluing.',
      'Front = door / front-laminate reference size, not a box part.',
      'Shelves are 1″ thick in cabinets 36″ wide or more.',
    ]);
  });
});

// --- Pagination --------------------------------------------------------------

const rows = (prefix: string, n: number, height = 30) => Array.from({ length: n }, (_, i) => ({ key: `${prefix}${i + 1}`, height }));

function describePages(pages: PageLayout[]): string[] {
  return pages.map((p) =>
    p.pieces.map((piece) => (piece.kind === 'intro' ? 'intro' : `${piece.groupId}${piece.cont ? '(cont)' : ''}:${piece.rowKeys.length}`)).join(' '),
  );
}

/** Every row placed once, in order; every sheet within its height. */
function checkLayout(pages: PageLayout[], groups: MeasuredGroup[], bodyHeight: number, introHeight = 0) {
  for (const group of groups) {
    const placed = pages.flatMap((p) => p.pieces.flatMap((piece) => (piece.kind === 'group' && piece.groupId === group.id ? piece.rowKeys : [])));
    expect(placed).toEqual(group.rows.map((r) => r.key));
  }
  pages.forEach((page, i) => {
    let used = 0;
    for (const piece of page.pieces) {
      if (piece.kind === 'intro') used += introHeight;
      else {
        const group = groups.find((g) => g.id === piece.groupId)!;
        expect(piece.rowKeys.length, `sheet ${i + 1}: a heading with no rows`).toBeGreaterThan(0);
        used += group.headHeight + piece.rowKeys.reduce((n, k) => n + group.rows.find((r) => r.key === k)!.height, 0);
      }
    }
    expect(used, `sheet ${i + 1} overflows`).toBeLessThanOrEqual(bodyHeight);
  });
}

describe('paginate', () => {
  it('keeps everything on one sheet when it fits', () => {
    const groups = [{ id: 'a', headHeight: 60, rows: rows('a', 5) }];
    expect(describePages(paginate({ bodyHeight: 600, introHeight: 40, groups }))).toEqual(['intro a:5']);
  });

  it('continues a long group under a "cont." heading', () => {
    const groups = [{ id: 'a', headHeight: 60, rows: rows('a', 40) }];
    const pages = paginate({ bodyHeight: 600, introHeight: 40, groups });
    // 600 − 40 − 60 = 500 → 16 rows; then 540 → 18; then the last 6.
    expect(describePages(pages)).toEqual(['intro a:16', 'a(cont):18', 'a(cont):6']);
    checkLayout(pages, groups, 600, 40);
  });

  it('moves a group whole to the next sheet when less than half of it would fit', () => {
    const groups = [
      { id: 'a', headHeight: 60, rows: rows('a', 14) },
      { id: 'b', headHeight: 60, rows: rows('b', 10) },
    ];
    // After a: 60 + 420 = 480 used, 120 left → 2 of b's 10 rows would fit.
    expect(describePages(paginate({ bodyHeight: 600, groups }))).toEqual(['a:14', 'b:10']);
  });

  it('splits a group when most of it fits', () => {
    const groups = [
      { id: 'a', headHeight: 60, rows: rows('a', 4) },
      { id: 'b', headHeight: 60, rows: rows('b', 14) },
    ];
    // After a: 180 used, 420 left → 12 of b's 14 rows fit.
    expect(describePages(paginate({ bodyHeight: 600, groups }))).toEqual(['a:4 b:12', 'b(cont):2']);
  });

  it('never leaves a heading at the foot of a sheet', () => {
    const groups = [
      { id: 'a', headHeight: 60, rows: rows('a', 17) },
      { id: 'b', headHeight: 60, rows: rows('b', 40) },
    ];
    // a leaves 30 px: not even b's heading fits, so b starts the next sheet.
    const pages = paginate({ bodyHeight: 600, groups });
    expect(describePages(pages)[0]).toBe('a:17');
    checkLayout(pages, groups, 600);
  });

  it('never carries a single row over to the next sheet', () => {
    // 600 − 60 = 540 → 18 rows fit; the 19th would sit alone, so two move on.
    const groups = [{ id: 'a', headHeight: 60, rows: rows('a', 19) }];
    expect(describePages(paginate({ bodyHeight: 600, groups }))).toEqual(['a:17', 'a(cont):2']);
  });

  it('places a row taller than a sheet rather than looping', () => {
    const groups = [{ id: 'a', headHeight: 60, rows: [{ key: 'huge', height: 900 }, ...rows('a', 2)] }];
    expect(describePages(paginate({ bodyHeight: 600, groups }))).toEqual(['a:1', 'a(cont):2']);
  });

  it('lays out the 40-cabinet stress job on Letter without losing or overfilling anything', () => {
    const job = loadJob('stress-40-cabinets.json');
    // Heights as measured on screen: 31 px rows, 63 px heading + column headers,
    // the chip row wrapping to three lines, and a Letter sheet's body.
    for (const mode of ['merged', 'by-cabinet'] as const) {
      const list = buildCutList(job, DEFAULT_RULES, { ...MERGED, mode });
      const groups: MeasuredGroup[] =
        mode === 'merged'
          ? list.groups.map((g) => ({ id: g.id, headHeight: 63, rows: g.lines.map((l) => ({ key: l.key, height: l.refs.length > 6 ? 48 : 31 })) }))
          : list.sections.map((s) => ({ id: String(s.index), headHeight: 63, rows: s.lines.map((l, i) => ({ key: `${l.key}#${i}`, height: 31 })) }));
      const pages = paginate({ bodyHeight: 640, introHeight: 120, groups });
      checkLayout(pages, groups, 640, 120);
      expect(pages.length).toBeGreaterThan(mode === 'merged' ? 3 : 10);
      // A sheet is used well: no sheet but the last is less than half full.
      const fill = pages.slice(0, -1).map((p) => p.pieces.reduce((n, piece) => {
        if (piece.kind === 'intro') return n + 120;
        const g = groups.find((x) => x.id === piece.groupId)!;
        return n + g.headHeight + piece.rowKeys.reduce((m, k) => m + g.rows.find((r) => r.key === k)!.height, 0);
      }, 0));
      expect(Math.min(...fill)).toBeGreaterThan(320);
    }
  });
});
