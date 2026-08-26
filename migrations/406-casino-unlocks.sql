-- ── WHAT CHIPS BUY THAT DOES NOT GO AWAY ────────────────────────────────────────────────────────────────────
-- Luke: "let's allow buying permanent upgrades to core stats... starts at 250, cost goes up by 250 each time,
-- can go infinitely." And five one-off unlocks: unique pets, a golden daily wheel, extra fish, a new tier of
-- recipes, and another hundred rungs of the Road.
--
-- Until now the Counter sold CONSUMPTION — a chest you open and it is gone. This is the other half: things
-- you own afterwards. That is a different shape and it needs a row that survives the purchase, which
-- mkt_chip_purchase (a receipt log) is not.
--
-- ONE TABLE FOR BOTH, because they are the same thing with a different ceiling. A stat track is a perk you can
-- buy again — level 1, 2, 3, for ever — and a feature unlock is a perk you can buy once, which is a track with
-- a maximum of one. Splitting them would mean two tables, two grant paths and two places to ask "does this
-- member have X", and the third one somebody adds would forget one of them.
CREATE TABLE IF NOT EXISTS mkt_casino_perk (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    -- 'might' | 'vitality' | 'tenacity' | 'ferocity'  → infinite stat tracks
    -- 'wheel_gold' | 'fish_deep' | 'recipe_master' | 'road_long' → one-off feature unlocks
    perk       TEXT NOT NULL,
    level      INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, perk)
);

-- Every read of this table is "what does THIS member have", so the primary key above already serves it. No
-- second index: a table nobody scans does not need one, and an unused index is a write cost forever.

-- ── AND THE ROAD'S SECOND HUNDRED IS SHUT UNTIL IT IS BOUGHT ────────────────────────────────────────────────
-- Luke: "make another 100 rungs and ensure it's hidden until unlock and doesn't allow anyone to get past 100
-- until it's unlocked."
--
-- Nothing here enforces that — the ladder is derived in code (arena-ladder.js) and the gate lives with it, on
-- the server, in the one function that resolves a rung. This note is here so the next person looking for a
-- `road_unlocked` column knows why there isn't one: the unlock is a row above, and the ceiling is a function
-- of it. See ladderSize().
