-- Boss trophies: the top damage dealer keeps a statue of what they killed.
--
-- Replaces the drop-only badge that used to go to the #1 dealer. A random badge said nothing about the fight;
-- a statue of the specific boss, dated, with their name on it, is a record of THAT kill — and it goes on the
-- farm where other members walk past it.
CREATE TABLE IF NOT EXISTS mkt_boss_trophy (
    deco_id     TEXT PRIMARY KEY,          -- 'trophy:<boss_event_id>' — matches mkt_deco_owned.deco_id
    boss_id     UUID,
    boss_name   TEXT NOT NULL,
    winner_id   UUID,
    damage      BIGINT,
    url         TEXT,                      -- the statue art; falls back to the boss's own portrait
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mkt_boss_trophy_winner ON mkt_boss_trophy (winner_id);
