-- ── STATUES: THE FIRST THING IN THE GROVE WHERE THE HUNDREDTH IS WORTH AS MUCH AS THE FIRST ─────────────────
-- Luke: "we gota figure out how to make meaning behind volume of items making it worth to collect lots of
-- them… enemies have statues in their drop table… they can turn them in to a statue vendor. Reaching
-- breakpoint. Each increasing its corresponding stat."
--
-- Two tables because they answer two different questions, and collapsing them would lose one of the answers:
--   mkt_grove_statue       what you are HOLDING, by type and rarity, unspent
--   mkt_grove_statue_line  what you have POURED IN, per stat, which is permanent
--
-- ⚠️ THE LINE OUTLIVES THE STATUES. Points are spent statues, so holding and progress cannot be one row:
-- a player at level 7 holding nothing has to still be level 7.

CREATE TABLE IF NOT EXISTS mkt_grove_statue (
    buyer_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    stat      TEXT NOT NULL,
    rarity    TEXT NOT NULL,
    qty       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, stat, rarity)
);

CREATE TABLE IF NOT EXISTS mkt_grove_statue_line (
    buyer_id        UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    stat            TEXT NOT NULL,
    points          INTEGER NOT NULL DEFAULT 0,
    -- ⚠️ TIMESTAMPS, NOT BOOLEANS. "Has this line ever seen a crystal" is the doubling, and knowing WHEN is
    -- what lets the moment be announced later without inventing a second record of it.
    first_crystal_at   TIMESTAMPTZ,
    first_prismatic_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, stat)
);
