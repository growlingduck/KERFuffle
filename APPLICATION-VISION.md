# KERFuffle Application Vision

## Purpose

Resurrect the legacy cabinet cut-list calculator as a polished Windows desktop
application for personal use on two PCs.

The target workflow is:

**Install -> create a job -> add cabinets -> review parts -> print a shop-ready cut list.**

Everyday use should work offline without an account, subscription, or Excel
installation. This document distinguishes observed legacy features from proposed
features; recommendations are not yet implementation commitments.

## 1. Existing Features

The legacy application describes a cabinet, applies construction rules, and
generates the parts needed to build it.

| Area | Existing capability |
|---|---|
| Cabinet types | Base cabinets and wall cabinets with different sizing rules. |
| Cabinet dimensions | Width, height, and depth inputs. |
| Construction settings | Panel thickness, toe-kick height, and countertop thickness. |
| Shelves | Shelf count and automatic shelf thickness selection based on cabinet width. |
| Cabinet identification | Cabinet IDs carried into generated cut lists. |
| Finished ends | Neither, left, right, or both sides finished. |
| Part calculations | Dimensions and quantities for the back, bottom, left side, right side, top, front, and shelves. |
| Laminate calculations | Front laminate and applicable finished-side pieces, including oversizing allowances. |
| Calculation preview | Displayed parts update when inputs change or lose focus. |
| Combined cut lists | Multiple cabinets can be added to separate cabinet-part and laminate lists within the current page session. |

### Sources reviewed

- [Legacy calculator interface](legacy/calculator/site/index.html)
- [Legacy calculation logic](legacy/calculator/site/includes/js/main.js)
- [Legacy formula notes](legacy/calculator/site/includes/js/notes.js)
- [Excel workbook](legacy/calculator/CutList.xlsm): worksheet labels and formulas
  inspected without executing macros.

### Current limitations

The web version does not provide:

- Persistent saved jobs or reopening previous work.
- Editing or removing cabinets after adding them to the cut list.
- Dedicated print layouts or PDF/CSV export.
- Material purchasing estimates.
- Sheet-layout optimization.

### Calculation verification before rebuilding

Treat the legacy formulas as shop knowledge to verify, not automatically
authoritative specifications.

Known differences or questions include:

- The spreadsheet changes shelf thickness when cabinet width is greater than 36;
  the web version changes it at 36 or greater.
- Some wall-cabinet calculations retain toe-kick and countertop deductions that
  should be reviewed.
- Units, clearances, laminate oversizing, and the intended meaning of the
  calculated front panel need explicit confirmation.

Before implementation, establish trusted examples with both users covering base
and wall cabinets, finished-end options, shelf counts, and the shelf-thickness
boundary. Use those examples as regression tests.

## 2. Recommended First Release

### Saved-job library

Store jobs inside the application rather than requiring users to manage
spreadsheets.

Each job should contain:

- Job name, customer or project, notes, and timestamps.
- Multiple cabinets, optionally organized by room or area.
- Construction settings and material selections.
- Automatically generated cut lists.
- Status: Draft, Ready to Cut, Completed, or Archived.

The home screen should provide recent jobs, search, sorting, and clear New Job,
Open, and Duplicate actions.

Include autosave, a visible saved indicator, and recovery after an unexpected
shutdown. Jobs should retain their own construction settings so changing defaults
does not silently alter previous work.

### Cabinet editor

- Add, edit, duplicate, and remove cabinets.
- Specify quantities for repeated cabinets.
- Use presets for common cabinet sizes.
- Enter fractional dimensions such as `23 3/4` as well as decimals.
- Display units clearly; ideally support inches and millimeters.
- Validate inputs immediately with explanatory messages.
- Support undo/redo for common changes.
- Show a labeled cabinet diagram identifying measurements and finished ends.

A clear diagram is a higher priority than full interactive 3D for the first
release.

### Shop-ready output

- Per-cabinet parts and whole-job cut-list views.
- Separate structural-panel and laminate sections.
- Grouping by material and thickness.
- Optional consolidation of identical parts while retaining cabinet references.
- Readable print layouts with job name, date, and page numbers.
- PDF and CSV export.
- Printable part labels with cabinet ID, part name, dimensions, and quantity.

Label length, width, thickness, and quantity explicitly rather than relying on
ambiguous single-letter headings.

### Local storage and backup

Recommended approach:

- App-managed local SQLite database.
- Automatic rotating backups.
- Export Job and Import Job for moving work between PCs.
- Back Up All Jobs and Restore Backup workflows.

Transferring jobs is distinct from simultaneous collaboration. Defer live
synchronization unless it is needed. Do not use a shared cloud-folder database
as a shortcut for multi-PC editing.

## 3. Related Feature Opportunities

| Feature | Benefit | Suggested priority |
|---|---|---|
| Shop construction presets | Save agreed material thicknesses, shelf clearances, laminate allowances, and construction rules. | First release, kept simple |
| Material totals | Summarize panel and laminate area by material and thickness. | Next |
| Basic costing | Estimate materials, waste allowance, hardware, and optional labor. | Next |
| Cutting progress | Mark parts as cut, labeled, or assembled. | Next |
| Edge-banding requirements | Identify finished edges and total banding length. | Next |
| Sheet-layout optimization | Arrange parts on stock sheets with saw kerf, trim margins, grain direction, and rotation restrictions. | Later |
| Offcut inventory | Track reusable leftovers for future jobs. | Later |
| Additional cabinet families | Add tall cabinets, drawer units, corner cabinets, and other construction-specific types. | As needed |
| Expanded visual previews | Provide exploded views or lightweight 3D for assembly clarity. | Later |
| Shared job synchronization | Keep both PCs current with conflict handling and recovery. | Only if needed |

Saw kerf is not currently a calculator input. It becomes particularly relevant
when introducing sheet layouts and cutting plans.

Area-based estimates must not be presented as exact sheet counts: actual yield
depends on part arrangement, grain direction, and cutting constraints.

## 4. UX and Animation Direction

Aim for a calm, precise workshop tool rather than a flashy dashboard.

### Suggested application structure

- **Home:** recent and archived jobs.
- **Job workspace:** cabinet list on the left, selected cabinet editor in the
  center, and diagram/calculated parts on the right.
- **Cut List:** dedicated review, export, and print view.
- **Settings:** shop defaults, materials, units, and backups.

### Purposeful animation

- Short transitions when opening jobs or switching cabinets.
- Brief highlighting when a cabinet is added.
- Subtle highlighting of dimensions affected by an edit.
- Smooth expansion of optional settings.
- Clear feedback for saving, exporting, and completing actions.

Target approximately 120-200 ms for most transitions and respect reduced-motion
preferences. Avoid animated number counting, layout jumps while typing, forced
scrolling, and effects that slow repetitive data entry.

### Usability priorities

- Readable text, strong contrast, and generous click targets.
- Excellent keyboard navigation and a sensible tab order.
- Consistent fraction formatting.
- Units visible wherever dimensions appear.
- Errors displayed beside the relevant field.
- Confirmation or undo for destructive actions.
- No color-only status indicators.
- Printouts that remain clear in black and white.

## 5. Technology and Windows Installation

### Recommended starting point

Consider Tauri with a React/TypeScript interface and SQLite for local storage.
This supports a polished desktop interface and typically a smaller installation
than Electron.

.NET/WPF is also a reasonable alternative for a strictly Windows-only product,
particularly if native Windows development is preferred.

The framework decision remains open; it should support the required installer,
printing, storage, accessibility, and maintenance workflows.

### Professional installer expectations

- Signed Windows installer and signed application releases.
- Current-user installation without unnecessary administrator prompts.
- Start-menu entry and optional desktop shortcut.
- Bundled or properly handled runtime prerequisites.
- Offline everyday operation.
- Safe, versioned database upgrades with backups.
- An update process that does not interrupt active work.
- Uninstallation that preserves jobs unless the user explicitly removes them.

Budget for code signing. It establishes publisher identity but does not guarantee
that Windows will never display a reputation warning.

## 6. Proposed Delivery Sequence

### First release: trustworthy daily use

- Verify and preserve intended cabinet calculations.
- Add persistent jobs and a polished cabinet editor.
- Provide useful diagrams and clear validation.
- Implement reliable backups and job transfer.
- Produce excellent printed and PDF cut lists.

### Second release: workshop efficiency

- Material summaries and basic costing.
- Part labels.
- Cutting and assembly progress.
- Edge-banding requirements.

### Later: advanced planning

- Sheet optimization and offcut inventory.
- Additional cabinet families.
- Expanded visual previews.
- Collaboration, only if justified by actual use.

## 7. Decisions to Confirm

- Authoritative construction rules and trusted example cabinets.
- Primary units and preferred fractional precision.
- Whether jobs will only be transferred or need simultaneous editing.
- Required Windows versions and installation constraints.
- Print format, label stock, and shop output preferences.
- Technology choice after validating desktop integration needs.

## Success Criterion

Both users can install the application, confidently prepare a real job, close
it, reopen it, and take an accurate, readable cut list into the shop.

Success is a complete, dependable workflow, not merely the old website running
inside a desktop window.
