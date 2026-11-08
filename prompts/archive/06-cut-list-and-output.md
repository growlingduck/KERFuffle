# Prompt 06 — Cut List, Print, PDF and CSV

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–05 are done.
> Prerequisite reading for the agent: `docs/interaction-design.md` (§2, §7, §10),
> `docs/wireframes/CutList.dc.html`, `docs/calculation-rules.md`.

---

## Goal

Turn a job into a shop-ready cut list: on screen for review, on paper for the
saw, as a PDF to keep, and as a CSV for spreadsheets. **The printout is the
product.** It must be readable at arm's length, unambiguous, and clear in black
and white.

## Part 1: the cut-list module (pure, in `engine/`)

Add `engine/src/cutlist.ts`, exported from the package and fully tested:

```ts
interface CutListOptions {
  mode: 'merged' | 'by-cabinet';
  includeFronts: boolean;             // drops parts with optional: true
  sort: { key: 'name' | 'length' | 'width' | 'quantity'; dir: 'asc' | 'desc' };
}
buildCutList(cabinets: CabinetSpec[], rules: ConstructionRules, opts): CutList
```

- **Merging**: identical `category + length + width + thickness` = one line. Sum
  the quantities. Join distinct names in a stable order ("Bottom / Top"). Keep
  the per-cabinet counts (`refs: [{cabinetId, quantity}]`).
- **Groups**: panels by thickness (thinnest first), then laminate.
- **Part marks**: P1…/L1… assigned in a fixed canonical order (category,
  thickness, length desc, width desc), **independent of the display sort**, so
  marks stay put when the user re-sorts. The same marks appear in by-cabinet
  mode.
- **Blocked cabinets**: cabinets with validation errors are excluded and listed
  in `blocked` with their issues. The UI shows a banner; printing still works but
  the sheet prints "Excludes B3: needs a fix".
- **Totals**: boxes, panel pieces, laminate pieces, distinct cuts.
- Golden tests: the 5-cabinet sample job from the wireframes (B1–B3, W1–W2)
  produces the expected merged list, marks and totals under `DEFAULT_RULES`.
  Compute the expected values by hand from `docs/calculation-rules.md`; don't
  copy them from the prototype.

## Part 2: the Cut list screen

Follow interaction-design §7 and the prototype: toolbar (Workspace link, Merged /
By cabinet, Include fronts switch, Export CSV, Save PDF, Print…), the sheet
preview with cabinet chips and tracing, sortable columns, and the part-sketch
rail with totals. The rail, toolbar and hover states are screen-only.

## Part 3: print, PDF and CSV

- **Print layout**: a print stylesheet (US Letter portrait by default; A4
  selectable in Settings later), drawn border with zone marks, header and title
  block repeated on every page, `Sheet n / N`, rows that never split across
  pages, a group heading repeated after a page break ("Panels · 3/4″, cont."),
  general notes on the last page. 16 px mono for numbers, black only, nothing
  that depends on color. Empty square checkboxes for pen ticks.
- **Print…** opens the Windows print dialog for the print layout (Tauri webview
  print).
- **Save PDF**: use WebView2's print-to-PDF through Tauri's platform webview
  access (`with_webview` → `ICoreWebView2_7::PrintToPdf`) with the same
  stylesheet, written to a file the user picks (default
  `Documents\KERFuffle\{Job} – cut list.pdf`). If that isn't workable, say why in
  the summary and fall back to printing to "Microsoft Print to PDF". Don't add a
  second rendering path that could disagree with the printout.
- **Export CSV**: UTF-8 with BOM (so Excel opens it correctly), one row per line
  of the current mode. Columns: `Mark, Part, Category, Length (in), Width (in),
  Thickness (in), Length (decimal in), Width (decimal in), Thickness (decimal in),
  Quantity, Cabinets`. Fractions are formatted as on screen; decimals are exact
  to 1/64 (e.g. `28.25`). Include a header comment row with job, number, date
  and options.
- **Feedback**: export buttons go idle → spinner (only over 300 ms) → "PDF
  saved ✓", with a toast that has **Show in folder**. Errors (disk full, file
  open in Excel) appear in plain language with **Try again**.

## Details to get right

- The fronts switch defaults to on and is remembered per job.
- The mode line, title block and CSV header all state the options in use, so a
  printout explains itself ("Identical parts merged · fronts left out ·
  inches").
- Printed date uses an unambiguous format (2026-10-31).
- Revision number on the sheet = the job's `revision` from prompt 03.
- Printing a job in Draft adds a light "DRAFT" stamp to the title block, which
  makes Ready to cut meaningful.

## Done when

- `buildCutList` is pure, tested and exported, and the golden sample passes.
- The screen matches the prototype's behaviors with real jobs.
- A printed or PDF cut list of the sample job is legible in grayscale, with
  correct page breaks for a 40-cabinet stress job (add that fixture).
- The CSV opens in Excel with correct characters and numbers that sort
  numerically.
- A short summary includes a screenshot or PDF path of the sample printout and
  lists any print-engine limitations found.

## Out of scope

Part labels (release 2), cutting progress (release 2), sheet-layout
optimization, material costing.
