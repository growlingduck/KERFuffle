# Prompt 21 — Dark Mode

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–19 are done (20 is independent).
> Prerequisite reading for the agent: `docs/interaction-design.md` §2 (visual
> language), `app/src/styles/tokens.css`, `app/src/styles/base.css`.

---

## Goal

A small **Light / Dark / System** theme switch. The app keeps its drafting-paper
look in both themes: dark mode is a blueprint-style dark ground, not inverted
paper.

## Part 1: tokens

- All colors already live in `tokens.css` on `:root`. Add a dark set of the
  **same token names** under `:root[data-theme="dark"]`, and under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
  for System. Do not add new token names unless a component needs one.
- Set `color-scheme: light` or `dark` on `:root` to match, so scrollbars,
  native inputs and selects follow the theme.
- Contrast: keep the ratios the comments in `tokens.css` promise (`--muted` ≥ 7:1,
  `--muted-2` ≥ 5.5:1, disabled ≥ 4.5:1), measured against the dark `--paper`
  and `--vellum`. Write each ratio in a comment as the light tokens do.
- Semantic colors keep their meaning. Blue is selection and primary, red is
  errors only, amber is warnings and the highlighter, green is saved. Lighten
  them for the dark ground. Choose the highlighter so the changed value stays
  readable on it.
- The toast is already dark. In dark mode it should be a lighter surface, or
  dark with a border, so it still stands apart from the page.
- Add a dark column to the token table in `docs/interaction-design.md` §2.

## Part 2: hard-coded colors

About 75 hex colors are written outside `tokens.css` (drawing CSS, `Hatch.tsx`,
`PartSketch.tsx`, the Jobs, CutList, Layouts, Settings, Workspace and Menu
modules). Move each one to an existing token, or to a new token if none fits.
`dev/Gallery` is exempt. Afterwards, a grep for hex colors outside `tokens.css`
and `dev/` should find nothing. Add a test or lint rule that keeps it that way.

SVG drawings (cabinet drawing, elevations, part sketches, sheet layouts) use
`currentColor` or tokens, so they redraw when the theme changes without a
reload.

## Part 3: print stays light

Printouts and PDFs (cut list, estimate, layouts, quick start) are always light.
Under `@media print`, force the light tokens no matter what the theme is. The
PDF export path must render light as well. Check it with headless Edge, as the
existing print checks do.

## Part 4: the switch

- A small three-way segmented control (Light · Dark · System, with System as the
  default) in Settings, near the top. Also add a **Theme** item to the app menu
  that cycles through the three, and show the current choice in the menu.
  No new keyboard shortcut unless one is free and obvious.
- Store it per PC in `localStorage`, as `cutlist/prefs.ts` stores its prefs, not
  in shop settings. It is a viewing preference, so it should not travel with
  backups or `.kerfjob` files. Wrap every read and write in try/catch so the
  app still works when storage fails.
- Apply the theme before first paint: a tiny inline script in `app/index.html`
  sets `data-theme`, so the app never flashes light before it turns dark. With
  System, follow live changes to the OS setting.
- Switching theme is instant. Under reduced motion there is no transition at
  all. Otherwise a color transition of at most `--dur-*` short is fine.
- If Tauri's window title bar can follow the theme (`setTheme` on the window),
  set it. If it can't, write that in the summary.

## Done when

- Screenshots of the Jobs screen, the workspace (editor and drawing), the cut
  list, Layouts and Settings in both themes, in the summary.
- The axe a11y tests run in both themes and pass (colour contrast included).
- A printed cut list and layout PDF made while in dark mode is identical to one
  made in light mode.
- No light flash on a cold start in dark mode.
- The app suite passes (run from an uppercase `C:` path).

## Out of scope

Custom accent colors, a high-contrast theme, and per-job themes.
