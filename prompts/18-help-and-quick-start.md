# Prompt 18 — Help, Quick Start and Small Clarity Fixes

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–17 are done.
> Prerequisite reading for the agent: `docs/install.md`, `app/src/lib/glossary.ts` (prompt 16).

---

## Goal

Give shop users a single place to look things up, inside the app and offline,
plus a printable one-page quick start. Then fix a few small things that confuse
newcomers.

## Part 1: Help in the app

- Add a **Help** section to Settings, numbered after About, plus a **Help**
  button in the header next to the keyboard shortcuts button. The button opens
  that section.
- The Help section contains:
  1. **Your first job**: six short numbered steps. Check shop defaults → New
     job → enter sizes (with the accepted formats) → finished ends, shelves and
     quantity → Cut list, Layouts and Estimate → print or save as PDF. Each
     step links to its place in the app.
  2. **Words and symbols**: rendered from `glossary.ts`, so there's no second
     copy of the text.
  3. **Keyboard shortcuts**: a button that opens the existing shortcuts popover.
  4. **Add the example job** (from prompt 14).
- **Print quick start** prints steps 1 and 2 on one Letter page through the
  existing print path, following the print rules already in the repo (no SVG
  pattern fills).

## Part 2: docs

- Add `docs/quick-start.md` for the people in the shop: the same six steps in
  plain words, linked from `docs/install.md` ("First launch") and from the
  repo `readme.md`. Mention that the app has the same content under **Help**.

## Part 3: small clarity fixes

- **Ctrl+N** means New job on the Jobs screen and Add cabinet in the workspace.
  Make sure every place that offers either action shows the shortcut that
  applies there: the **Add cabinet** split button gets the tooltip *"Add cabinet
  Ctrl+N"*. Check that the shortcuts popover lists each one under its own
  screen.
- In **Settings**, mark **Saw profiles** and **Display** as *Advanced* in the
  section nav with a small tag. Don't hide or reorder them.

## Done when

- The Help button and the Settings section are reachable by mouse and keyboard.
  Every step link lands in the right place.
- **Print quick start** produces one page. Check it with the Edge headless
  recipe and include a screenshot in the summary.
- The glossary text appears in Help with no duplicated strings (there's a test).
- `docs/quick-start.md` exists and is linked from both docs.
- a11y tests pass.

## Out of scope

Video, online help, and context-sensitive help beyond the info tips from
prompt 16.
