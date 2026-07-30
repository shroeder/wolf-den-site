-- FISHING — a minigame for the four hours a voyage spends doing nothing. Cast off the rail, wait for the bite,
-- reel against a tension band; how well you reel decides how BIG the fish is.
--
-- State lives on the existing one-row-per-member mkt_sailing table, like every other sailing subsystem:
--   fish_day / fish_casts  the daily cast allowance (store-local date, compared in SQL — building a JS Date
--                          from a DATE column reads today as yesterday on Vercel, which already broke the daily
--                          check-in once)
--   fish_state             the fish currently ON THE LINE: { species, roll, castAt, biteAt, sky }. Rolled
--                          server-side at cast time so the client can't reroll for something rarer, and cleared
--                          by a guarded UPDATE at landing so a resubmit can't double-pay. Non-null survives a
--                          refresh, so you can always come back and reel.
--   fish_log               { speciesId: { n, best, firstAt } } — the Fishing Log, which IS the reward. A JSONB
--                          map rather than a join, because it's read on every sailing state load.
--   fish_caught            lifetime catches (badge thresholds read it)

ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fish_day    date;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fish_casts  integer NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fish_state  jsonb;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fish_log    jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fish_caught integer NOT NULL DEFAULT 0;

-- Every catch, as a row. The Fishing Log covers "my best"; this table is what makes "biggest in the Den" possible
-- — a public record board per species, which is the social half of the feature and the thing the log is chasing.
CREATE TABLE IF NOT EXISTS mkt_fish_catch (
    id         bigserial PRIMARY KEY,
    buyer_id   uuid NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    species    text NOT NULL,
    cm         numeric(8,1) NOT NULL,
    quality    numeric(5,3),
    sky        text,
    caught_at  timestamptz NOT NULL DEFAULT NOW()
);
-- The record board does DISTINCT ON (species) ORDER BY species, cm DESC, caught_at ASC — this index is that query.
CREATE INDEX IF NOT EXISTS mkt_fish_catch_record_idx ON mkt_fish_catch (species, cm DESC, caught_at ASC);
CREATE INDEX IF NOT EXISTS mkt_fish_catch_buyer_idx  ON mkt_fish_catch (buyer_id, caught_at DESC);

-- ── FISHING BADGES ────────────────────────────────────────────────────────────────────────────────────────────
-- Secret + granted imperatively from checkFishingBadges (no auto_rule), like the other sailing event badges.
-- Deliberately weighted toward the LOG rather than the volume: catching 250 sardines is patience, catching one of
-- every species means you fished at night, in a storm, in fog, and sailed forty voyages to reach deep water.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, secret, sort_order) VALUES
    ('fish_first',         'First Cast',      'Landed your first fish over the rail.',                          '🎣', '#7ec8ff', FALSE, NULL, NULL, TRUE, 310),
    ('fish_angler',        'Angler',          'Landed 50 fish.',                                                '🐟', '#5aa0e0', FALSE, NULL, NULL, TRUE, 311),
    ('fish_master',        'Master Angler',   'Landed 250 fish. The sea knows your shadow.',                    '🎏', '#3f8fd0', FALSE, NULL, NULL, TRUE, 312),
    ('fish_naturalist',    'Naturalist',      'Logged 10 different species.',                                   '📖', '#8fd8ff', FALSE, NULL, NULL, TRUE, 313),
    ('fish_deepwater',     'Deep Water',      'Landed one of the four mythic fish.',                            '🐋', '#c9a2ff', FALSE, NULL, NULL, TRUE, 314),
    ('fish_trophy',        'Trophy Catch',    'Landed a fish within 2% of the largest its species can grow.',   '🏆', '#ffd75e', FALSE, NULL, NULL, TRUE, 315),
    ('fish_record_holder', 'Record Holder',   'Hold the Den record for a species.',                             '🥇', '#ffe488', FALSE, NULL, NULL, TRUE, 316),
    ('fish_complete',      'The Whole Ocean', 'Logged every single species in the sea.',                        '🌊', '#55d3ff', FALSE, NULL, NULL, TRUE, 317)
ON CONFLICT (slug) DO NOTHING;
