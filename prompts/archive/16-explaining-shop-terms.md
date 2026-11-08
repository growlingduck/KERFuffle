# Prompt 16 — Explaining Shop Terms and Size Entry

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–15 are done.
> Prerequisite reading for the agent: `docs/calculation-rules.md`, `docs/interaction-design.md`.

---

## Goal

Explain KERFuffle's vocabulary right where it appears, without cluttering the
screen for people who already know it. The terms that need it: run, ladder
base, finished ends, laminate oversize, shelf clearance, shelf setback, wide
shelves, construction methods, saw profile and kerf, plus the △ ◆ ⚠ symbols.

## Part 1: one glossary, small info tips

- Put every explanation in one module, `app/src/lib/glossary.ts`: a term, then
  one or two sentences in plain shop language that say what it is **and** what
  it changes on the cut list. Take the meaning from
  `docs/calculation-rules.md`; never guess a rule. Prompt 18 reuses this module.
- Add a shared `InfoTip` component: a small **?** icon button that shows the
  entry in the existing `Tooltip` on hover and focus. It must be reachable by
  keyboard and announced as "About {term}", with the text as its description.
- Place it beside:
  - each rule in the workspace **Construction** section and in **Settings →
    Construction**;
  - the **Run** field, **Finished ends**, and **Height, overall**, which
    explains the box-height tape;
  - the construction method in the `ConstructionPicker`;
  - saw profile and kerf on the Layouts tab and in **Settings → Saw profiles**;
  - **Laminate** in the cut list.
- Symbols: everywhere △, ◆ or ⚠ appears without words, give it an accessible
  name and a tooltip ("Warning", "Differs from shop defaults", "Needs a fix").
  The glossary also gets a symbols list.
- List every entry's text in your summary so the user can correct the wording.

## Part 2: show that pointing traces

Pointing at a size or rule highlights what it changes in the drawing. This is
the best way to learn the rules, but it's only mentioned in a footnote inside
the collapsed Construction section.

- The first time any job is opened in the workspace, show one dismissible line
  above the drawing: *"Point at any size or rule to see what it changes in the
  drawing."* Store the dismissal in the app's UI prefs (the same place as other
  display prefs), so it shows once per PC, not once per job.
- Keep the existing footnote.

## Part 3: size entry

Sizes are inches only. `parseDimension` (`engine/src/units.ts`) accepts `23`,
`23.75`, `.75`, `23 3/4`, `23-3/4`, `3/4`, with or without `"`.

- When typing doesn't parse, the error under the field gives examples:
  *"Type inches, like 23 3/4, 23-3/4 or 23.75."* Keep any more specific message
  (like a bad denominator) in front of it.
- The focused hint (`Reads as … · ↑↓ nudges 1/16″`) also mentions **Shift**
  for 1″ steps.

## Done when

- Every listed spot has an `InfoTip` that opens on hover and on keyboard focus,
  and all its text comes from `glossary.ts`. A test checks that every glossary
  key used in the UI exists.
- The tracing hint shows once on a fresh profile and never again after it's
  dismissed.
- Typing `23 3/` shows the example formats. Engine and app tests are updated.
- a11y tests pass with the new buttons.

## Out of scope

Metric input, and a help screen (prompt 18).
