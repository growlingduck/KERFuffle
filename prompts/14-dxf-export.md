# Prompt 14 — DXF Export

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–13 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md` (§4).

---

## Goal

Export each sheet layout as a DXF that CAD and CAM software can open. This is the
first CNC-ready output. No machine code is generated.

## Part 1: writer

- A pure engine function, `layoutToDxf(sheetPattern, options)`, that reads the
  saved layout (prompt 13). It never re-runs the optimizer, so the file always
  matches the printout.
- Use an ASCII DXF (R12 or R2000, whichever opens most reliably; say which and
  why), in inches or millimeters as chosen at export.
- Layers:
  - `SHEET`: outline and trim line;
  - `OUTSIDE_CUT`: closed part outlines, including notches from `features`;
  - `POCKET_<depth>` and `DRILL_<dia>`: reserved, written when features need
    them;
  - `LABEL`: part mark and cabinet or run as text.
- Part outlines are closed polylines, in a consistent direction.

## Part 2: export

**Export DXF…** on the Layouts tab writes one file per sheet pattern into a
chosen folder (default `Documents\KERFuffle\{Job} – DXF\`). File names include
the material and pattern number. Feedback, errors and **Show in folder** work
like the existing exports.

## Part 3: keep CNC easy to add

Write a short `docs/cnc-output.md` for the next developer. It describes the
layout format and the cutting-mode spacing function, and says where a router
mode, a G-code post-processor per controller, and part labels would plug in. No
code for these.

## Done when

- Exported DXFs for the sample job open correctly in at least one free viewer
  (e.g. LibreCAD) and one browser-based viewer. Record which in the summary,
  with a screenshot.
- Method B side notches appear in the outlines.
- Round-trip test: parse the DXF and check that every outline matches its
  placement within 1/64″.

## Out of scope

G-code, router mode, labels, free-form nesting.
