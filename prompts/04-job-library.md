# Prompt 04 — Jobs Screen (Job Library)

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–03 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (sections 2–4, 6, 9, 10),
> `docs/wireframes/Home.dc.html`.

---

## Goal

Build the Jobs screen: the app's home. It's where users find, start, duplicate,
archive and preview jobs. It should feel like flipping through a drawing
register.

## Specification

Follow `docs/interaction-design.md` §6 exactly. The prototype
`docs/wireframes/Home.dc.html` shows the layout and every interaction working
with sample data. In summary:

- Header with tabs (Jobs, Settings).
- "Drawing register / Jobs" heading with **Import job…** (stub that shows a toast
  until prompt 07) and **New job**.
- Search (highlights matches, `/` focuses it, Esc clears), Show segmented control
  (Active / All / Archived with live counts), and sortable Job / Status / Last
  edited columns.
- Rows: job number, name + customer, status stamp, cabinet elevation strip +
  count, last edited (relative: "Today, 9:41 AM", "Yesterday", "Oct 21"), and
  actions revealed on hover or focus.
- ⋯ menu: Open, Duplicate, Export job file… (stub), Mark as…, Archive / Restore
  from archive.
- Job preview panel: job elevation with a base-run dimension, title block of
  totals and notes, Open / Cut list / Duplicate.
- New job dialog with validation, and a copy-from-job option.
- Backup strip (status text + buttons). Wire the buttons to prompt 07's backup
  commands if they exist; otherwise show "Coming in a later step" toasts and
  leave a TODO linked to prompt 07.
- Empty states: first run, no matches, nothing archived.

## Details to get right

- **Totals in the preview come from the engine.** Count panel and laminate
  pieces by running `calculateParts` for each cabinet with the job's own rules
  (respecting quantities). Don't hard-code per-cabinet counts the way the
  prototype does.
- **Elevation drawings** use true proportions: base cabinets sit on the floor
  line; wall cabinets hang with their bottoms 54″ above the floor (a display
  constant, labeled as such in code). Invalid cabinets draw as dashed
  placeholders.
- **Undo for archive and status changes** comes from the toast, and must also
  work if the user has changed the filter in the meantime.
- **Duplicate** gets the next job number and today's date, and keeps the source
  job's rules snapshot (not the current shop defaults).
- **Keyboard**: rows are reachable by Tab; ↑/↓ move between rows when one has
  focus; Enter opens; Ctrl+N opens New job; Ctrl+D duplicates the focused job;
  `/` focuses search.
- Sorting and the filter persist for the session.
- Relative-date formatting uses the user's locale and is unit-tested around
  midnight and year boundaries.

## Done when

- The screen matches the prototype's layout and behavior with real data from the
  prompt 03 store.
- Component tests cover search highlighting, filter counts, sort toggling, the
  duplicate and archive flows including Undo, and New job validation.
- axe reports no serious or critical violations, including with the menu and
  dialog open.
- Opening a job navigates to the Workspace for that job id, and back returns to
  the same scroll position and filter.

## Out of scope

Real import and export (prompt 07), the Workspace itself (prompt 05).
