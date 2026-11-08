# Prompt 20 — Tall Cabinets

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–19 are done.
> Prerequisite reading for the agent: `docs/calculation-rules.md`,
> `engine/src/methods/` (all of it), `docs/interaction-design.md`.

---

## Goal

Add a third cabinet type, **tall** (pantry, oven, utility, broom closet), beside
base and wall. A tall cabinet stands on the floor like a base cabinet but has no
countertop, and it fills both the base and the wall rows of an elevation.

Every rule below is a shop rule. Put each one in `docs/calculation-rules.md` in
shop terms, as the existing types are, before writing the code for it.

## Part 1: engine

### Type and geometry

- `CabinetType` becomes `'base' | 'wall' | 'tall'`. The compiler will flag every
  `Record<CabinetType, …>`. Fill each one; do not add a default branch that
  hides a missing case.
- Replace the single `isBase` test in `box.ts` and `validate.ts` with two facts
  about the type: **stands on the floor** (base, tall) and **has a countertop**
  (base only). Keep the legacy wall flags working exactly as they do now.
- Box height for a tall cabinet: overall height − toe kick. Validation: height
  must be more than the toe kick.
- A tall cabinet always gets a full top. `baseTop: 'stretchers'` applies to base
  cabinets only.

### Per method

- **A1 (ladder base):** tall cabinets join their run's platform the same way base
  cabinets do. A tall cabinet with no run gets its own platform. The existing
  mixed-depth rule (size the base for the shallowest cabinet) applies unchanged.
- **A2 (legs):** legs and kick clips per tall cabinet, as for base.
- **B (integral kick):** sides run the full overall height, notched for the kick,
  with a kick board. A finished end's laminate runs to the floor, notched the same
  way.

### Fixed shelves and other tall-cabinet options

Add these fields to `CabinetSpec`. They are used only by tall cabinets and are
ignored, and not shown, for base and wall. Defaults keep existing jobs unchanged.

1. **Fixed shelves** (`fixedShelfCount`, integer ≥ 0). A fixed shelf is a
   structural panel at full box depth (`memberDepth`) and full inner width
   (W − 2p), fastened like the bottom. It is a new part role, `fixed-shelf`, in
   the `box` material slot, with box thickness (not the wide-shelf rule).
   Its length has no shelf clearance and no setback.
   - The default comes from a new shop rule, `tallFixedShelfAbove` (default 72″
     box height). A new tall cabinet whose box is taller than this starts with
     1 fixed shelf, otherwise 0. The user can change the count on any tall
     cabinet. Changing the height later does **not** change a count the user
     has set.
   - **Adjustable shelves** (`shelfCount`) are split evenly among the sections
     the fixed shelves make. Shelf size does not change. Note the split in
     the part's notes only if the cut list already has a notes column.
   - With an inset back: the back stays one piece. Do **not** add a groove to
     the fixed shelf, because the back sits in the grooves in the sides, top
     and bottom only. Its depth stops at the face of the back: `interiorDepth`
     with an inset back, `memberDepth` with an applied back. Write the formula
     in `calculation-rules.md`.
2. **Mid nailer** (`midNailer`, boolean, default true when there are fixed
   shelves and the back is inset). A second nailer under the lowest fixed shelf
   so the back can be screwed at mid-height. Same size as the top nailer.
3. **Split back** (`splitBack`, boolean, default false). Used when the back is
   longer than the back material's sheet. The back is cut as two pieces that
   join at the lowest fixed shelf. This needs at least one fixed shelf, so
   validation reports an error on `splitBack` when `fixedShelfCount` is 0.
   For an inset back, each piece gets its own groove allowance. For an applied
   back, the two pieces together are the full height.

If any of 1–3 turns out to conflict with how the shop actually builds, stop and
write the question in the summary rather than guessing. Fixed shelves (1) are
required. Mid nailer and split back (2–3) can be deferred to a follow-up if
they make the change too large; say which.

### Validation

- Warn (not an error) when any tall part is longer than its slot material's
  sheet length. Nesting already reports oversized parts; this warning shows the
  problem in the editor too, and suggests a split back when the back is the part.
- Fixed shelves must leave each section taller than two panel thicknesses.

### Dependencies

`dependenciesFor` for tall: countertop moves nothing; toe kick moves box height,
sides, back, front and laminate (and the notch in method B). Add a
`fixedShelfCount` trace if tracing supports counts. If it doesn't, leave tracing
for counts out.

## Part 2: storage

- New migration `0008_tall_cabinets.sql`. SQLite cannot change the
  `CHECK (type IN ('base','wall'))` from `0001_initial.sql` in place, so rebuild
  the `cabinets` table inside a transaction: create a new table, copy the rows,
  drop the old table, rename, and recreate the indexes and triggers. Add the
  new columns with defaults (`fixed_shelf_count 0`, `mid_nailer 0`,
  `split_back 0`).
- Add `Tall` to the Rust `CabinetType` text enum and the new fields to the
  models. Bump the schema version.
- `.kerfjob` import and export: an older file without the new fields imports with
  the defaults. A file with `tall` cabinets imported by an older app should fail
  with the existing "made by a newer version" message, not a parse error. Check
  how the format is versioned and bump it if needed.
- Bump `RULES_VERSION` only if adding `tallFixedShelfAbove` requires it. Follow
  the pattern of the earlier rules bumps.

## Part 3: app

- **Add:** a third add action, **Add tall cabinet**, next to base and wall, with
  the same keyboard pattern (see `keyboard/shortcuts.ts`). Label prefix `T`
  (T1, T2…). New-cabinet defaults: 18″ W × 84″ H × 24″ D, 4 adjustable shelves,
  fixed shelves from the rule.
- **Editor:** the type switch has three choices. The fixed-shelf count, mid
  nailer and split back controls appear only for tall cabinets. Put them after
  the shelf count, and give each a glossary entry (prompt 16 pattern).
  Switching a cabinet to base or wall keeps the tall-only values but ignores
  them, so switching back restores them.
- **Drawing:** `CabinetDrawing` shows fixed shelves as solid lines and adjustable
  shelves as they are drawn today. The method sentence describes tall
  cabinets correctly for each method.
- **Elevation** (`lib/elevation.ts`, mini elevation, job preview): a tall
  cabinet starts at the floor and moves **both** the base and wall cursors to
  `max(base, wall) + width`. Base and wall cabinets after it line up past it.
  Count tall cabinets separately in the summary ("3 base · 1 tall · 4 wall").
  Include tall widths in the base-run total, because they take up floor
  length.
- **Cut list, Sheets, estimate, CSV, PDF, DXF:** anything that groups or labels
  by type handles tall. `fixed-shelf` gets a part name ("Fixed shelf") and sorts
  after `shelf`.
- **Help and quick start:** one short paragraph on tall cabinets and fixed
  shelves.

## Done when

- Engine tests for tall cabinets in each of A1, A2 and B, each with 0, 1 and 2
  fixed shelves, inset and applied backs, and a split back. Hand-check the
  expected sizes against `calculation-rules.md`, not against the code's output.
- A run that mixes base and tall cabinets gets one ladder base under all of
  them (A1).
- Existing base and wall results are unchanged: every existing engine snapshot
  passes untouched.
- A Rust migration test: a v7 database with base and wall cabinets migrates to
  v8 with every row intact, and accepts a tall cabinet afterwards.
  `cargo test` passes.
- A `.kerfjob` round-trip with a tall cabinet, and import of an older file
  without the new fields.
- The app suite passes (run from an uppercase `C:` path), including a11y.
- A screenshot of an elevation with base, tall and wall cabinets, and of a tall
  cabinet's drawing with a fixed shelf, in the summary.

## Out of scope

Doors, drawer banks inside tall cabinets, appliance cutouts (oven/microwave
openings), corner or angled cabinets, tall cabinets that hang (no floor
contact), and shelf-pin hole layout.
