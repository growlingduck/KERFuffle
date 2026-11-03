# Prompt 15 — Starting a Job: Shorter New Job Dialog, First Cabinet Ready

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–14 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (§5, §6).

---

## Goal

Get a new user from **New job** to typing a cabinet size with as few decisions
as possible. Today the New job dialog asks for a construction method and shows
a panel of short rule labels ("Shelf clear.", "Lam. +…", "Setback"). After
**Create and open**, all three workspace panels are empty, and the empty editor
says "Add a cabinet to start entering sizes" while the button for that is in a
different panel.

## Part 1: a shorter New job dialog

In `app/src/screens/jobs/NewJobDialog.tsx`:

- Collapse construction to one summary line under the form:
  *"Construction: {method short name} (shop default) · Change…"*. When copying a
  job: *"Construction: same as “{job}” · Change…"*.
- **Change…** expands, in place, the existing `ConstructionPicker` and the rules
  panel. Once it's open, it stays open until the dialog closes. Picking a
  different method still works exactly as it does now.
- The only required field is still the job name, and Enter in it creates the job.
- In the rules panel, write the labels out in full, using the same words as the
  workspace Construction section: "Shelf clearance, each side", "Shelf setback
  from front", "Laminate oversize, each edge".

## Part 2: a new empty job starts with one cabinet

- **An empty job** is created with one base cabinet using the `NEW_CABINET.base`
  size and the usual next label. It's created together with the job, not as a
  workspace undo step, so there's nothing to undo back to empty.
- When the workspace first opens a job that was just created, it selects that
  cabinet, then focuses and selects its **Width** field. Opening the job later
  doesn't move focus.
- Copies and imports are unchanged.

## Part 3: an empty workspace that points the way

Jobs with no cabinets still happen (older jobs, imports). For those:

- The editor's empty state gets **Add base cabinet** and **Add wall cabinet**
  buttons, plus one line saying the **Add cabinet ▾** menu has preset widths.
- The cabinet list's and parts panel's empty states each say what to do in one
  short line. Don't repeat the editor's buttons.

## Done when

- New job → type a name → Enter lands in the workspace with the Width field of
  cabinet B1 focused and selected, so typing replaces it.
- The New job dialog shows construction as one line until **Change…** is
  clicked. Choosing a method still changes the job, and copy-from still keeps
  the source job's method unless changed. The existing dialog tests are
  updated, and new ones cover the collapsed state.
- An empty job's editor shows the two add buttons, and each one works.
- a11y and motion tests pass (the expand respects reduced motion).

## Out of scope

Cabinet presets beyond the existing preset widths, and room grouping.
