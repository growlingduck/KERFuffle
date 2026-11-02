# Prompt 10 — Construction Methods: UI

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–09 are done.
> Prerequisite reading for the agent: `docs/plan-methods-optimizer-costing.md`
> (§1.2, §1.5), `docs/interaction-design.md`, `docs/calculation-rules.md`.

---

## Goal

Let the shop choose how a job is built when it's started, set shop defaults for
every method setting, group base cabinets into runs, and see the method in the
drawings and on paper.

## Part 1: new job

The New job dialog gets a **Construction** choice: method A (base type A1 or A2)
or method B. Each option has a small line diagram of a base cabinet built that
way. The default is the shop default from Settings. The chosen method's settings
are snapshotted into the job with the rest of the rules, as today.

## Part 2: Settings

A **Construction** section has:

- the default method and base type;
- every setting from plan §1.3, grouped (Back, Top, Toe kick, Base);
- settings that apply to only some methods are shown only for those methods,
  and hidden settings keep their values;
- a detail drawing (extend `DetailDrawing`) that updates as settings change.

Validation, draft and save behave like the existing rules settings.

## Part 3: workspace

- A **Run** field on base cabinets, with suggestions from runs already in the
  job. It's hidden for wall cabinets and for methods that don't use runs.
- The cabinet list can group by run. Ungrouped base cabinets are listed as
  "No run (own base)".
- The cabinet drawing shows the method: the kick notch and kick board (B),
  stretchers, an inset back, or the separate base under the box (A1 rails, A2
  legs). The existing tracing works for the new parts.
- The parts panel lists run parts under the run, not under a cabinet.

## Part 4: changing the method

While a job is **Draft**, the job's construction can be changed from the
workspace. It's one undoable step. A toast reports what changed ("12 parts
changed, 4 added") and offers **Undo**. From **Ready to cut** onward the control
is disabled, with a short reason and a hint to duplicate the job.

## Part 5: output

The cut list mode line, title block and CSV header name the method and base type
("Frameless · separate ladder base"). Run parts print with their run reference.

## Done when

- A new job can be created with each method, and its cut list matches the prompt
  09 fixtures.
- Changing the method in Draft is undoable, and is locked after Draft.
- The a11y, keyboard and contrast tests cover the new controls.
- Printouts of a method B job and an A1 job with two runs are legible in
  grayscale. Include them in the summary.

## Out of scope

Materials, the optimizer, a method per cabinet.
