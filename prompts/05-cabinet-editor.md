# Prompt 05 — Job Workspace (Cabinet Editor, Drawing, Parts)

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–04 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (all of it; §5 is this
> screen), `docs/wireframes/Main.dc.html`, `docs/calculation-rules.md`.

---

## Goal

Build the Job workspace, the screen where users spend most of their time: a
cabinet list, an editor, a live two-view drawing, and the parts table, all tied
together by **linked tracing**. Point at any size and the app shows where it
comes from and what it changes.

This is the most interaction-heavy screen. Correctness of the numbers comes
first, then the absence of friction during fast data entry, then polish.

## Specification

`docs/interaction-design.md` §5 is the spec. `docs/wireframes/Main.dc.html` is a
working prototype of every behavior. Use it to settle questions of feel
(timings, what highlights, what the caption says). **Its math is simplified;
every number in the app must come from `@kerfuffle/engine`.**

## Architecture

- **Domain commands, not ad-hoc state edits.** Every user change is a command
  (`setDimension`, `setType`, `setShelves`, `setQuantity`, `setFinishedEnds`,
  `renameCabinet`, `addCabinet`, `duplicateCabinet`, `removeCabinet`,
  `reorderCabinet`, `setStatus`). Each command produces a new job state plus a
  human label ("Change width on B1"). This gives undo/redo, autosave (prompt 03)
  and revision marks one shared path.
- **Undo history**: per job, in memory, last 100 steps, cleared when the job is
  closed. Typing in a field is one step, created on commit (blur or Enter).
  Steppers, toggles, add, duplicate and remove are one step each.
- **Derived data is memoized**: `calculateParts` per cabinet, keyed on spec +
  rules. Recalculating while typing must stay under one frame for a 40-cabinet
  job; add a benchmark test.
- **Tracing model**: one `traceKey` (hover beats focus) and one `hotPart` (hover
  beats pin), in a small UI store separate from the job state. Tracing must
  never trigger a save.
- **Dependency map** (`traceKey → {role: 'L' | 'W' | 'T' | 'qty'}`): put it in
  `engine/src/dependencies.ts` and export it. Write a test that **derives** each
  entry by perturbing the input by 1/64″ and checking which part dimensions move,
  so the map can't drift from the formulas.
- **Revision diff**: on each commit, undo and redo, compare the old and new part
  lists by role and record which fields changed and their old values. Drive the
  △n marks and the highlighter flash from that diff (§5.6).

## Drawing

Build `CabinetDrawing` from prompt 02's drawing primitives:
- Front elevation and section at one shared scale, fitted to the panel. Show the
  scale as `SCALE ≈ 1:n`.
- Geometry comes from the engine's part sizes and the job's rules, not
  re-derived. The shelf drawn in the elevation is the engine's shelf length. A
  1/8″ clearance won't be visible at this scale, and that's fine.
- Every part is a pointer target with hover, click-to-pin and the 30% fade on
  the others. Dimension groups are targets too; clicking one focuses its field.
- Dimensions, the Oversize toggle and the caption bar follow §5.4.
- The SVG has a computed `aria-label` sentence. The parts table row buttons give
  keyboard users the same tracing.

## Details to get right

- **IDs**: new cabinets get the next free label for their type (B4, W3).
  Renaming to a label that's already used is allowed but shows a warning on the
  field. Labels appear on the cut list, so warn at the Cut list step too.
- **Type switch**: switching to Wall keeps the user's height and hides the toe
  kick and countertop rows.
- **Invalid cabinets** keep their last valid drawing hidden and show the
  placeholder; the list row shows "⚠ Needs a fix"; the cut list (prompt 06) lists
  them as blocked.
- **The front reference row** is italic with REF. Its inclusion in the cut list
  is prompt 06's toggle.
- **The shelf-thickness warning for non-3/4″ panels** (the engine's issue)
  appears beside the Shelves stepper and as a row note.
- **Keyboard**: everything in §9 for this screen, through the prompt 02 registry.
  Alt+↑/↓ changes cabinet without losing the focused field's column (focus moves
  to the same field on the next cabinet).
- **Performance**: no layout shift while typing (fixed-height message line and
  caption), and no re-render of the cabinet list on each keystroke beyond the
  edited row.
- **Autosave** hooks into prompt 03's store through commands; the header shows
  the save state.

## Tests

- Command reducers: each command, undo and redo round-trips.
- The commit model: typing "3", "36", "36 1/2" then blurring creates exactly one
  undo step and one save.
- The dependency map is derived and checked against the engine.
- Revision diff: changing width from 30 to 32 marks back, bottom, top, front,
  shelf and front laminate, and nothing else.
- Interaction tests (Testing Library): pointing at the Width field traces the W
  dimension and the right cells; clicking the D dimension focuses Depth; pinning
  a part persists until unpinned or the cabinet changes; Remove → Undo restores
  the same position and ID.
- axe passes with the menus open.

## Done when

- Every behavior in §5 works against real data, and the numbers match
  `docs/calculation-rules.md`'s worked examples (base 30 × 36 × 24 and wall
  30 × 30 × 12) on screen.
- All tests pass. The typing benchmark meets the frame budget.
- A short summary lists any spec behavior you changed and why.

## Out of scope

The cut list, printing and exports (prompt 06), editing the job's construction
rules in place (read-only here; a later prompt may add per-job overrides), 3D
views.
