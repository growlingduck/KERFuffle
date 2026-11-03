# Sheet optimizer

How the engine lays a job's pieces out on stock sheets for a table saw or a
panel saw (`engine/src/nesting/`, prompt 12). The plan is
[§2 and §4 of plan-methods-optimizer-costing.md](plan-methods-optimizer-costing.md#2-sheet-optimizer).
The Layouts screen and printout come in prompt 13.

## What goes in, what comes out

```ts
layoutJob(cutList, materials, profile, { mode, seed, timeLimitMs, iterations? }, onProgress?): JobLayout
```

- **Pieces:** every cut-list line, one piece per unit of quantity, in cabinet
  order. A piece keeps its mark (`P3-2` is the second P3), its cabinet or run,
  its size, whether it shows in the finished job, and its part features.
- **Grouped by material:** a line's own material, or the job's material for
  its first slot. Each material is laid out on its own.
- **Reported, never dropped:** a piece bigger than a trimmed sheet (`too-big`),
  a line with no material (`no-material`), a material without a sheet size
  (`no-sheet-size`), and solid stock (`solid-stock`, for a later face-frame
  method). Each comes with a sentence saying why.
- **Out:** per material, the sheets merged into **patterns** (identical sheets,
  with a count and the pieces on each one), the placements, the cut tree, the
  cuts in order, the offcuts (keepable or waste) and the stats.

## Coordinates

Integer ticks (1/64″). The origin is one corner of the full sheet. **x runs
along the sheet's length** (the grain, on a grained material) and **y along
its width**. Everything lies inside the trimmed rectangle
`[trim, length − trim] × [trim, width − trim]`.

An unturned piece has its part length along x, so its grain runs with the
sheet's. A turned piece is rotated a quarter turn: part point (u, v) lands at
(width − v, u). Part features (method B's kick notch) are given as rectangles
in sheet coordinates, already turned.

## Cuts

Every cut is a **guillotine** cut: it runs edge to edge of the piece it divides.
Each sheet keeps its cut tree. The root is the trimmed sheet; its children are
the **strips** (the first cuts), then each strip's crosscut pieces, then trims.
Children of one split lie side by side, one kerf apart. The cut list is in saw
order: every first-stage cut, then each strip's crosscuts, then the trims.

- **Spacing comes from one function**, `spacingFor(cuttingMode)`. The saw gives
  the kerf between pieces and the edge trim at the sheet edges. A router mode
  would add bit diameter and clearance there; nothing else assumes a kerf.
- **Edge trim** is taken off all four edges, and includes the trim cut's own
  kerf. So 4 × 11 3/4 + 3 kerfs + 2 × 1/4 = 47 7/8 fits a 48″ sheet, as in the
  plan's example. Trim cuts aren't in the cut list; they're the same on every
  sheet.
- **First cut** comes from the profile. "Rip along the length" puts the strips
  along x. "Crosscut first" puts them along y. "Either" tries both on each
  sheet and keeps the fuller one.

## The measures

Every result carries all of them, whichever mode made it.

| Measure | Meaning |
|---|---|
| Sheets | Sheets cut, all patterns together. |
| Yield | Piece area over full sheet area (not the trimmed area), to 0.1%. |
| Fence settings | Distinct rip widths **at each cutting stage**, added up. All strips of one width are ripped at one setting before the fence moves. A width that comes up again at a later stage (a trim, after the crosscuts) has to be set again, so it counts again. |
| Crosscut stops | The same, for crosscut lengths. |
| Patterns | Distinct sheets. |
| Cuts | Every saw cut on every sheet, edge trims not included. |

Why fence settings count per stage: with grained stock no piece may turn, so
counting each distinct width only once would always give the same number (one
per piece width), whatever the layout. What a layout can change is how often
the same width has to be set again at a later stage.

## The modes

- **Cost:** fewest sheets, then the largest keepable offcut, then fewest cuts.
  It starts with a best-fit layout. Each strip's width is chosen by trying the
  widest few and keeping the one that fills best. Inside a strip, the piece
  that fills the space most closely goes next. Then a search tries a fixed
  number of random variations (piece order, turning, how greedy each choice
  is), and keeps the best.
- **Grain:** the same, with nothing turned, even on a material without grain,
  and visible pieces placed before any others.
- **Time:** strips of a few widths, repeated. A small width class rides in the
  next wider strip and is trimmed, so each width is set at one stage only.
  Identical strips and sheets are repeated as often as possible. The layout
  may use up to the profile's extra sheets more than Cost mode. If no strip
  layout fits that allowance, the emptiest few strip sheets are cut best-fit
  instead. If that's still over, Time mode gives the Cost layout.

## Same input, same layout

The search runs a fixed number of steps per material (`DEFAULT_ITERATIONS`,
120) from a seeded random number generator. Each material's seed is mixed
with its id, so a material lays out the same in every mode and alongside any
other materials. `timeLimitMs` is only a safety stop. If it ever stops the
search early, the result says so (`search.complete: false`), because that
result could differ on a slower PC. `ALGORITHM_VERSION` (now 1) is exported
and recorded on every layout. Bump it whenever a change could move a piece.

`layoutKey(input)` hashes everything a layout reads: pieces, materials' sizes
and grain, the profile, the mode and seed, and the algorithm version. The app
caches by it. A price change doesn't change it.

## Sensitivity

`sensitivity(input, layout)` runs after the layout, in the background.
Nothing it finds is applied.

- **Near misses:** it moves kerf, edge trim, laminate oversize and shelf
  clearance in 1/64″ steps, up to 1/8″ either way, re-runs the layout, and
  reports the smallest change that saves a sheet. It also tries making the
  pieces closest to fitting one more across (or along) the sheet a little
  smaller, up to 1/4″, and reports that. Example: *"Making P3 Bottom / Left
  side / Right side / Top 7/32″ narrower (11 25/32″ instead of 12″) saves 1
  sheet of Birch plywood 3/4″."* Re-runs use a short search (4 steps), so a
  saving is real but could be missed.
- **Fragile strips:** strips with less than 1/16″ to spare, worked out exactly
  from the cut tree, with the kerf and edge trim over which they no longer
  fit.
- **Risks:** the smallest allowance change in the other direction from which
  every bigger step costs a sheet, against a re-run with the same short
  search.
- **Light last sheet:** a last sheet under 50% used, with its piece count.

## In the app

The layout and the sensitivity notes run in a Web Worker
(`app/src/layout/`). The worker reports the best layout so far as the search
improves it. A new input stops the run in progress: the optimizer is
synchronous, so its worker is ended and a new one started. Results are
cached by `layoutKey`. `useJobLayout(input)` keeps the last layout on screen
until the new one's first result. The app's runners (the layout on screen,
the other modes for comparison, and a job marked Ready to cut elsewhere)
share one cache.

The Cut list screen's **Layouts** tab shows one drawing per pattern, the
measures in each mode and the sensitivity notes; **Print layouts…** and
**Save PDF** print every material, one or two patterns a page, each with its
numbered cut sequence (`app/src/cutlist/layoutText.ts`).

### Saved layouts

A layout is kept with the job (`layouts` table, one row per material) when
the job is marked Ready to cut, or when layouts are printed or saved as PDF.
Each keeps `materialInputKeys` for its material (pieces, sheet, seed), the
saw profile, the mode and `ALGORITHM_VERSION`, so the app can say which
changed. Once a job is Ready to cut the kept layout is the one shown, printed
and counted in the estimate until **Recalculate** (undoable). A draft lays
itself out again whenever it changes. Backups and `.kerfjob` files carry
the kept layouts.

## Benchmark

On the 40-cabinet stress fixture (`engine/fixtures/cutlist/stress-40-cabinets.json`),
with the shop's default materials and the table saw profile. Recorded
2026-11-02 on the shop PC.

| | First layout | Final layout | Target |
|---|---|---|---|
| Cost, in the test suite (Node) | 12 ms | 1.9 s | under 1 s / under 5 s |
| Grain, in the test suite | 11 ms | 1.8 s | |
| Time, in the test suite | 79 ms | 3.2 s | |
| Cost, real worker in headless Edge (WebView2's engine) | 80 ms | 1.6 s | |
| Sensitivity notes after the layout | | 4.2 s (Node), 3.5 s (Edge) | none set |

The test suite checks the targets on every run (`engine/test/nesting.test.ts`).
In Edge the main thread stayed free throughout: a 50 ms timer kept firing
for the whole 5 s.
