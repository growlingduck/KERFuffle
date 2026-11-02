-- Schema version 2. Forward-only: never edit this file once released; add 0003_*.sql instead.
-- A run is a straight row of base cabinets that shares one ladder base (construction
-- method A1). Separate from room: a room can hold several runs. NULL: no run.

ALTER TABLE cabinets ADD COLUMN run TEXT;
