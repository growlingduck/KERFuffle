# Prompt 07 — Settings, Backups, and Moving Jobs Between PCs

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–06 are done.
> Prerequisite reading for the agent: `APPLICATION-VISION.md` (§2 "Local storage and
> backup"), `docs/interaction-design.md` (§8, and §6 for the backup strip),
> `docs/wireframes/Settings.dc.html`, `docs/calculation-rules.md`.

---

## Goal

Let the shop own its defaults, never lose work, and move jobs between the two
PCs safely. This prompt delivers the Settings screen, automatic rotating backups
with restore, and Export / Import of single jobs.

## Part 1: Settings screen

Follow interaction-design §8 and the prototype:
- **Construction defaults**: every field in `ConstructionRules` that the shop
  sets (panel thickness, toe kick, countertop, shelf thickness, wide-shelf
  thickness, wide-shelf width and comparison, shelf clearance per side, shelf
  setback, laminate oversize per edge). Use `DimensionInput`. Clearance and
  setback accept 0. The legacy-reproduction flags are **not** shown.
- The banner "New jobs copy these. Existing jobs keep their own copy."
- Per-field "Changed from … · Reset", a dirty bar with Discard / Save, a guard
  when leaving with unsaved changes.
- **Detail drawings** A–F, redrawn live from the field values, with effect lines
  **computed by the engine** (run `calculateParts` on a reference cabinet with
  the draft rules). Don't hand-code arithmetic.
- **Display**: rounding precision (1/8, 1/16 default, 1/32) feeding
  `formatDimension` everywhere, with live samples. Millimetres shown disabled.
- **Backups**: folder, Open folder, Change…, keep the latest n.
- Validation: the engine's `validate` on a reference cabinet with the draft rules
  must have no errors before Save is enabled. Show its messages beside the
  fields.

## Part 2: backups

- **When**: once per day at the first launch, before every database migration,
  before Restore, before Import replaces a job, and on demand ("Back up now").
- **How**: SQLite online backup API (`rusqlite::backup`) into
  `…\KERFuffle\Backups\kerfuffle-YYYYMMDD-HHMMSS.db`, then an integrity check
  (`PRAGMA integrity_check`) on the copy. A backup that fails the check is deleted
  and reported, never kept as if it were good.
- **Rotation**: keep the latest n (default 14), but never delete the only backup
  from a given week within the last month.
- **Restore**: list backups with date and job count; a confirm step ("Your jobs
  go back to how they were then. KERFuffle backs up the current jobs first.");
  take a backup, swap the database file while no connection is open, reopen,
  run migrations, then show a toast. If anything fails, put the original back.
- Wire the Jobs screen's backup strip (prompt 04) to these commands.

## Part 3: Export / Import a job

- **Format**: `.kerfjob`, a UTF-8 JSON document:
  `{ format: "kerfuffle-job", formatVersion: 1, appVersion, exportedAt, job: {…},
  cabinets: [...], rules: {…}, rulesVersion, checksum }`. Sizes are integer
  ticks; the checksum is SHA-256 of the canonical JSON without the checksum field.
- **Export job file…** (Jobs ⋯ menu and Workspace): Save dialog, default file
  name `{Job name} (J-0014).kerfjob`.
- **Import job…**: Open dialog → validate (format, version, checksum, enums,
  engine validation, flagged rather than rejected) → preview in a dialog (name,
  number, cabinet count, exported date, source app version) → if a job with the
  same id exists, offer **Import as a copy** (default) or **Replace existing**
  (confirm, back up first). Imported jobs keep their own rules snapshot.
- Newer `formatVersion` than the app understands: refuse with "This job was made
  by a newer KERFuffle. Update this PC first."
- Dropping a `.kerfjob` file onto the Jobs screen starts the same flow.

## Tests

- Settings: dirty tracking, reset, the save guard, validation blocks save, and
  that saving changes new jobs only.
- Backups: creation, integrity failure handling, rotation rules (table-driven by
  date), restore rollback when the swap fails.
- Import/export: round trip is lossless; tampered checksum is rejected; future
  version is refused; same-id handling; invalid cabinets are imported flagged.

## Done when

- All of the above works end to end, and all tests pass.
- Moving a job from PC A to PC B by USB stick or email works, and is documented
  in a short user-facing note: `docs/moving-jobs-between-pcs.md`, written for the
  two shop users.
- A short summary lists file locations and any decision you made beyond this
  prompt.

## Out of scope

Live sync between PCs, cloud storage, per-job rule overrides, millimetres.
