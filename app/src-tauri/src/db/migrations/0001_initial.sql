-- Schema version 1. Forward-only: never edit this file once released; add 0002_*.sql instead.
-- All lengths are integer ticks (1/64 inch). Timestamps are ISO 8601 UTC text.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  number        INTEGER UNIQUE NOT NULL CHECK (number > 0),
  name          TEXT NOT NULL,
  customer      TEXT,
  notes         TEXT,
  status        TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'completed', 'archived')),
  rules_json    TEXT NOT NULL,
  rules_version INTEGER NOT NULL CHECK (rules_version > 0),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  revision      INTEGER NOT NULL CHECK (revision >= 0)
);

CREATE TABLE cabinets (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('base', 'wall')),
  width         INTEGER NOT NULL CHECK (width >= 0),
  height        INTEGER NOT NULL CHECK (height >= 0),
  depth         INTEGER NOT NULL CHECK (depth >= 0),
  shelf_count   INTEGER NOT NULL CHECK (shelf_count >= 0),
  finished_ends TEXT NOT NULL CHECK (finished_ends IN ('none', 'left', 'right', 'both')),
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  room          TEXT
);

CREATE INDEX cabinets_by_job ON cabinets (job_id, position);

CREATE TABLE shop_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

-- Crash-recovery journal: the latest unsaved snapshot of a job, written before
-- the debounced save. A successful save deletes the row in the same transaction.
CREATE TABLE pending_edits (
  job_id        TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  payload_json  TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  written_at    TEXT NOT NULL
);
