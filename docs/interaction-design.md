# KERFuffle Interaction Design

This is the behavior spec for the KERFuffle desktop app. It describes what every
screen looks like, how it responds to hover, focus, click and keyboard input, and
what feedback each action gives. Build prompts 02–07 point here instead of
repeating it.

The interactive prototypes in [`docs/wireframes/`](wireframes/) are the visual
reference. They are self-contained HTML pages in a prototype format; read them
for tokens, layout and behavior, but don't copy their code structure into the app.

| Screen | Prototype | Prompt |
|---|---|---|
| Jobs (home) | [Home.dc.html](wireframes/Home.dc.html) | 04 |
| Job workspace | [Main.dc.html](wireframes/Main.dc.html) | 05 |
| Cut list | [CutList.dc.html](wireframes/CutList.dc.html) | 06 |
| Settings | [Settings.dc.html](wireframes/Settings.dc.html) | 07 |

Where this document and a prototype disagree, this document wins. The prototypes
use simplified math. All real numbers come from `engine/`.

---

## 1. Principles

1. **Data entry is never slowed down.** No animation blocks input, nothing moves
   while the user types, and focus never jumps on its own.
2. **Every number can be traced.** Point at a size and the app shows where it
   comes from and what it changes.
3. **Everything can be undone.** Destructive actions run at once and offer Undo,
   so there are no "Are you sure?" dialogs for routine work. Confirmation is kept
   for the two actions that replace data in bulk: Restore backup and Import over
   an existing job.
4. **The screen reads like a shop drawing.** The drafting motifs (section 2) carry
   meaning; they are not decoration.
5. **Never rely on color alone.** Every state also has a glyph, text, border
   weight or pattern, and every screen and printout must work in black and white.

---

## 2. Visual language: the drafting motif

KERFuffle borrows the conventions of a construction drawing set. Each motif has
a single job:

| Motif | Where | Meaning |
|---|---|---|
| **Grid paper ground** (16 px minor, 96 px major lines) | App background | "Drafting table." Panels sit on it like sheets. |
| **Sheet with registration ticks** (1 px ink border, L-shaped corner marks top-left and bottom-right) | Every main panel | A self-contained drawing. The selected cabinet row gets the same ticks in blue. |
| **View title**: circled bubble + condensed caps title with a 2 px underline + mono sub-line | Panel headers | Bubble numbers 1–4 identify the workspace panels; letters A, B… identify drawing views and details. |
| **Title block** (ruled grid of small caps labels over values) | App header, cut-list footer, job preview, New job dialog | Job identity and metadata, the way a drawing sheet has it. |
| **Dimension lines** with 45° slash ticks, extension lines with a gap, value centered on the line | Drawings, part sketch, settings details | A real measurement. Interactive in the workspace. |
| **Chain dimensions** (countertop / box / toe kick stacked, overall outside) | Base-cabinet elevation | Shows the box-height derivation. |
| **Section hatching** (45° lines) | Parts cut by a section view | That part is shown in section. |
| **Light hatch** | Back panel seen through the box opening | A surface seen beyond the cut. |
| **Centerline** (long-short dash, ℄ symbol) with section-cut arrow **B** | Front elevation | Says where section B is taken. |
| **Dashed outline** | Oversize laminate, toe kick | Not a carcass part, or cut oversize. |
| **Dash-dot outline** | Front reference size | A reference size, not a box part. |
| **Balloon** (circled number) | Parts table + drawing caption | Part number on this cabinet. |
| **Part mark** (boxed P1…, L1…) | Cut list rows, part sketch, future labels | Stable identity of a distinct cut across the job. |
| **Revision delta** △n | Parts rows after an edit | "This row changed in revision n." |
| **Rubber stamp** (double border, condensed caps, rotated −2°) | Job status | Draft ○, Ready to cut ◆, Completed ✓, Archived ▭. |
| **Zone marks** (1–4 across, A–D down) and sheet border | Printed cut list | A real drawing sheet; lets people say "row in B2". |
| **General notes** (numbered) | Printed cut list | Conventions printed on every sheet. |
| **Symbol chips** (W, H, D, n, ×) | Field labels, drawing caption | Ties a field to its dimension in the drawing. |
| **Calc tape** (dashed box, mono terms) | Workspace editor | Shows the arithmetic, e.g. `36″ − 4″ − 1 1/2″ = 30 1/2″`. |

### Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `ink` | `#1B1D1F` | `#E3E8EF` | Text, borders, drawing lines |
| `ink-2` | `#2B2D30` | `#A9B6C6` | Panel borders |
| `muted` | `#4A4C50` | `#AAB4C1` | Secondary text (≥ 7:1 on white / on the dark sheet, vellum and paper) |
| `muted-2` | `#63656A` | `#939EAC` | Units, captions (≥ 5.5:1) |
| `disabled-text` | `#6F7177` | `#87929F` | Disabled labels (≥ 4.5:1) |
| `rule` | `#9A9C9F` / `#D9D7CF` / `#E6E4DC` | `#5D6A7B` / `#2C3949` / `#243041` | Input borders / dividers / table rules |
| `line-light` | `#8E9095` | `#66727F` | Centerlines, grain, hidden edges |
| `white` | `#FFFFFF` | `#172231` | Sheets, inputs, menus: the surface panels are drawn on |
| `paper` | `#F2F1EB`, grid `#E2E0D7` / `#EBE9E1` | `#0E1621`, grid `#1D2A3A` / `#152030` | Ground |
| `vellum` | `#FAF9F5` | `#131C29` | Calc tape, drawing backgrounds |
| `sheet-ink` | `#000000` | `#E3E8EF` | Rules and text on the printable sheets (pure black on paper) |
| `blue` | `#1F4FA3`, hover `#163A7A` | `#8FB3F5`, hover `#B5CDFA` | Primary action, selection, traced dimensions |
| `on-blue` | `#FFFFFF` | `#0E1621` | Text on a solid blue fill |
| `blue-tint` | `#E3EBF7`, strong `#C9D8F0`, row `#DCE6F6` | `#1C3050`, strong `#284673`, row `#22395E` | Highlight fills |
| `red` | `#B3261E`, tint `#FDF3F2` | `#FF8F84`, tint `#331A1D` | Errors only |
| `amber` | `#7A4300` text, highlighter `#FBE7A1` | `#F2B35B` text, highlighter `#5C4712` | Warnings; "just changed" highlighter |
| `green` | `#2B6B3F` | `#7DD098` | Saved, completed |

Use blue for "this is what you're pointing at or selected" and red only for
errors. A changed value is shown in highlighter yellow, never red.

**Themes** (prompt 21). Light · Dark · System, chosen in Settings (top) or with
the header's theme button, and kept per PC, not in shop settings. Dark is a
blueprint: navy ground, faint grid, sheets one step lighter, pale ink. Every
token has the same name in both themes, so drawings redraw without a reload.
Inverted surfaces (toast, tooltip, segmented thumb) invert in dark too: the
toast becomes a light slip on the dark page. **Printing is always light**:
under `@media print` the light set wins whatever the theme. All colors live in
`tokens.css`; `test/themeTokens.test.ts` fails on a hex or rgb() anywhere else
in `app/src` (the dev gallery excepted).

**Type.** IBM Plex Sans (body), IBM Plex Sans Condensed (all-caps labels, view
titles, stamps, tabs), IBM Plex Mono with tabular numerals (every dimension).
Bundle the fonts with the app (SIL OFL); the app must look right offline.
Dimensions are 15–17 px in inputs and tables and 16 px on paper.

**Shape.** 3 px radius on controls and 0–2 px on sheets. Square, drawn and
ruled; no pill buttons, gradients or soft cards.

---

## 3. Motion

| Token | Duration | Easing | Used for |
|---|---|---|---|
| `instant` | 80 ms | linear | Button press offset (1 px down) |
| `fast` | 120 ms | ease-out | Hover fills, border color, tooltips fading in |
| `base` | 180–200 ms | `cubic-bezier(.2,0,0,1)` | Segmented thumb, tab underline, menus, disclosure, toast in |
| `slow` | 1.2–1.4 s | ease-out | "New row" sweep, fading out (never blocks input) |
| `highlight` | 2.6 s | ease-out | Highlighter fading from changed cells |

Rules:
- Tooltips wait 400 ms (hover intent), then fade in over 140 ms. They show on
  keyboard focus too.
- Never animate a number counting up, and never re-flow a table while the user
  types: values update in place.
- `prefers-reduced-motion: reduce` turns all durations to ~0 and keeps the end
  states (highlights still appear, without the fade).
- Menus open with a 4 px drop plus a fade. Dialogs fade the scrim and pop the
  panel.
- Spinners only appear for work that takes over 300 ms (saving, exporting,
  backing up). Below that, go straight to the done state.

---

## 4. Shared components and states

Every interactive element needs all of these states: rest, hover, focus-visible
(2 px blue outline, 2 px offset), active/pressed, disabled, and where relevant
selected, invalid and busy.

| Component | Behavior |
|---|---|
| **Button** | 40–44 px tall. Hover darkens the fill; active moves it 1 px down. Primary is solid blue. A disabled button keeps its label and shows why in a tooltip ("Nothing to undo"). |
| **Icon button** | Square, 32–40 px, always has `aria-label` and a matching tooltip. |
| **Segmented control** | A dark thumb slides under the selected option (200 ms). Each option is a toggle button with `aria-pressed`. |
| **Switch** | `role="switch"`. The knob slides 16 px and the track fills blue when on. The label is clickable. |
| **Tabs** (app nav) | Condensed caps. Hover grows a 3 px underline to 35%; the current tab shows the full line. `aria-current="page"`. |
| **Dimension input** | Mono 17 px, unit suffix `in`, symbol chip in the label row. See 5.3. |
| **Stepper** | − / input / +. − is disabled at the minimum. Each click is one undo step. |
| **Menu** | Opens under its trigger. Esc or a click outside closes it; arrow keys move between items; focus returns to the trigger. |
| **Toast** | Bottom center, dark, at most one at a time (a new one replaces the old). A 3 px bar drains over 6 s. May carry one action (Undo or Open). Pauses while hovered or focused. `role="status"`. |
| **Tooltip** | Dark, 12 px, short. Never the only way to get information that's needed to finish a task. |
| **Status stamp** | Glyph + text, rotated −2° on screen, flat in menus and print. |
| **Disclosure** | Chevron rotates 90°. Content expands with a grid-rows 0fr→1fr transition, so there's no height jump. |
| **Dirty bar** | Sticky bottom bar on Settings while there are unsaved changes: count, Discard, Save. Slides up 16 px. |

---

## 5. Job workspace (prompt 05)

Three columns, all of which wrap on narrow windows: **1 Cabinets**, **2 Cabinet
editor**, then **3 Drawing** above **4 Parts**.

### 5.1 Header title block
- Cells: Job | Customer | Status | Saved | Undo · Redo · Export, then
  Help · Shortcuts, which every screen has (prompt 18). **Help** is a link to
  Settings → Help.
- **Status stamp** is a button that opens a menu of the four statuses. Choosing
  one saves and shows a toast with **Undo** ("Marked completed"). On a draft,
  **Ready to cut** carries a second line, "Locks construction", and its toast
  says "Marked ready to cut. Construction is locked." No confirmation dialog.
- **Saved cell**: "Saving…" with a spinner while a write is in flight, then a
  check that draws itself and "Saved 9:41 AM". Never show "Saving…" for under
  300 ms.
- **Undo / Redo** tooltips name the step: "Undo: Change width on B1". They're
  disabled with "Nothing to undo" when the stack is empty.
- **Shortcuts** opens a popover listing every shortcut with keycaps (section 9).

### 5.2 Cabinet list
- Each row has a mini elevation thumbnail (true proportions, shelves, dark bars
  for finished ends, toe kick and countertop on base cabinets), the ID in
  condensed bold, type, `W × H × D` in mono, finished ends, and a ×n badge when
  the quantity is over 1.
- A row with invalid sizes shows a red dashed "?" thumbnail and "⚠ Needs a fix".
- **Hover** darkens the border and reveals Duplicate and Remove icon buttons
  (always visible on the selected row and when the row has focus).
- **Selected**: blue border, tint, blue registration ticks.
- **Click** selects. Selecting clears any pinned part and revision marks.
- **Keyboard**: ↑/↓ move the selection and focus; Delete removes; Ctrl+D
  duplicates.
- **Remove** slides the row out 14 px and fades it (180 ms), then a toast reads
  "Removed B3" with **Undo**. You can't remove the last cabinet (disabled, with a
  tooltip saying why).
- **Duplicate** inserts the copy right after the original with the next free ID
  (B4, W3…) and selects it. The new row gets a blue sweep that fades over 1.3 s.
- **Add cabinet** is a split button. The main part adds a cabinet of the current
  type at a sensible default size. The ▾ part opens a preset menu (base and wall,
  12–36″) with a thumbnail and size for each preset.

### 5.3 Editor fields
- Width, Height (overall), Depth: mono input, `in` suffix, symbol chip W/H/D.
- **Accepted input**: `23`, `23.75`, `.75`, `23 3/4`, `23-3/4`, `3/4`, with an
  optional `"` or `″`. The engine's `parseDimension` is the only parser.
- **Message line** (fixed 18 px height, so nothing jumps):
  - while focused: `Reads as 23 3/4″ · ↑↓ nudges 1/16″`
  - unfocused, when the typed form differs from the canonical one: `Reads as 23 3/4″`
  - error: red border, red tint, `⚠` plus a plain message, and `aria-invalid`
  - warning (implausible size): amber `△` message; nothing is blocked.
- **Keys**: ↑/↓ nudge by 1/16″, Shift+↑/↓ by 1″ (exact, written back at 1/64″
  precision); Enter commits (blurs); Esc reverts to the value when the field was
  focused.
- **Commit model**: values recalculate live as you type, but the undo step,
  autosave and revision marks happen **on commit** (blur or Enter), never per
  keystroke.
- **Calc tape** under the fields shows box height: base `H − t − T = Hb`, wall
  `H = Hb`. Each term highlights its dimension when pointed at.
- Shelves and Quantity are steppers. Cabinet ID is a text field.
- **Type** (Base / Wall) is a segmented control. Switching to Wall hides the
  toe-kick and countertop rows and changes the drawing at once.
- **Finished ends** is four large toggle tiles (Neither / Left / Right / Both),
  each with a pictogram. The selected tile has a 2 px blue border and tint.
- **Construction** disclosure: the job's copy of the rules, read-only here, with
  "Matches shop defaults ✓" or "Differs from shop defaults (n)". Pointing at a
  rule traces it (5.5).

### 5.4 Drawing
- Two views at one shared scale: **A Front elevation** and **B Section**. The
  scale is shown as `SCALE ≈ 1:n`.
- Elevation: sides, top and bottom as panel edges, the back as light hatch
  through the opening, shelves at even spacing, finished-end laminate as solid
  bars, countertop band and dashed toe kick on base cabinets, centerline with a
  section-B arrow.
- Section: top, bottom, back and shelves hatched; shelf setback visible at the
  front.
- Dimensions: W under the elevation, D under the section, H on the right. Base
  cabinets use a chain of countertop / box / toe kick plus the overall height.
  Labels too long for their segment move beside it.
- **Toggles**: Dimensions (on by default) and Oversize (shows the front reference
  and laminate oversize outlines all the time).
- **Caption bar** (fixed height, under the drawing) describes whatever is being
  traced: a part (balloon, name, `L × W × T`, qty) or a dimension (symbol, name,
  value, "→ changes back, bottom, top…"). At rest it shows a one-line hint.
- With invalid sizes, the drawing becomes a red dashed placeholder with
  **Go to width** (focuses the first invalid field).

### 5.5 Linked tracing: the core interaction

There is one **trace key** at a time: a dimension (`w h box toe ctop d shelves
ends qty`) or a rule (`p cl sb wide lam`). It comes from hover first, then
focus. Separately there is one **hot part** (hover first, then pinned).

When a trace key is active:
1. Its **field** gets a blue ring and its symbol chip turns solid blue.
2. Its **dimension** in the drawing turns blue and thicker, and its label gets a
   tinted box.
3. Every **part that depends on it** gets a blue tint in the drawing.
4. In the parts table, **only the affected cell** (Length, Width, Thick. or Qty)
   gets a blue tint and underline, not the whole row.
5. The caption lists the affected parts.

The dependency map lives in code next to the engine, so it can't drift from the
formulas, and it is unit-tested:

| Key | Affects |
|---|---|
| `w` | back.W, bottom.L, top.L, front.W, shelf.L, lam-front.W |
| `h`, `box`, `toe`, `ctop` | back.L, sides.L, front.L, all laminate L |
| `d` | bottom.W, sides.W, top.W, shelf.W, end laminate W |
| `shelves` | shelf.qty |
| `ends` | end laminate qty |
| `qty` | every qty |
| `p` | bottom/top L·T, sides W·T, back/front T, shelf L·W |
| `cl` | shelf.L |
| `sb` | shelf.W |
| `wide` | shelf.T |
| `lam` | all laminate L·W |

When a part is hot (hovering a table row or a drawing shape, or a focused row
button):
- That part fills blue in **both** views; every other part fades to 30%.
- Its row turns blue and its balloon fills.
- Oversize or reference outlines for that part appear even when the Oversize
  toggle is off.
- **Click** pins the part (click again to unpin). A pinned part stays traced
  until something else is pointed at or the cabinet changes.

Clicking a dimension in the drawing focuses and selects its field. Clicking
toe kick or countertop opens the Construction disclosure.

### 5.6 Revision marks
After each commit, undo or redo, the engine result is compared part by part with
the result before. For each changed part:
- the changed cells flash highlighter yellow (2.6 s fade);
- a △n button appears in the last column (n = revision counter), with the
  tooltip "Was 28 1/4 × 23 1/8 × 3/4, qty 1";
- the marks fade after 4 s. They're cleared when the selection changes.

This is how the vision's "subtle highlighting of dimensions affected by an edit"
works.

### 5.7 Parts table
Columns: balloon + part, Grain (↕ / ↔ with a tooltip), Length, Width, Thick.,
Qty, △. Laminate gets its own table with no thickness column. The Front row is
italic with a **REF** tag ("Door / front-laminate size. Optional on the cut
list."). A 1″ shelf carries a note: "△ 1″ thick: cabinet is 36″ or wider". A
footnote explains inches, ≈, grain and oversize. Once any cabinet makes parts,
the panel head has a primary **Cut list →** button (tooltip "Ctrl + L"), with
"⚠ n cabinets need a fix" beside it while any do; it never blocks. Before that,
a small "Whole-job cut list →" link.

---

## 6. Jobs / home (prompt 04)

- Heading: "Drawing register / Jobs". Actions: Import job…, **New job**.
- **Search**: icon, placeholder "Job, customer or job number", a `/` keycap hint
  when empty, × to clear, Esc clears. Matches are highlighted with `<mark>` in
  name and customer.
- **Show** segmented control: Active (n) · All (n) · Archived (n), with live
  counts.
- **Table**: No. (J-0014), Job + customer, Status stamp, Cabinets (a 120 × 34
  elevation strip, bases taller than walls, plus the count), Last edited,
  actions. Job, Status and Last edited headers sort when clicked (▲/▼ and
  `aria-sort`).
- **Row hover or focus**: tint; reveals Open and a Cut list icon; updates the
  **Job preview** panel.
- **⋯ menu**: Open, Duplicate, Export job file…, Mark as (other statuses),
  Archive / Restore from archive.
- **Duplicate** inserts "(copy)" above the original as Draft with a sweep, and a
  toast with **Open**.
- **Archive** (or any status change that hides the row from the current filter)
  slides the row out 24 px, then shows a toast with **Undo**.
- **Job preview** (right): elevation of the whole job (walls hung over bases on a
  hatched floor line, cabinet IDs, a blue "BASE RUN 9′-0″" dimension), then a
  title block (job, no., customer, status, boxes, panel pieces, laminate pieces,
  notes), then Open job / Cut list / Duplicate.
- **New job** dialog: modal over a scrim, as a title-block sheet. Fields: Job
  name (required; focused on open), Customer, Start with (empty or copy of a
  job), Notes. A dashed panel shows the construction values that will be copied
  from the shop defaults. Create with an empty name marks the field `⚠ Give the
  job a name` and focuses it. A duplicate name is an amber note, not an error.
  Esc closes.
- **Backup strip**: "Last automatic backup today, 8:02 AM · 14 backups kept",
  **Back up now** (inline progress bar, then a toast), **Restore backup…** (a
  popover listing backups → a confirm step explaining that the current jobs are
  backed up first → toast).
- **Empty states**: no matches (drawing of an empty sheet + Clear search),
  nothing archived, first run ("No jobs yet. Start one with New job.").

---

## 7. Output: cut list, layouts and estimate (prompt 06)

- **Output** (header tab, Ctrl+3) holds the three pages a job puts out. Under the
  header, a pinned bar: **sheet tabs** Cut list · Layouts · Estimate, each with a
  mono line saying what's on it ("43 boxes · 539 pieces", "44 sheets",
  "$2,340.00"). The selected tab is white and opens into the white options row
  below, like the tabs of a drawing set: pages of one job, not settings or steps.
  ←/→ move between tabs. Workspace is the header tab (or Ctrl+L), so there is no
  back button.
- **Options row**: the page's own options, then its outputs at the right. Cut
  list and Estimate: List: Merged / By cabinet · switch "Include fronts
  (door / laminate size)", on by default. Layouts: Mode · Saw · Material.
- **Outputs**, the same on every page, at the right of the options row:
  Export CSV… (Layouts: Export DXF…) · Save PDF… · **Print…** (Ctrl+P). Each
  opens a dialog, hence the "…". While a page has nothing to put out (Layouts
  still searching), all three are disabled with the same reason.
- **Export buttons** change in place: icon → spinner "Saving…" → green check "CSV
  saved", plus a toast naming the file; they go back to rest after 4 s.
- **Sheet**: a letter page with a 2 px border, zone marks, header (KERFuffle ·
  cut list, job name, mode line), **cabinet chips**, groups, general notes and a
  title block (job, no., customer, status, printed date, N.T.S., revision, cut by
  / checked by boxes, contents, sheet n / N).
- **Groups** (merged mode): Panels by thickness, then Laminate. Each group has a
  piece count. Columns: ☐, Mark, Part, Grain, Length, Width, Qty, From cabinets
  (B1, B3×2…). Part, Length, Width and Qty sort (default Length, longest first).
- **Merging**: same category + length + width + thickness = the same cut. Names
  join ("Bottom / Top"). Part marks P1…/L1… are assigned in printed order and
  stay stable when the user re-sorts.
- **By-cabinet mode**: one section per cabinet with a thumbnail, sizes, "build
  n", and its parts with thickness.
- **Cabinet chips**: hover traces that cabinet (its refs fill blue; rows without
  it fade to 28%). Click pins the filter; **Show all** clears it. Pointing at a
  row lights up the chips of the cabinets it comes from.
  By cabinet, each cabinet is its own section, so the chips are an **index**
  instead: each shows the sheet its cabinet starts on ("B7 · sheet 3", printed
  too), and a click scrolls to that section, focuses it and flashes it once.
- **Part sketch rail** (screen only, never printed): the pointed-at or pinned
  row drawn to scale with grain lines, a GRAIN arrow along the length, L and W
  dimensions, thickness / qty / mark, and "from B1, B3 ×2". Plus totals: boxes,
  panel pieces, laminate pieces, distinct cuts.
- **Print**: page breaks fall between groups where possible; header and title
  block repeat on every page; rows never split; numbers print in black at 16 px
  mono; checkboxes are empty squares for pen ticks. Screen-only parts (rail,
  toolbar, hover tints) are hidden.

---

## 8. Settings (prompt 07)

- Section nav: 01 Construction · 02 Display · 03 Backups.
- **Theme** (prompt 21), above the sections: Light · Dark · System segmented
  control, System by default. Applies at once; not part of Save, since it is a
  per-PC viewing preference.
- **Construction defaults**: one row per rule (label + help, mono input with
  unit, status). Status is "Default 3/4″", "◆ Changed from 3/4″ · **Reset**", or
  "⚠ error". Changed inputs get a 1.5 px ink border.
- Banner: "New jobs copy these. **Existing jobs keep their own copy.**"
- **Wide shelves start at**: radio between "36″ and wider" (shop rule) and
  "Wider than 36″".
- **Detail panel** (sticky, right): pointing at or focusing a rule shows its
  enlarged detail drawing, redrawn live as the value changes, with a lettered
  bubble, a scale note, a one-line explanation and an **effect line** computed
  by the engine (e.g. `30″ cabinet → shelf 28 1/4″ long`):
  - A panel joint · B toe kick / countertop chain · C shelf clearance gap ·
    D shelf setback section · E laminate oversize corner · F wide-shelf
    comparison.
- **Display**: units (Inches; Millimetres shown disabled, "later"); "round shown
  sizes to" 1/8, 1/16 (shop) or 1/32, with three live samples (shown vs exact).
- **Backups**: folder path with Open folder / Change…; keep the latest n
  (stepper) with an estimated size.
- **Dirty bar**: appears with the first change: "n unsaved changes · applies to
  new jobs only". Discard / Save defaults. Save is disabled while any field is
  invalid. Leaving the screen with unsaved changes asks Save / Discard / Cancel.
- **Advanced** (prompt 18): Saw profiles and Display carry a small "Advanced"
  tag in the section nav. They're never hidden or moved.
- **Help** (07, prompt 18, after About): **Your first job** in six numbered
  steps, each linking to its place (Settings → Construction, Jobs → New job
  at `#/jobs/new`, which opens the dialog, then the last job's Workspace and
  Cut list); **Words and symbols**, rendered from `app/src/lib/glossary.ts`
  (no second copy of the text); **Show keyboard shortcuts**; and **Add the
  example job** (moved here from About). **Print quick start** prints the steps
  and the words on one Letter page, in the cut list's sheet frame. Settings
  itself never prints: printing from Settings prints only that sheet.

---

## 9. Keyboard map

| Keys | Action | Scope |
|---|---|---|
| Ctrl+Z / Ctrl+Shift+Z (also Ctrl+Y) | Undo / redo | Workspace |
| Ctrl+N | Add cabinet (workspace) / New job (home). The Add cabinet and New job buttons say so in their tooltips. | Workspace / Jobs |
| Ctrl+D | Duplicate selected cabinet / job | |
| Delete | Remove selected cabinet (list focused) | |
| Alt+↑ / Alt+↓ | Previous / next cabinet from anywhere in the workspace | |
| ↑ / ↓ | Nudge a dimension 1/16″ · move in lists and menus | |
| Shift+↑ / Shift+↓ | Nudge a dimension 1″ | |
| Enter / Esc | Commit / revert a field · close a menu or dialog | |
| / | Focus search (home) | |
| Ctrl+L | Open the cut list | Job |
| Ctrl+P | Print the cut list | Job |
| Ctrl+1…4 | Jobs / Workspace / Cut list / Settings | Global |
| ? | Show shortcuts | Global, when not typing |

Shortcuts never fire while the user types in a text field, except Ctrl+Z/Y and
Enter/Esc, which act on the field.

Tab order follows the visual order: header → cabinets → editor → drawing toggles
→ parts. Every hover-only reveal must also appear on focus.

---

## 10. Accessibility checklist

- Text contrast ≥ 4.5:1, including small labels. Large drawing labels ≥ 3:1.
- Targets ≥ 40 px (44 px for primary actions).
- Real `<button>`, `<a>`, `<input>` and `<label>` elements. Icon buttons have
  `aria-label`. Toggle buttons use `aria-pressed`, switches `role="switch"`,
  sortable headers `aria-sort`.
- The drawing SVG has `role="img"` and a sentence-long `aria-label` with the
  cabinet's sizes. Part tracing is also reachable from the table's row buttons.
- Errors are linked with `aria-describedby` and `aria-invalid`. Status changes
  (saved, toasts) use `role="status"`.
- Run axe on every screen in CI. No violations of `serious` or `critical` impact
  are allowed.

---

## 11. Don'ts

- No layout shift while typing or tracing (fixed-height message lines and
  caption).
- No modal confirmation for routine deletes; use Undo.
- No color-only status, no red for "changed".
- No spinners for work under 300 ms, and no fake progress.
- No scroll-jacking or forced scrolling (except bringing a newly added row into
  view if it is offscreen).
- No hover-only information needed to finish a task.
