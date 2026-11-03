-- Schema version 4. Forward-only: never edit this file once released; add 0005_*.sql instead.
-- Saw profiles (plan §2.2). The shop's profiles are a shop setting ('saw_profiles'); each job
-- keeps a copy of the one it uses, as JSON like rules_json.
-- NULL: made before saw profiles; the app uses the shop's default profile until one is chosen.

ALTER TABLE jobs ADD COLUMN saw_profile_json TEXT;
