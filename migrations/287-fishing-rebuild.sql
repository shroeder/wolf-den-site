-- Fishing rebuilt: no gates, weight instead of length, a real haul table.
--
-- The species roll is now pure weighted random — every fish is in the water on every cast for every member.
-- The voyage gates (minVoyages 3-40) and the weather gates are gone: between them they kept most of the roster
-- invisible for weeks, and the weather half was unreachable entirely for anyone who declined the browser's
-- location prompt (3 of ~1000 visitors ever granted it).
--
-- Records are kept by WEIGHT now, as real fishing records are, so `cm` becomes `lb`.

-- 1. Length becomes weight. Both are just a number on the row, so this is a rename, not a conversion —
--    but the VALUES are not comparable, which is why the existing rows go (see 3).
--
--    Guarded rather than a bare RENAME. A verification script that believed it was running inside a
--    transaction had already applied these statements for real — the Neon HTTP driver gives each query its own
--    connection, so BEGIN/ROLLBACK around separate calls do nothing and every statement auto-commits. The
--    rename therefore landed without the migration ever being recorded, and every deploy then died retrying
--    it. Every statement in this file is now safe to run against a database that has already seen it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mkt_fish_catch' AND column_name = 'cm')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mkt_fish_catch' AND column_name = 'lb')
    THEN
        ALTER TABLE mkt_fish_catch RENAME COLUMN cm TO lb;
    END IF;
END $$;

-- 2. `sky` recorded which weather a catch happened under, for the weather-gated species. Nothing gates on
--    weather any more and nothing reads the column.
ALTER TABLE mkt_fish_catch DROP COLUMN IF EXISTS sky;

-- 3. Wipe the catch history and every fishing log.
--
--    Deliberate, and safe precisely because of when it's happening: fishing has never been released. It is
--    owner-gated, and the only rows in here are two catches the owner made while testing (a 14.2cm Sardine and
--    a 62.5cm Reef Octopus). Those numbers are CENTIMETRES measured against species ranges that no longer
--    exist — carried forward they'd read as a 14lb Sardine sitting at the top of a leaderboard whose maximum
--    is now 0.8lb, and they'd hold a permanent, unbeatable Den record.
--
--    If this ever needs doing again after launch it must NOT be a DELETE — it would have to convert.
DELETE FROM mkt_fish_catch;

UPDATE mkt_sailing
   SET fish_log = '{}'::jsonb,
       fish_caught = 0,
       fish_state = NULL
 WHERE fish_log IS NOT NULL AND fish_log <> '{}'::jsonb;

-- 4. The old fishing badges were awarded off those catches, so they'd now be held with nothing behind them.
--    Only the owner can have them (the feature is gated), and they re-earn on the first real catch.
DELETE FROM mkt_user_badge
 WHERE badge_slug IN (
    'fish_first', 'fish_angler', 'fish_master', 'fish_naturalist',
    'fish_complete', 'fish_deepwater', 'fish_trophy', 'fish_record_holder'
 );
