# CNC output: where things plug in

For the developer who adds router or CNC output. The plan behind this is
[`plan-methods-optimizer-costing.md`](plan-methods-optimizer-costing.md) §4.
Today the only machine-ready output is **DXF** (prompt 19). No G-code is
generated.

## The rule: outputs read a saved layout

```
cut list ──► layoutJob() ──► JobLayout ──► saved per material (layouts table)
                                              │
                    ┌─────────────────────────┼──────────────────────────┐
                    ▼                         ▼                          ▼
          printout (LayoutPages)     DXF (layoutToDxf)       G-code post-processor (later)
```

The optimizer runs once. Everything after it is a reader of the result and never
lays anything out again, so the printout, the DXF and any later G-code always
describe the same sheets. A layout is kept with the job (`SavedLayoutRecord` in
`app/src/data/types.ts`) when it is printed, saved as PDF, exported as DXF, or
the job is marked Ready to cut. The record holds the `ALGORITHM_VERSION` and an
input hash, so a kept layout can be told apart from one the current code would
make.

## The layout format

Types: `engine/src/nesting/types.ts`. Units are `Ticks`, integer 1/64″
(`engine/src/units.ts`).

- `MaterialLayout`: one material. `sheetLength` × `sheetWidth` is the full
  sheet, `pieces` lists every piece (with `ref`, the cabinet or run), and
  `patterns` holds the sheet patterns.
- `SheetPattern`: one arrangement, cut `count` times. `sheets[k].pieceIds[i]`
  says which piece sits at placement `i` on the k-th sheet. Pieces at the same
  spot can be for different cabinets.
- `Placement`: `x, y, length, width` on the sheet, `rotated`, the part's own
  size, and `features`.
- `PlacedFeature`: a feature as a rectangle in sheet coordinates (already
  turned with the piece), plus the part's own `PartFeature`. The only kind
  today is the corner `notch` (method B's toe kick).
- `cutTree`, `cuts`, `offcuts`: the guillotine cut tree and the numbered saw
  cuts. These are for the saw. A router reader can ignore them.

Sheet coordinates: the origin is a corner of the untrimmed sheet. x runs along
the sheet's length (with the grain) and y along its width. On the printout, y
runs **down** the page.

## Spacing is a function of the cutting mode

`spacingFor(mode: CuttingMode): Spacing` in `engine/src/nesting/profile.ts` is
the only place that decides gaps:

```ts
type CuttingMode = { kind: 'saw'; profile: SawProfile };
interface Spacing { between: Ticks; edge: Ticks; guillotine: boolean }
```

In saw mode, `between` is the kerf, `edge` is the edge trim, and `guillotine`
is true. The packer (`layout.ts` → `prepare()`) only reads `Spacing`, never the
kerf directly.

## DXF (built)

`layoutToDxf(pattern, { units, sheetLength, sheetWidth, pieces })` in
`engine/src/nesting/dxf.ts`. In the app, **Layouts → Export DXF… → Inches… /
Millimeters…** writes one file per pattern into a folder
(`app/src/cutlist/dxf.ts`, then `saveFolder` → the Rust commands
`choose_export_folder` and `write_export_files` in
`app/src-tauri/src/export.rs`).

- The files are **R12 ASCII** (AC1009), with CRLF line ends. Every reader
  handles R12. R2000 needs handles and an OBJECTS section that strict readers
  reject when any part is off, and it adds nothing for outlines and text.
  `$INSUNITS` gives the units (1 = inches, 4 = millimeters).
- y is flipped (`Y = sheetWidth − y`) so the drawing looks like the printout.
  The file's origin is the sheet corner at the bottom left of the printed drawing.
- Layers: `SHEET` (sheet and trim line), `OUTSIDE_CUT` (one closed,
  counterclockwise POLYLINE per piece, with notches cut in), and `LABEL` (the
  mark, with the cabinet or run below it).
- `POCKET_<depth>` and `DRILL_<dia>` are reserved. `pocketLayer()` and
  `drillLayer()` make R12-safe names such as `POCKET_0_25IN`. They aren't
  written yet because no feature needs them. When you add a feature kind to
  `PartFeature`, the switch in `featureLayer()` won't compile until you pick
  the kind's layer.
- Tests: `engine/test/dxf.test.ts` parses each file back and checks every
  outline against its placement to within 1/64″.

## Where the next pieces go

**Router mode.**
1. Add `{ kind: 'router'; bitDiameter; clearance; … }` to `CuttingMode`. Then
   make `spacingFor` return `between = bit + clearance`, `guillotine = false`.
2. Add a non-guillotine packer beside `pack.ts`, and pick it in `layout.ts`
   when `spacing.guillotine` is false. For router layouts, `cutTree` and `cuts`
   can be empty. The printout's rip list (`stripOfCuts`, `cutSequence`) then
   needs a router version.
3. Store router settings like saw profiles (Settings, plus a copy on the job),
   and bump `ALGORITHM_VERSION`.

**G-code post-processor, one per controller.** Add a new reader beside
`dxf.ts`, e.g. `engine/src/cnc/`. It takes a `SheetPattern` plus a tool library
and a controller profile, and returns text. Start from `partOutline()`: it
gives the closed counterclockwise outline in file coordinates, so climb or
conventional cutting is a choice of offset side. Keep each controller's dialect
(header, units, tool change, arcs, comments) in its own small module behind a
shared interface. Tabs, feeds and speeds, safe-Z and bed checks, and a toolpath
preview all belong to this layer. None of them belongs to the optimizer.
Export it the same way as DXF: one file per pattern, through `saveFolder`.

**Part labels.** The data is already in the layout:
- the mark and name on the `Placement`;
- the cabinet or run (`Piece.ref`), through `sheets[k].pieceIds`;
- the job number on the job.

A label sheet is a new print view, like `LayoutPages`, with one label per
piece id. A barcode would encode the job number plus the piece id (`P3-2`),
which is unique within a job. For CNC, the same text can go on the DXF `LABEL`
layer, or into the G-code as a label-printer trigger.
