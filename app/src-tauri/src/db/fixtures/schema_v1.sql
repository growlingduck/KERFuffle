-- Test fixture: a database exactly as schema version 1 left it, with data.
-- Frozen copy: do not update this when adding migrations. Future migration
-- tests start from here and check the data survives.

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

CREATE TABLE pending_edits (
  job_id        TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
  payload_json  TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  written_at    TEXT NOT NULL
);

INSERT INTO meta (key, value) VALUES
  ('schema_version', '1'),
  ('created_at', '2026-10-01T08:00:00.000Z'),
  ('app_version', '0.1.0');

INSERT INTO shop_settings (key, value_json) VALUES
  ('construction_rules', '{"panelThickness":46,"toeKickHeight":256,"countertopThickness":96,"shelfThickness":48,"wideShelfThickness":64,"shelfThickWidthThreshold":2304,"shelfThickComparison":"gte","shelfClearancePerSide":8,"shelfSetback":8,"laminateOversizePerEdge":64,"legacyWallBackDeductsBaseAllowances":false,"legacyWallLaminateDeductsBaseAllowances":false}');

INSERT INTO jobs (id, number, name, customer, notes, status, rules_json, rules_version, created_at, updated_at, revision) VALUES
  ('fixture-job-1', 14, 'Kitchen remodel', 'Pat Example', 'Island deferred.', 'draft',
   '{"panelThickness":48,"toeKickHeight":256,"countertopThickness":96,"shelfThickness":48,"wideShelfThickness":64,"shelfThickWidthThreshold":2304,"shelfThickComparison":"gte","shelfClearancePerSide":8,"shelfSetback":8,"laminateOversizePerEdge":64,"legacyWallBackDeductsBaseAllowances":false,"legacyWallLaminateDeductsBaseAllowances":false}',
   1, '2026-10-01T08:00:00.000Z', '2026-10-02T09:41:00.000Z', 7),
  ('fixture-job-2', 11, 'Bathroom vanity', NULL, NULL, 'completed',
   '{"panelThickness":48,"toeKickHeight":256,"countertopThickness":96,"shelfThickness":48,"wideShelfThickness":64,"shelfThickWidthThreshold":2304,"shelfThickComparison":"gte","shelfClearancePerSide":8,"shelfSetback":8,"laminateOversizePerEdge":64,"legacyWallBackDeductsBaseAllowances":false,"legacyWallLaminateDeductsBaseAllowances":false}',
   1, '2026-09-01T08:00:00.000Z', '2026-09-09T16:00:00.000Z', 3);

INSERT INTO cabinets (id, job_id, position, label, type, width, height, depth, shelf_count, finished_ends, quantity, room) VALUES
  ('fixture-cab-1', 'fixture-job-1', 0, 'B1', 'base', 1920, 2208, 1536, 1, 'left', 1, 'Kitchen'),
  ('fixture-cab-2', 'fixture-job-1', 1, 'W1', 'wall', 1920, 1920, 768, 2, 'both', 2, NULL),
  ('fixture-cab-3', 'fixture-job-2', 0, 'B1', 'base', 2304, 2208, 1344, 0, 'both', 1, NULL);

INSERT INTO pending_edits (job_id, payload_json, base_revision, written_at) VALUES
  ('fixture-job-2', '{"id":"fixture-job-2","name":"Bathroom vanity","customer":null,"notes":"Recovered","status":"completed","cabinets":[{"id":"fixture-cab-3","label":"B1","type":"base","width":2304,"height":2208,"depth":1344,"shelfCount":1,"finishedEnds":"both","quantity":1,"room":null}]}', 3, '2026-09-09T16:00:01.000Z');
