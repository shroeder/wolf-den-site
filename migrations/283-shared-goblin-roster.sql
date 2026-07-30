-- ── A SHARED, FINITE GOBLIN ROSTER ───────────────────────────────────────────────────────────────────────────
-- Before this, `enemies` was just a NUMBER: each client independently drew ceil(hp/hp_max × 8) generic sprites at
-- its own positions. There was no goblin — which is exactly why a raid felt like everyone fighting their own
-- private copy, and why nobody could see who was locked in with what. Cleared waves also refilled forever, so a
-- raid had no goal and no end (one hit wave 22).
--
-- Now every foe is a real row: its own HP, a server-assigned position so everyone sees it in the SAME place, and
-- an engagement claim so "I'm fighting that one" is a fact other players can see.
CREATE TABLE IF NOT EXISTS mkt_town_enemy (
    id          BIGSERIAL PRIMARY KEY,
    event_id    BIGINT NOT NULL REFERENCES mkt_town_event(id) ON DELETE CASCADE,
    wave        INTEGER NOT NULL,
    slot        INTEGER NOT NULL,          -- stable ordering within a wave
    kind        TEXT    NOT NULL,          -- scrapper | shieldbearer | archer | elite | chieftain
    hp          INTEGER NOT NULL,
    hp_max      INTEGER NOT NULL,
    x           REAL    NOT NULL,          -- % across the plaza, server-assigned so it's shared
    y           REAL    NOT NULL,
    flip        BOOLEAN NOT NULL DEFAULT FALSE,
    -- The claim. Held until the foe dies (Luke's call — no idle timeout), released only if the holder actually
    -- LEAVES the fight, because a wave must be cleared to advance and a stranded foe would deadlock the raid.
    engaged_by  UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    engaged_at  TIMESTAMPTZ,
    killed_by   UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    died_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One foe per slot per wave; spawning a wave twice (double cron tick, double tap) can't duplicate the roster.
CREATE UNIQUE INDEX IF NOT EXISTS idx_town_enemy_slot ON mkt_town_enemy (event_id, wave, slot);
-- The hot read: who's still standing in this raid.
CREATE INDEX IF NOT EXISTS idx_town_enemy_alive ON mkt_town_enemy (event_id) WHERE died_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_town_enemy_engaged ON mkt_town_enemy (engaged_by) WHERE died_at IS NULL;
