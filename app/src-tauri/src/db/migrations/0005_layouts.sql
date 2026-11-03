-- Schema version 5. Forward-only: never edit this file once released; add 0006_*.sql instead.
-- Sheet layouts kept with a job (plan §2.6): saved when the job is marked Ready to cut, or a
-- layout is printed or saved as PDF. One per job and material. Each keeps what it was made
-- from, so the app can show it as it was and say what has changed since:
--   input_hash         the app's hash of the material's pieces, sheet size and seed;
--   algorithm_version  the optimizer's ALGORITHM_VERSION;
--   mode               cost, grain or time;
--   profile_json       the saw profile it was cut for;
--   layout_json        the material's layout, as the optimizer gave it (the app reads it).

CREATE TABLE layouts (
  job_id            TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  material_id       TEXT NOT NULL,
  input_hash        TEXT NOT NULL,
  algorithm_version INTEGER NOT NULL CHECK (algorithm_version >= 0),
  mode              TEXT NOT NULL CHECK (mode IN ('cost', 'grain', 'time')),
  profile_json      TEXT NOT NULL,
  layout_json       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (job_id, material_id)
);
