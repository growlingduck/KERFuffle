# Prompt 12 — Sheet Optimizer: Engine

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–11 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md`
> (§2, §4).

---

## Goal

A pure, deterministic, tested module that lays the job's pieces out on stock
sheets for a **table saw or panel saw**, and reports how sensitive the layout is
to small allowances. This prompt builds the engine and its tests. Prompt 13
builds the screen.

## Part 1: saw profiles

- Add saw profiles to shop settings, with a copy kept on each job.
- Fields: name, kerf, edge trim per sheet edge, smallest safe piece, smallest
  keepable offcut, first-cut direction, and Time-mode extra-sheet allowance.
- Seed **Table saw** and **Panel saw**: kerf 1/8″, trim 1/4″, smallest piece 2″,
  keepable offcut 12 × 12, extra-sheet allowance 1.
- Add a Settings section to edit, add and duplicate profiles, and a picker on the
  job.

## Part 2: the module

Add `engine/src/nesting/`, exported from the package:

```ts
layoutJob(cutList, materials, profile, { mode: 'cost' | 'grain' | 'time', seed, timeLimitMs },
          onProgress?): JobLayout
```

- Expand lines into pieces (mark, cabinet or run ref, size, visible,
  grain-locked), grouped by material.
- Grain: on a grained material, a piece's length runs along the sheet length.
  Rotation is allowed only on materials without grain.
- All cuts are **guillotine** cuts. Each sheet keeps an explicit **cut tree**
  (rip → crosscut → trim) in cut order, with kerf applied between pieces and
  edge trim at the sheet edges.
- Modes (plan §2.3):
  - **cost**: guillotine best-fit, then improvement.
  - **grain**: the same with rotation locked and visible pieces placed first.
  - **time**: strip packing that minimizes distinct rip widths, crosscut stops
    and distinct sheet patterns, within the extra-sheet allowance over the cost
    result.
- The output per material is: sheets (identical sheets merged into **patterns**
  with a count), placements, cut tree, offcuts (keepable or waste), and stats
  (sheets, yield %, fence settings, crosscut stops, patterns, cuts).
- Pieces that don't fit any sheet are reported, not dropped.
- Deterministic: a seeded RNG, the same input and seed give the same output, and
  `ALGORITHM_VERSION` is exported.
- **Spacing goes through one function of the cutting mode.** Only `saw` exists
  now. Don't hard-code kerf as the only spacing rule (plan §4).
- Coordinates are in Ticks, and the sheet origin and axes are documented. Part
  `features` from prompt 09 are carried through with each placement, already
  transformed for rotation.

## Part 3: sensitivity

`sensitivity(layoutInput, result)` re-runs the layout with each allowance (kerf,
trim, laminate oversize, shelf clearance) moved down and up by 1/64″ steps up to
1/8″. It also tries the pieces closest to a strip boundary shrunk slightly. It
returns:

- **near misses**: changes that save a sheet, with the material and the smallest
  change that does it;
- **fragile strips**: slack under a threshold, and the kerf or trim that would
  break the layout;
- a **light last sheet**: its yield and piece count.

Messages are plain shop language (plan §2.4). Nothing is applied automatically.

## Part 4: worker

The app runs `layoutJob` and `sensitivity` in a Web Worker, which reports the
best layout so far as the search improves, and can be cancelled when the inputs
change. Cache results by a hash of the inputs, the profile and
`ALGORITHM_VERSION`.

## Tests

- Property tests on random inputs:
  - no overlaps;
  - everything inside the trimmed sheet;
  - kerf between neighbors;
  - grain respected;
  - every piece placed once or reported;
  - deterministic.
- Hand-checked cases:
  - the 12 3/4″ vs 12 1/2″ wall-side example from the plan (3 vs 4 across);
  - a job that fits exactly;
  - a piece bigger than the sheet.
- Time mode never exceeds the extra-sheet allowance, and it uses fewer fence
  settings than cost mode on the sample job.
- Benchmark on the 40-cabinet stress fixture: first layout under 1 s, final under
  5 s. Record the numbers.

## Done when

The module and its tests pass, the benchmark meets its targets, and the summary
reports cost, grain and time stats for the sample job and the stress fixture.

## Out of scope

The screen and print (13), DXF (14), grain sequencing, router mode, offcut
inventory.
