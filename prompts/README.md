# Build prompts

Run these in order, each in a fresh coding-agent session at the repo root. Each
prompt lists its prerequisites and a "Done when" checklist. Don't start the next
one until the checklist passes.

| # | Prompt | Delivers | Status |
|---|---|---|---|
| 01 | [Calculation engine](01-calculation-engine.md) | `engine/`, `docs/calculation-rules.md` | Done |
| 02 | [App shell and design system](02-app-shell.md) | Tauri + React app, tokens, shared components, keyboard | |
| 03 | [Job storage](03-job-storage.md) | SQLite, autosave, crash recovery | |
| 04 | [Jobs screen](04-job-library.md) | Home: register, preview, new job | |
| 05 | [Job workspace](05-cabinet-editor.md) | Editor, drawing, parts, linked tracing, undo | |
| 06 | [Cut list and output](06-cut-list-and-output.md) | `buildCutList`, print, PDF, CSV | |
| 07 | [Settings, backups, transfer](07-settings-backup-transfer.md) | Shop defaults, backups, `.kerfjob` | |
| 08 | [Windows installer](08-windows-installer.md) | Signed installer, updates, release docs | |
| 09 | [Construction methods: engine](09-construction-methods-engine.md) | Methods A/B, rules v2, runs, part features | |
| 10 | [Construction methods: UI](10-construction-methods-ui.md) | New job choice, Settings, runs, drawings | |
| 11 | [Materials and estimate](11-materials-and-estimate.md) | Catalog, slots, purchase estimate | |
| 12 | [Sheet optimizer: engine](12-sheet-optimizer-engine.md) | `engine/src/nesting/`, saw profiles, sensitivity | |
| 13 | [Layouts: screen and print](13-layouts-screen-and-print.md) | Layouts tab, print, saved layouts | |
| 14 | [DXF export](14-dxf-export.md) | DXF per sheet pattern | |

Prompts 02–07 share [`docs/interaction-design.md`](../docs/interaction-design.md)
and the prototypes in [`docs/wireframes/`](../docs/wireframes/).
