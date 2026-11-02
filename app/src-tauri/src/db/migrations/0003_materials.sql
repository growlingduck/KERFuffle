-- Schema version 3. Forward-only: never edit this file once released; add 0004_*.sql instead.
-- The shop's materials catalog (plan §3.1), and each job's material for each slot.
-- The standard materials are added right after this runs (migrations/mod.rs), with no prices.

CREATE TABLE materials (
  id            TEXT PRIMARY KEY,
  position      INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('sheet', 'laminate', 'banding', 'hardware')),
  name          TEXT NOT NULL,
  -- Ticks (1/64 inch). Sheet goods: thickness and the real sheet size; laminate: the size.
  thickness     INTEGER CHECK (thickness > 0),
  length        INTEGER CHECK (length > 0),
  width         INTEGER CHECK (width > 0),
  grain         TEXT NOT NULL DEFAULT 'none' CHECK (grain IN ('none', 'length')),
  -- Edge banding: tape width (ticks), and feet per roll when sold by the roll.
  banding_width INTEGER CHECK (banding_width > 0),
  roll_feet     INTEGER CHECK (roll_feet > 0),
  -- Hardware: what one is called, e.g. 'each'.
  unit          TEXT,
  -- Whole cents per sheet, foot (or roll), or item. NULL: needs a price.
  price_cents   INTEGER CHECK (price_cents >= 0),
  supplier      TEXT,
  sku           TEXT,
  notes         TEXT,
  -- Full sheets, feet (or rolls) or items in stock, counted by hand. NULL: not counted.
  on_hand       INTEGER CHECK (on_hand >= 0),
  archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- The job's material per slot, with a copy of each (name, size, grain, price),
-- as JSON like rules_json. NULL: made before materials; it opens with the shop defaults.
ALTER TABLE jobs ADD COLUMN materials_json TEXT;
