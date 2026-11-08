/**
 * DXF export. The round trip parses each file back with a small reader written
 * here (not the writer's own geometry) and checks every outline against its
 * placement to within 1/64″, notches included.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  DEFAULT_SAW_PROFILES,
  buildCutList,
  drillLayer,
  inches,
  layoutJob,
  layoutToDxf,
  pocketLayer,
  type DxfUnits,
  type JobLayout,
  type LayoutMode,
  type MaterialLayout,
  type Placement,
  type SheetPattern,
} from '../src/index';
import { DEFAULT_JOB_MATERIALS, loadJob } from './support/jobs';

const TABLE_SAW = DEFAULT_SAW_PROFILES[0]!;
const PANEL_SAW = DEFAULT_SAW_PROFILES[1]!;
const TICK_IN = 1 / 64;

// ---------------------------------------------------------------------------
// A minimal DXF reader
// ---------------------------------------------------------------------------

interface Polyline {
  layer: string;
  closed: boolean;
  points: { x: number; y: number }[];
}
interface Text {
  layer: string;
  value: string;
  x: number;
  y: number;
  height: number;
  rotation: number;
}
interface Parsed {
  header: Map<string, string[]>;
  layers: string[];
  polylines: Polyline[];
  texts: Text[];
}

function parseDxf(source: string): Parsed {
  const raw = source.split('\r\n');
  expect(raw.at(-1)).toBe('');
  raw.pop();
  expect(raw.length % 2).toBe(0);
  const pairs: [number, string][] = [];
  for (let i = 0; i < raw.length; i += 2) pairs.push([Number(raw[i]!.trim()), raw[i + 1]!]);
  expect(pairs.at(-1)).toEqual([0, 'EOF']);

  const header = new Map<string, string[]>();
  const layers: string[] = [];
  const polylines: Polyline[] = [];
  const texts: Text[] = [];
  let section = '';
  let i = 0;
  const entity = (): [number, string][] => {
    const out: [number, string][] = [];
    while (i < pairs.length && pairs[i]![0] !== 0) out.push(pairs[i++]!);
    return out;
  };
  const get = (group: [number, string][], code: number) => group.find(([c]) => c === code)?.[1];
  while (i < pairs.length) {
    const [code, value] = pairs[i++]!;
    if (code === 0 && value === 'SECTION') {
      section = pairs[i++]![1];
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      section = '';
      continue;
    }
    if (section === 'HEADER' && code === 9) {
      const values: string[] = [];
      while (pairs[i]![0] !== 9 && pairs[i]![0] !== 0) values.push(pairs[i++]![1]);
      header.set(value, values);
      continue;
    }
    if (section === 'TABLES' && code === 0 && value === 'LAYER') {
      layers.push(get(entity(), 2)!);
      continue;
    }
    if (section === 'ENTITIES' && code === 0 && value === 'POLYLINE') {
      const g = entity();
      const line: Polyline = { layer: get(g, 8)!, closed: (Number(get(g, 70)) & 1) === 1, points: [] };
      while (pairs[i]![1] === 'VERTEX') {
        i++;
        const v = entity();
        expect(get(v, 8)).toBe(line.layer);
        line.points.push({ x: Number(get(v, 10)), y: Number(get(v, 20)) });
      }
      expect(pairs[i]![1]).toBe('SEQEND');
      i++;
      entity();
      polylines.push(line);
      continue;
    }
    if (section === 'ENTITIES' && code === 0 && value === 'TEXT') {
      const g = entity();
      texts.push({
        layer: get(g, 8)!,
        value: get(g, 1)!,
        x: Number(get(g, 11) ?? get(g, 10)),
        y: Number(get(g, 21) ?? get(g, 20)),
        height: Number(get(g, 40)),
        rotation: Number(get(g, 50) ?? 0),
      });
      continue;
    }
  }
  return { header, layers, polylines, texts };
}

// ---------------------------------------------------------------------------
// What each outline should be, worked out from the placement
// ---------------------------------------------------------------------------

/** Ticks → file units. */
const scale = (units: DxfUnits) => (units === 'in' ? TICK_IN : (TICK_IN * 25.4));
const tolerance = (units: DxfUnits) => (units === 'in' ? TICK_IN : TICK_IN * 25.4);

/** The expected corners of a piece in file coordinates (y flipped), as a set: rectangle corners, with each notch's three. */
function expectedCorners(p: Placement, sheetWidth: number, units: DxfUnits): { x: number; y: number }[] {
  const k = scale(units);
  const fy = (y: number) => sheetWidth - y;
  const x0 = p.x;
  const x1 = p.x + p.length;
  const yTop = fy(p.y);
  const yBot = fy(p.y + p.width);
  let corners = [
    { x: x0, y: yBot },
    { x: x1, y: yBot },
    { x: x1, y: yTop },
    { x: x0, y: yTop },
  ];
  for (const f of p.features) {
    const fx0 = f.x;
    const fx1 = f.x + f.length;
    const fTop = fy(f.y);
    const fBot = fy(f.y + f.width);
    // The rectangle corner the notch removes, and the three it adds.
    const cx = fx0 === x0 ? x0 : x1;
    const cy = fBot === yBot ? yBot : yTop;
    const ix = cx === x0 ? fx1 : fx0;
    const iy = cy === yBot ? fTop : fBot;
    corners = corners.filter((c) => !(c.x === cx && c.y === cy));
    corners.push({ x: ix, y: cy }, { x: ix, y: iy }, { x: cx, y: iy });
  }
  return corners.map((c) => ({ x: c.x * k, y: c.y * k }));
}

function signedArea(points: readonly { x: number; y: number }[]): number {
  let a = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  });
  return a / 2;
}

function checkPattern(m: MaterialLayout, pattern: SheetPattern, units: DxfUnits): Parsed {
  const dxf = layoutToDxf(pattern, { units, sheetLength: m.sheetLength, sheetWidth: m.sheetWidth, pieces: m.pieces });
  const parsed = parseDxf(dxf);
  const k = scale(units);
  const tol = tolerance(units);
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;

  expect(parsed.header.get('$ACADVER')).toEqual(['AC1009']);
  expect(parsed.header.get('$INSUNITS')).toEqual([units === 'in' ? '1' : '4']);
  for (const layer of new Set([...parsed.polylines, ...parsed.texts].map((e) => e.layer))) expect(parsed.layers).toContain(layer);
  for (const layer of parsed.layers) expect(layer).toMatch(/^[A-Z0-9_$-]+$/);

  // The sheet and its trim line.
  const sheet = parsed.polylines.filter((l) => l.layer === 'SHEET');
  expect(sheet).toHaveLength(2);
  const trim = pattern.cutTree;
  const box = (l: Polyline) => {
    const xs = l.points.map((p) => p.x);
    const ys = l.points.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const sb = box(sheet[0]!);
  expect(sb.x0 === 0 && sb.y0 === 0 && near(sb.x1, m.sheetLength * k) && near(sb.y1, m.sheetWidth * k)).toBe(true);
  const tb = box(sheet[1]!);
  expect(near(tb.x0, trim.x * k) && near(tb.x1, (trim.x + trim.length) * k)).toBe(true);
  expect(near(tb.y0, (m.sheetWidth - trim.y - trim.width) * k) && near(tb.y1, (m.sheetWidth - trim.y) * k)).toBe(true);

  // One closed, counterclockwise outline per placement, matching it to 1/64″.
  const outlines = parsed.polylines.filter((l) => l.layer === 'OUTSIDE_CUT');
  expect(outlines).toHaveLength(pattern.placements.length);
  const unmatched = [...outlines];
  for (const p of pattern.placements) {
    const want = expectedCorners(p, m.sheetWidth, units);
    const at = unmatched.findIndex(
      (l) => l.points.length === want.length && want.every((w) => l.points.some((pt) => near(pt.x, w.x) && near(pt.y, w.y))),
    );
    expect(at, `outline for ${p.mark} at (${p.x}, ${p.y})`).toBeGreaterThanOrEqual(0);
    const line = unmatched.splice(at, 1)[0]!;
    expect(line.closed).toBe(true);
    const area = signedArea(line.points);
    expect(area).toBeGreaterThan(0);
    const notched = p.features.reduce((s, f) => s + f.length * f.width, 0);
    expect(Math.abs(area - (p.length * p.width - notched) * k * k)).toBeLessThan(tol * tol * 4);
  }

  // Each piece's mark is on LABEL, inside its outline.
  for (const p of pattern.placements) {
    const label = parsed.texts.find(
      (t) => t.layer === 'LABEL' && t.value === p.mark && t.x >= p.x * k && t.x <= (p.x + p.length) * k && t.y >= (m.sheetWidth - p.y - p.width) * k && t.y <= (m.sheetWidth - p.y) * k,
    );
    expect(label, `label ${p.mark}`).toBeDefined();
  }
  return parsed;
}

const layoutAll = (cutList: ReturnType<typeof buildCutList>, mode: LayoutMode, profile = TABLE_SAW): JobLayout =>
  layoutJob(cutList, DEFAULT_JOB_MATERIALS, profile, { mode, seed: 7, timeLimitMs: 60_000 });

// ---------------------------------------------------------------------------

describe('layoutToDxf', () => {
  const SAMPLE = buildCutList(loadJob('sample-job.json'), DEFAULT_RULES, undefined, DEFAULT_JOB_MATERIALS);
  const METHOD_B = { ...DEFAULT_RULES, method: { ...DEFAULT_RULES.method, id: 'B' as const } };
  const SAMPLE_B = buildCutList(loadJob('sample-job.json'), METHOD_B, undefined, DEFAULT_JOB_MATERIALS);

  it.each(['cost', 'grain', 'time'] as const)('round-trips every outline of the sample job (%s mode, inches and mm)', (mode) => {
    const layout = layoutAll(SAMPLE, mode);
    expect(layout.materials.length).toBeGreaterThan(0);
    for (const m of layout.materials) for (const p of m.patterns) for (const units of ['in', 'mm'] as const) checkPattern(m, p, units);
  });

  it('cuts method B’s kick notches into the side outlines', () => {
    for (const profile of [TABLE_SAW, PANEL_SAW]) {
      const layout = layoutAll(SAMPLE_B, 'cost', profile);
      let notched = 0;
      for (const m of layout.materials) {
        for (const p of m.patterns) {
          const parsed = checkPattern(m, p, 'in');
          const outlines = parsed.polylines.filter((l) => l.layer === 'OUTSIDE_CUT');
          notched += outlines.filter((l) => l.points.length === 6).length;
          expect(outlines.every((l) => l.points.length === 4 || l.points.length === 6)).toBe(true);
        }
      }
      // Every notched piece in the cut list (base sides, and the laminate on finished base ends) is on a sheet.
      const want = SAMPLE_B.lines.filter((l) => l.features?.length).reduce((n, l) => n + l.refs.reduce((q, r) => q + r.quantity, 0), 0);
      expect(want).toBe(11);
      const sides = layout.materials.flatMap((m) => m.patterns.flatMap((p) => p.placements.filter((pl) => pl.features.length > 0).map(() => p.count)));
      expect(sides.reduce((a, b) => a + b, 0)).toBe(want);
      expect(notched).toBeGreaterThan(0);
    }
  });

  it('names the cabinet or run under each mark, and keeps text plain ASCII', () => {
    const layout = layoutAll(SAMPLE, 'cost');
    const m = layout.materials[0]!;
    const p = m.patterns[0]!;
    const parsed = parseDxf(layoutToDxf(p, { units: 'in', sheetLength: m.sheetLength, sheetWidth: m.sheetWidth, pieces: m.pieces }));
    const refs = new Set(m.pieces.map((x) => x.ref));
    expect(parsed.texts.some((t) => [...refs].some((r) => t.value.startsWith(r)))).toBe(true);
    // Without pieces, only the marks.
    const bare = parseDxf(layoutToDxf(p, { units: 'in', sheetLength: m.sheetLength, sheetWidth: m.sheetWidth }));
    expect(bare.texts).toHaveLength(p.placements.length);

    const named = { ...m.pieces[0]!, ref: 'Run: Évier – sink' };
    const odd = layoutToDxf(p, { units: 'in', sheetLength: m.sheetLength, sheetWidth: m.sheetWidth, pieces: [named, ...m.pieces.slice(1)] });
    expect(odd).toMatch(/^[\x20-\x7e\r\n]*$/);
    expect(odd).toContain('Run: \\U+00C9vier \\U+2013 sink');
  });

  it('writes the same file every time for the same pattern', () => {
    const layout = layoutAll(SAMPLE, 'time');
    const m = layout.materials[0]!;
    const options = { units: 'mm' as const, sheetLength: m.sheetLength, sheetWidth: m.sheetWidth, pieces: m.pieces };
    expect(layoutToDxf(m.patterns[0]!, options)).toBe(layoutToDxf(structuredClone(m.patterns[0]!), options));
  });

  it('names reserved pocket and drill layers with R12-safe characters', () => {
    expect(pocketLayer(inches(1 / 4), 'in')).toBe('POCKET_0_25IN');
    expect(drillLayer(inches(5 / 64), 'mm')).toBe('DRILL_1_984375MM');
    expect(drillLayer(inches(1), 'in')).toBe('DRILL_1IN');
  });
});
