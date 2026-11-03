# Prompt 09 — Construction Methods: Engine

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–08 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md`
> (§0, §1), `docs/calculation-rules.md`, `engine/src/`.

---

## Goal

Teach the engine more than one way to build a cabinet. A job's rules choose a
**construction method**, and the parts list follows it. Today's results must not
change: existing jobs become "frameless on a separate base, base left off", and
every existing golden fixture passes unchanged.

## Part 1: methods as a registry

Add `engine/src/methods/`. Each method is one module that declares:

- its id and plain-language name;
- its settings and their defaults;
- a part generator per cabinet type (base, wall);
- an optional job-level generator for parts shared by a run;
- which part roles are **visible** (for grain mode and laminate later);
- its **material slot** for each role (`box`, `back`, `shelves`, `base`,
  `kick-face`, `laminate`). Prompt 11 uses this.

Build methods **A** (frameless on a separate base, with base types A1 ladder and
A2 legs) and **B** (frameless with integral toe kick). Face frame (C) is not
built. Make sure nothing assumes every part is sheet goods, so C can be added
as one more module.

Move the box math into one shared calculator that the methods call. Don't give
each method its own copy of the formulas.

## Part 2: settings

Extend `ConstructionRules` with a `method` block holding the settings table in
plan §1.3:

- back type and thickness;
- base top (full panel or stretchers) and stretcher width;
- kick depth;
- base type;
- sleeper spacing and maximum platform length;
- legs per box and the leg width threshold;
- nailer width.

Kick height stays where it is. Every setting is validated with plain-language
messages, beside the field, as today.

Defaults: method A, A1, applied 3/4″ back, full top, kick depth 3″, stretcher
4″, sleepers ≤ 24″, platforms ≤ 96″, legs 4 (6 over 36″).

## Part 3: rules version 2

- Bump `RULES_VERSION` to 2 in `app/src/data/rules.ts` and
  `app/src-tauri/src/db/models.rs`, and update `default_rules.json`.
- Upgrade version 1 snapshots to method A1 with a v1-only `listBase: false`
  flag, so no base parts are produced. The upgraded rules must give exactly
  today's parts. New jobs get `listBase: true`.
- Old `.kerfjob` files and backups still import. Newer files are refused by an
  older app with the existing message.

## Part 4: runs and job-level parts

- Add an optional `run` to `CabinetSpec`, and a `run` column on cabinets in a
  new forward migration (`0002_*.sql`, never edit 0001). Runs are separate from
  `room`.
- Add `jobParts(cabinets, rules)`. For A1:
  - group base cabinets by run, in list order;
  - each group's platform length is the sum of its widths;
  - split anything over the maximum into equal sections, preferring joints at
    cabinet seams;
  - produce front and back rails, sleepers (ends plus enough between to keep
    spacing under the maximum) and the kick skin;
  - a base cabinet without a run gets its own platform.
- For A2 and B, kick boards are per cabinet.
- Run parts carry a reference like `Run: Sink wall` instead of a cabinet label.
  `buildCutList` merges cabinet and run parts, and marks, merging, refs and CSV
  all work with them.

## Part 5: features on parts

Add an optional `features` list to `Part`. The only one needed now is the
toe-kick notch on method B sides: `{ kind: 'notch', corner, length, width }` in
part coordinates. Document the coordinate system (origin, which edge is the
front). DXF (prompt 19) and the drawing (prompt 10) read it. The cut list shows
a short note ("notched 4 × 3") on the line, and parts with different features
must not merge.

Laminate follows the method: with method B, finished-end laminate is full height
(to the floor) with the notch. With method A, it covers the box only.

## Part 6: docs and fixtures

- `docs/calculation-rules.md`: one section per method, written in shop
  language, each with a worked base and wall example. New settings go in the
  settings table.
- Golden fixtures, marked **unconfirmed**:
  - A1 single run of three base cabinets;
  - A1 run over the maximum length;
  - A2 base;
  - B base with a finished end;
  - an inset back with stretchers.

  Compute the expected values by hand from the doc.

## Done when

- Every existing engine and app test passes unchanged. The v1 → v2 upgrade
  produces identical cut lists for every existing fixture and sample job.
- The new fixtures pass, and `calculation-rules.md` explains each method well
  enough to check a build by hand.
- `cargo test` passes. Migration 0002 is tested from a v1 database with jobs in
  it.
- A short summary lists any formula where the shop should check a judgment call
  (e.g. sleeper count, platform splits).

## Out of scope

UI (prompt 10), materials (11), face frame, a method override per cabinet.
