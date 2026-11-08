-- Schema version 8. Forward-only: never edit this file once released; add 0009_*.sql instead.
-- Tall cabinets (pantry, oven, utility): a third cabinet type, with fixed shelves, a mid
-- nailer and a split back (all ignored on base and wall cabinets).
--
-- SQLite can't change the CHECK on `type` from 0001_initial.sql in place, so the table is
-- rebuilt: create, copy every row (keeping its rowid, which breaks position ties), drop,
-- rename, and recreate the index. The migration runner wraps this in its transaction, so a
-- failure leaves the database as it was. Nothing references `cabinets`, and it has no triggers.

CREATE TABLE cabinets_new (
  id                TEXT PRIMARY KEY,
  job_id            TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  position          INTEGER NOT NULL,
  label             TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('base', 'wall', 'tall')),
  width             INTEGER NOT NULL CHECK (width >= 0),
  height            INTEGER NOT NULL CHECK (height >= 0),
  depth             INTEGER NOT NULL CHECK (depth >= 0),
  shelf_count       INTEGER NOT NULL CHECK (shelf_count >= 0),
  finished_ends     TEXT NOT NULL CHECK (finished_ends IN ('none', 'left', 'right', 'both')),
  quantity          INTEGER NOT NULL CHECK (quantity >= 0),
  room              TEXT,
  run               TEXT,
  fixed_shelf_count INTEGER NOT NULL DEFAULT 0 CHECK (fixed_shelf_count >= 0),
  mid_nailer        INTEGER NOT NULL DEFAULT 0 CHECK (mid_nailer IN (0, 1)),
  split_back        INTEGER NOT NULL DEFAULT 0 CHECK (split_back IN (0, 1))
);

INSERT INTO cabinets_new (rowid, id, job_id, position, label, type, width, height, depth,
                          shelf_count, finished_ends, quantity, room, run)
  SELECT rowid, id, job_id, position, label, type, width, height, depth,
         shelf_count, finished_ends, quantity, room, run
  FROM cabinets;

DROP TABLE cabinets;

ALTER TABLE cabinets_new RENAME TO cabinets;

CREATE INDEX cabinets_by_job ON cabinets (job_id, position);
