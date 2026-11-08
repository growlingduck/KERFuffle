# Prompt 13 — Layouts: Screen, Print, Saved Layouts

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–12 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md`
> (§2.6, §2.7, §3.4), `docs/interaction-design.md` (§2, §7, §10).

---

## Goal

Show the sheet layouts on the Cut list screen, print them for the saw, keep them
fixed once a job is ready to cut, and make the estimate use real sheet counts.

## Part 1: Layouts tab

- Add a **Layouts** tab beside the cut list. Don't call it "Sheets", which
  already means printed pages there.
- The toolbar has:
  - a mode switch (Cost · Grain · Time);
  - a saw profile picker;
  - a material picker;
  - Print layouts…;
  - Save PDF.
- Show one drawing per **pattern** with "× N":
  - pieces labeled with their mark;
  - rips dimensioned in cut order;
  - grain shown with a pattern, not color;
  - offcuts hatched as keepable or waste.
- A stats strip shows sheets, yield %, fence settings, patterns and cuts for the
  current mode, with the other modes' numbers beside them for comparison.
- **Sensitivity notes** appear below as plain sentences once the background run
  finishes. A near miss names the setting to change and links to it. It never
  changes anything itself.
- Hovering or pinning a piece traces it to the cut-list line and the cabinet
  (existing behavior). Pieces that didn't fit are listed with the reason.
- While the worker searches, the best layout so far is shown. Nothing blocks
  typing or scrolling, and the drawing doesn't jump.

## Part 2: saved layouts

- Add a `layouts` table in a forward migration: job, material, input hash,
  `ALGORITHM_VERSION`, mode, profile snapshot, layout JSON, created at.
- A layout is saved when the job is marked **Ready to cut** or a layout is
  printed or saved as PDF. Reopening shows the saved layout.
- If the inputs or the algorithm have changed since, a banner says so ("Cut list
  changed since this layout was saved") and offers **Recalculate**, which is
  undoable.
- Drafts recalculate freely.
- Backups and `.kerfjob` transfer carry saved layouts.

## Part 3: print

- One pattern per page (two per page when small enough).
- Each page has the title block, the material, the saw profile, kerf and trim,
  and the cut sequence as a numbered list ("1. Rip 23 1/8 ×2, 2. …") beside the
  drawing.
- A tick box for each sheet in the pattern.
- Black and white, with the same page rules as the cut list.

## Part 4: estimate uses the layout

When a layout exists for a material, the estimate's sheet count comes from it,
labeled "from layout". Otherwise it stays area-based and labeled "≈". On-hand
and to-buy work as before.

## Done when

- The sample job and stress fixture lay out, print legibly in grayscale, and
  save to PDF. Include them in the summary.
- A Ready-to-cut job keeps its layout across an app restart, and across a change
  of `ALGORITHM_VERSION` in a test.
- The estimate shows layout counts where available.
- The a11y, keyboard and motion tests cover the new tab.

## Out of scope

DXF (14), grain sequencing, offcut inventory.
