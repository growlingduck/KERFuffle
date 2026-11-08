# Prompt 01 — Cabinet Calculation Engine

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisite reading for the agent: `APPLICATION-VISION.md`.
>
> **Status: done (2026-10-31).** Later shop answers changed some rules after this
> prompt was written: clearance and laminate oversize are now per side/edge
> (`shelfClearancePerSide`, `laminateOversizePerEdge`), and the shelf setback
> defaults to 1/8″. `docs/calculation-rules.md` and `engine/src/rules.ts` are the
> current source of truth.

---

## Goal

Build the KERFuffle **calculation engine**: a pure TypeScript module that turns a
cabinet description plus construction rules into a list of parts. It has no UI, no
storage, and no Tauri dependency, so it can be tested in isolation now and imported
by the React front end later.

This is the foundation everything else trusts. Correctness and explicitness matter
more than breadth: do not add cabinet types or features beyond what is listed here.

## Context

The legacy calculator exists in two slightly different forms. Read both before
writing code:

- `legacy/calculator/site/includes/js/main.js` (functions `buildBase`, `buildWall`, `ShelfTh`)
- `legacy/calculator/CutList.xlsm`, sheet `CutListCalculator`. **Do not execute macros.**
  Read formulas by unzipping and inspecting `xl/worksheets/sheet1.xml`.
  Inputs: D4 width, D5 height, D6 depth, D7 shelf count, D8 finished ends;
  I4 panel thickness, I5 toe-kick height, I6 countertop thickness, I7 shelf thickness.
  Rows 13–17 are the base cabinet (W / L / Th / Count), rows 21–25 the wall cabinet.
  Columns C–L: Back, Bottom, Left, Right, Top, Front, Shelf, Lam Left, Lam Right, Lam Front.

Treat the legacy formulas as shop knowledge to verify, not as specification.

## Legacy formulas (as observed)

Symbols: `W` width, `H` overall height, `D` depth, `p` panel thickness,
`t` toe-kick height, `T` countertop thickness, `n` shelf count, `S` shelf thickness.
Base box height `Hb = H − t − T`.

| Part | Width | Length | Thickness | Qty |
|---|---|---|---|---|
| Back | W | Hb (base) / H (wall) | p | 1 |
| Bottom | W − 2p | D − p | p | 1 |
| Left side, Right side | D − p | Hb (base) / H (wall) | p | 1 each |
| Top | D − p | W − 2p | p | 1 |
| Front | W | Hb (base) / H (wall) | p | 1 |
| Shelf | D − p | W − 2p − 1/8 | S | n |
| Laminate side (per finished end) | D + 1 | Hb + 1 (base) / H + 1 (wall) | — | 1 |
| Laminate front | W + 1 | Hb + 1 (base) / H + 1 (wall) | — | 1 |

Shelf thickness `S` is 1" for wide cabinets, otherwise 3/4".

## Confirmed by the shop

- **Wall cabinets never subtract toe-kick or countertop.** Every wall-cabinet
  height (back, sides, front, and laminate) uses the full `H`. Wall cabinets do
  not take `t` or `T` at all; the UI will hide those fields for wall cabinets.
  This corrects two legacy bugs: the spreadsheet's wall back (`H − t − T`) and the
  wall laminate in both versions (`H − t − T + 1`). The web version is treated
  as the corrected one where the two differ.
- **The Front panel is a reference size, not a carcass part.** It gives the size
  needed to cut doors from or to size front laminate. The engine always calculates
  it, but marks it `optional: true` so the cut list can include or leave out fronts
  (a user toggle, on by default). Its human label is "Front (door/laminate size)".
- **Shelf thickness depends on cabinet width: wider cabinets get thicker shelves.**
  Make this a shop setting, not a hard-coded rule: `shelfThickWidthThreshold`
  (default 36"), `shelfThickComparison: 'gt' | 'gte'` (default `gte`, the web
  behavior, so a cabinet exactly 36" wide gets the thicker shelf),
  `shelfThicknessNarrow` (default 3/4"), and `shelfThicknessWide` (default 1").
- **Shelves run full depth by default.** Add `shelfSetback` (default 0), which
  reduces shelf depth when set: shelf width = `D − p − shelfSetback`.
- **Laminate oversize is a setting.** Add `laminateOversize` (default 1"), applied
  to each laminate dimension.

## Known discrepancies: model these, don't resolve them

Each item below becomes an explicit, named field in `ConstructionRules` with a
default, and is listed in `docs/calculation-rules.md` as **OPEN**. Never silently
pick one interpretation in code without a rule field behind it.

1. *(Resolved; see "Confirmed by the shop". Record in the rules doc that the
   spreadsheet used `W > 36` and the web used `W >= 36`.)*
2. *(Resolved; see "Confirmed by the shop".)*
3. *(Resolved; see "Confirmed by the shop".)*
4. *(Resolved; see "Confirmed by the shop".)*
5. **Shelf side clearance** is a hard-coded 1/8" → `shelfClearance` (default 1/8").
6. **Top vs Bottom orientation.** Same dimensions, but Width/Length are swapped
   between the two. → Normalize. Define `length` as the dimension that runs with the
   grain (see Units and orientation below) and record the legacy swap in the rules doc.
7. *(Resolved; see "Confirmed by the shop".)*
8. *(Resolved; see "Confirmed by the shop".)*
9. **Laminate thickness** is blank in legacy. Laminate parts carry `thickness: null`.

## Units and orientation

- Imperial only for now, but keep units out of the core math so millimeters can be
  added later.
- **Internal representation: integer 1/64ths of an inch** (type `Ticks`, a branded
  number). This keeps sheet goods like 23/32" exact and avoids float drift.
- **Display precision: nearest 1/16".** The formatter returns both the text and an
  `inexact` flag when rounding changed the value, so the UI can mark it (e.g. `≈`).
- Every part has explicit `length`, `width`, `thickness`. Never use one-letter
  headings. `length` is the grain-wise dimension: vertical for backs, sides, front,
  and laminate; side-to-side for top, bottom, and shelves.

## Deliverables

```
engine/
  package.json          # standalone package, TypeScript strict, Vitest
  tsconfig.json
  src/
    index.ts            # public API only
    units.ts            # Ticks, parseDimension, formatDimension
    types.ts            # CabinetSpec, ConstructionRules, Part, ValidationIssue
    rules.ts            # DEFAULT_RULES, LEGACY_WEB_RULES, LEGACY_SHEET_RULES
    validate.ts
    calculate.ts        # calculateParts(spec, rules) -> { parts, issues }
  test/
    units.test.ts
    validate.test.ts
    calculate.test.ts
    golden.test.ts      # runs every fixture in fixtures/
  fixtures/
    *.json              # golden examples (see below)
docs/
  calculation-rules.md  # formulas, rule fields, OPEN questions table
```

### API shape (adjust names if better ones emerge, but keep the ideas)

```ts
type CabinetType = 'base' | 'wall';
type FinishedEnds = 'none' | 'left' | 'right' | 'both';

interface CabinetSpec {
  id: string;            // carried to every part, e.g. "B1"
  type: CabinetType;
  width: Ticks; height: Ticks; depth: Ticks;
  shelfCount: number;    // integer >= 0
  finishedEnds: FinishedEnds;
  quantity: number;      // integer >= 1; parts quantities multiply by this
}

interface ConstructionRules {
  panelThickness: Ticks;
  toeKickHeight: Ticks;        // base only
  countertopThickness: Ticks;  // base only
  // ...all rule fields from "Known discrepancies"
}

interface Part {
  cabinetId: string;
  role: 'back' | 'bottom' | 'side-left' | 'side-right' | 'top' | 'front' | 'shelf'
      | 'laminate-side-left' | 'laminate-side-right' | 'laminate-front';
  category: 'panel' | 'laminate';
  name: string;                // human label, e.g. "Left side"
  length: Ticks; width: Ticks;
  thickness: Ticks | null;
  quantity: number;
  optional: boolean;           // true only for the Front reference size
}

interface ValidationIssue {
  field: keyof CabinetSpec | keyof ConstructionRules;
  severity: 'error' | 'warning';
  message: string;             // plain-language, shown beside the field
}
```

- `calculateParts` is pure and deterministic. Parts come back in a stable order:
  panels first, in the table order above, then laminate.
- On any `error`, return an empty parts list plus the issues. Never return
  negative or zero dimensions.

### Parsing (`parseDimension`)

Accept: `23`, `23.75`, `23 3/4`, `23-3/4`, `3/4`, `23 3/4"`, with surrounding
whitespace. Reject with a clear message: empty, negative, non-numeric, a zero
denominator, and anything finer than 1/64". Return `{ ok: true, value } | { ok: false, message }`.

### Validation (minimum)

- All dimensions > 0. Shelf count and quantity are non-negative and positive integers respectively.
- `width > 2 × panelThickness + shelfClearance`; `depth > panelThickness`.
- Base: `height > toeKickHeight + countertopThickness`.
- Warning (not error) for implausible sizes, e.g. width > 60" or depth > 30".

## Golden examples

Fixtures are JSON: `{ name, status, spec, rules, expected: Part[] }`, where `status`
is `"legacy-derived"` or `"confirmed"`. **Only users can mark a fixture
`confirmed`.** The test runner prints a summary of how many are still
`legacy-derived`.

Seed at least these, computed from the legacy formulas under `DEFAULT_RULES`
(p = 3/4, t = 4, T = 1 1/2):

1. **Base 30 × 36 × 24, 1 shelf, left finished end.** Box height 30 1/2.
   Back 30 1/2 L × 30 W · Bottom 28 1/2 L × 23 1/4 W · Sides 30 1/2 × 23 1/4 (×1 each) ·
   Top 28 1/2 × 23 1/4 · Front 30 1/2 × 30 · Shelf 28 3/8 × 23 1/4 × 3/4 ·
   Lam left 31 1/2 × 25 · Lam front 31 1/2 × 31. (Format is length × width.)
2. **Base at the 36" boundary**: one fixture under `LEGACY_WEB_RULES` (1" shelf)
   and one under `LEGACY_SHEET_RULES` (3/4" shelf), to document the difference.
3. **Wall 30 × 30 × 12, 2 shelves, both ends finished**, under `DEFAULT_RULES`.
4. A **quantity 3** cabinet, to prove quantities multiply.
5. **23/32" panel thickness**, to prove 1/64" precision and the `inexact` display flag.

Also add `LEGACY_WEB_RULES` and `LEGACY_SHEET_RULES` presets that reproduce each
legacy version exactly, with one test each against a hand-checked legacy result.
That shows the discrepancies are real, not porting errors.

## `docs/calculation-rules.md`

Write this for the two shop users, not for developers. Include:
- each formula in plain language, with a small worked example;
- every rule field, its default, and where it came from;
- an **Open Questions** table (one row per OPEN item: question, web behavior,
  spreadsheet behavior, current default, and a blank "Shop answer" column);
- a **Resolved** list recording shop decisions, starting with the wall-cabinet rule.

## Out of scope

UI, persistence, Tauri, PDF/CSV, millimeters, edge banding, sheet layouts, and new
cabinet families. Part consolidation and the include-fronts option belong to the
cut-list layer (a later prompt), which shows parts either merged across cabinets or
listed cabinet by cabinet, as a user toggle. Keep `Part` shaped so consolidation is easy:
identical `category` + `length` + `width` + `thickness` means the same cut.

## Done when

- `npm test` in `engine/` passes, with TypeScript strict mode and no `any`.
- Every rule field named in "Confirmed by the shop" and "Known discrepancies"
  exists and is covered by a test, including a non-zero `shelfSetback` and a
  non-default `laminateOversize`.
- The golden fixtures above exist and pass.
- `docs/calculation-rules.md` exists with the Open Questions table filled in except
  for the "Shop answer" column.
- A short summary lists anything you were unsure about and any formula you think
  is wrong.
