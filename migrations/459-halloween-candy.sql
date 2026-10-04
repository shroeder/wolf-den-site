-- ── CANDY: THE EVENT CURRENCY ─────────────────────────────────────────────────────────────────────────────
-- Luke: "lets make a special currency. Candy. Yiu get it from most activities" and an NPC who trades it for
-- things nothing else sells.
--
-- ⚠️ A BALANCE AND A LEDGER, NOT JUST A BALANCE. Gold learned this the expensive way — mkt_coin_event exists
-- because a number on a row tells you what somebody HAS and nothing about where it came from, and the first
-- question anybody asks about a new currency is "is someone farming it". The ledger answers that, and it is
-- also what enforces the daily cap: the cap is a SUM over today's rows, so it cannot drift out of step with a
-- counter somebody forgot to reset.
--
-- BIGINT for the balance to match chips and tokens. The amounts are small, but a currency column that
-- overflows is the boss_event lesson from two days ago and it costs nothing to not repeat it.

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS candy BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS mkt_candy_event (
    id BIGSERIAL PRIMARY KEY,
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    -- Positive is earned, negative is spent. One table for both so "where did it go" and "where did it come
    -- from" are the same query.
    delta INT NOT NULL,
    -- The faucet or the sink: 'boss_strike', 'delve_clear', 'trick_or_treat', 'vendor:hw_pet_grin'…
    source TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The cap query is "how much has this member EARNED today", so it is buyer + day + positive deltas. Indexed
-- on (buyer_id, created_at) because that is the shape of it; source is for reporting, not for the hot path.
CREATE INDEX IF NOT EXISTS idx_mkt_candy_event_buyer_day ON mkt_candy_event (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_candy_event_source ON mkt_candy_event (source);

-- ── TRICK OR TREAT ────────────────────────────────────────────────────────────────────────────────────────
-- Luke: "you can trick or tre[a]t day in town. Which each npc and building."
--
-- One row per member per door per day. The PRIMARY KEY is the rule: a member may knock on each door once a
-- day, and the database is what enforces it rather than a count the server has to remember to check. `day` is
-- a DATE in the shop's own zone — see the postgres note about a UTC session making a 'chicago' date roll over
-- at 7pm the night before, which is why it is passed in rather than computed with NOW().
CREATE TABLE IF NOT EXISTS mkt_trick_or_treat (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    door TEXT NOT NULL,
    day DATE NOT NULL,
    candy INT NOT NULL DEFAULT 0,
    treat TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, door, day)
);
