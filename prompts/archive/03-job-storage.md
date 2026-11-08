# Prompt 03 — Job Storage, Autosave and Recovery

> Paste everything below the line into a fresh coding-agent session at the repo root.
> Prerequisites: prompts 01–02 are done.
> Prerequisite reading for the agent: `APPLICATION-VISION.md` (sections 2 and 5),
> `docs/calculation-rules.md`.

---

## Goal

Give KERFuffle a local, crash-safe job database. Jobs, their cabinets, and each
job's own copy of the construction rules are stored in SQLite inside the app's
data folder, saved automatically, and recovered after an unexpected shutdown.

A user must never lose more than the edit they were typing, and changing shop
defaults must never change an existing job.

## Decisions already made

- **SQLite, owned by the Rust side.** Use `rusqlite` (bundled SQLite) behind
  typed Tauri commands. The webview never sees SQL. One database file:
  `%APPDATA%\KERFuffle\kerfuffle.db` (the Tauri app-data dir), WAL mode,
  `foreign_keys=ON`, `synchronous=NORMAL`.
- **Dimensions are stored as integer ticks** (1/64″), exactly as the engine uses
  them. Never store floats or formatted strings for sizes.
- **Each job snapshots its `ConstructionRules`** when it is created. Store the
  snapshot as JSON with a `rulesVersion` so later rule fields can be migrated.
- **Calculated parts are not stored.** They are always recomputed from the spec
  and the job's rules with the engine. (Exports and printouts may embed them.)
- **Versioned migrations**, forward-only, each in its own file, run at startup
  inside a transaction. Before running any migration on an existing database,
  copy the file to the backup folder (prompt 07 builds the backup system; for
  now, a plain timestamped copy).

## Schema (starting point; adjust names if better ones emerge)

```
meta(key TEXT PRIMARY KEY, value TEXT)            -- schema_version, created_at, app_version
jobs(
  id TEXT PRIMARY KEY,                            -- uuid
  number INTEGER UNIQUE NOT NULL,                 -- shown as J-0014
  name TEXT NOT NULL, customer TEXT, notes TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','ready','completed','archived')),
  rules_json TEXT NOT NULL, rules_version INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL
)
cabinets(
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,                      -- list order
  label TEXT NOT NULL,                            -- "B1"
  type TEXT NOT NULL CHECK(type IN ('base','wall')),
  width INTEGER NOT NULL, height INTEGER NOT NULL, depth INTEGER NOT NULL,  -- ticks
  shelf_count INTEGER NOT NULL, finished_ends TEXT NOT NULL, quantity INTEGER NOT NULL,
  room TEXT                                       -- optional grouping, unused in UI for now
)
shop_settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL)   -- default rules, display, backups
```

Rooms or areas are in the vision but not in the first UI. Keep the column so it
won't need a migration later.

## Deliverables

- `app/src-tauri/src/db/`: connection setup, migrations, and repository
  functions: list jobs (with cabinet counts and cabinet sizes for thumbnails),
  get job, create (snapshotting current shop rules), duplicate (new number,
  "(copy)", status draft, new ids), update job fields, set status, delete,
  cabinet upsert / reorder / delete, and get/set shop settings.
- Tauri commands wrapping those, with typed errors that the UI can show in plain
  language.
- `app/src/data/`: TypeScript client (typed command wrappers) and the job store:
  - loads a job into memory and gives the UI synchronous reads;
  - **autosave**: writes committed changes (prompt 05 commits on blur/Enter,
    never per keystroke), debounced ~400 ms, coalescing into one transaction,
    and bumping `revision`;
  - **save state** for the header: `saved(at)`, `saving`, or `error(message,
    retry)`. Show `saving` only if a write takes more than 300 ms;
  - **flush on close**: the window close handler awaits pending writes.
- **Crash recovery**: keep a small journal (e.g. a `pending_edits` table or file
  written before the debounced save). On startup, if a journal exists for a job,
  apply it and tell the user with a toast: "Recovered your last changes to
  Kitchen remodel."
- **Validation at the boundary**: the Rust side rejects impossible data (negative
  ticks, unknown enums). The TS side runs the engine's `validate` before saving
  and still saves invalid in-progress specs. A user may leave a field invalid
  and come back. Invalid cabinets are flagged, not dropped.
- First-run seed: an empty database. **No sample jobs** in production builds. A
  dev-only command can load the five sample jobs from the wireframes.

## Tests

- Rust: migrations from empty, then re-running is a no-op; round-trip for every
  field; cascade delete; duplicate creates a fully independent copy; rules
  snapshot isn't affected by later shop-setting changes.
- TS: the store coalesces rapid commits into one write; save-state transitions;
  flush on close; a recovery journal is applied exactly once.
- A test proves that changing shop defaults after creating a job leaves that
  job's calculated parts unchanged.

## Done when

- All tests pass at the root.
- Killing the process mid-edit (simulate in a test, then check by hand once) loses
  no committed change.
- The database file has a `schema_version` and a migration test fixture for
  version 1.
- A short summary lists the schema, where the files live, and anything you
  deferred.

## Out of scope

Screens (04–07 wire them up), backups beyond the pre-migration copy, import and
export, sync between PCs.
