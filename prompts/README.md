# Build prompts

Run these in order, each in a fresh coding-agent session at the repo root. Each
prompt lists its prerequisites and a "Done when" checklist. Don't start the next
one until the checklist passes.

Open prompts sit in this folder. Finished prompts move to [`archive/`](archive/)
so this folder only shows what's left to build.

## Archiving a finished prompt

Every prompt ends with a **When done: archive this prompt** step. Once the
"Done when" checklist passes, the agent running it:

1. Moves the prompt into the archive with `git mv prompts/NN-name.md prompts/archive/`.
2. In the table below, changes its link to `archive/NN-name.md` and sets its
   Status to `Done`.
3. Updates any other links to the file (search the repo for `prompts/NN-`).

If the checklist doesn't fully pass, the prompt stays here and the summary says
what's left. When you write a new prompt, copy the **When done** section from an
open prompt (or from this README) to the end of it, and add a row to the table.

## Prompts

| # | Prompt | Delivers | Status |
|---|---|---|---|
| 01 | [Calculation engine](archive/01-calculation-engine.md) | `engine/`, `docs/calculation-rules.md` | Done |
| 02 | [App shell and design system](archive/02-app-shell.md) | Tauri + React app, tokens, shared components, keyboard | Done |
| 03 | [Job storage](archive/03-job-storage.md) | SQLite, autosave, crash recovery | Done |
| 04 | [Jobs screen](archive/04-job-library.md) | Home: register, preview, new job | Done |
| 05 | [Job workspace](archive/05-cabinet-editor.md) | Editor, drawing, parts, linked tracing, undo | Done |
| 06 | [Cut list and output](archive/06-cut-list-and-output.md) | `buildCutList`, print, PDF, CSV | Done |
| 07 | [Settings, backups, transfer](archive/07-settings-backup-transfer.md) | Shop defaults, backups, `.kerfjob` | Done |
| 08 | [Windows installer](archive/08-windows-installer.md) | Signed installer, updates, release docs | Done |
| 09 | [Construction methods: engine](archive/09-construction-methods-engine.md) | Methods A/B, rules v2, runs, part features | Done |
| 10 | [Construction methods: UI](archive/10-construction-methods-ui.md) | New job choice, Settings, runs, drawings | Done |
| 11 | [Materials and estimate](archive/11-materials-and-estimate.md) | Catalog, slots, purchase estimate | Done |
| 12 | [Sheet optimizer: engine](archive/12-sheet-optimizer-engine.md) | `engine/src/nesting/`, saw profiles, sensitivity | Done |
| 13 | [Layouts: screen and print](archive/13-layouts-screen-and-print.md) | Layouts tab, print, saved layouts | Done |
| 14 | [First run](archive/14-first-run.md) | Shop-defaults check, example job in release builds | Done |
| 15 | [Starting a job](archive/15-starting-a-job.md) | Shorter New job dialog, first cabinet ready to type | Done |
| 16 | [Explaining shop terms](archive/16-explaining-shop-terms.md) | Glossary, info tips, tracing hint, size-entry help | Done |
| 17 | [Next steps](archive/17-next-steps.md) | Cut list button, actionable empty states, Ready-to-cut lock hint | Done |
| 18 | [Help and quick start](archive/18-help-and-quick-start.md) | Help section, printable quick start, small clarity fixes | Done |
| 19 | [DXF export](archive/19-dxf-export.md) | DXF per sheet pattern | Done |
| 20 | [Tall cabinets](archive/20-tall-cabinets.md) | Tall type, fixed shelves, mid nailer, split back | Done |
| 21 | [Dark mode](archive/21-dark-mode.md) | Light / Dark / System switch, dark tokens, print stays light | Done |

Prompts 02–07 share [`docs/interaction-design.md`](../docs/interaction-design.md)
and the prototypes in [`docs/wireframes/`](../docs/wireframes/). Manual checks
that automated tests can't cover are tracked in
[`docs/pending-checks.md`](../docs/pending-checks.md).
