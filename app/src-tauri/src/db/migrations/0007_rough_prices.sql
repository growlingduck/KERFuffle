-- Schema version 7. Forward-only: never edit this file once released; add 0008_*.sql instead.
-- A material's price can be a rough starting price KERFuffle filled in (price_estimated = 1),
-- not one the shop entered. Saving a price from Settings clears it. The prices themselves
-- (rough_prices.json) go on the standard materials that have none, after this runs.

ALTER TABLE materials ADD COLUMN price_estimated INTEGER NOT NULL DEFAULT 0 CHECK (price_estimated IN (0, 1));
