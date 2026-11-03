-- Schema version 6. Forward-only: never edit this file once released; add 0007_*.sql instead.
-- Whether the shop has checked its construction defaults (shop setting "defaults_checked").
-- Until it has, the Jobs screen asks it to. A shop that already has jobs, or has already
-- saved its own construction defaults, is using KERFuffle and is never asked.

INSERT INTO shop_settings (key, value_json)
SELECT 'defaults_checked', 'true'
WHERE EXISTS (SELECT 1 FROM jobs)
   OR EXISTS (SELECT 1 FROM shop_settings WHERE key = 'construction_rules')
ON CONFLICT (key) DO NOTHING;
