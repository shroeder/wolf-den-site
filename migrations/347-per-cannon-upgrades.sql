-- EVERY CANNON IS ITS OWN GUN.
--
-- The Cannons track buys you MORE barrels; nothing has ever let you make one barrel better than the one next
-- to it. Every gun on the deck was identical: same 4 hits, same accuracy, same one plank a ball. So a gun
-- deck was a number, not a thing you built — and the battle screen asks you to pick which barrel fires at
-- what, a decision with no reason behind it when every barrel is the same.
--
-- One row per gun you own. Absent rows read as level 0, so nothing needs backfilling and buying your first
-- cannon costs nothing to represent.
CREATE TABLE IF NOT EXISTS mkt_sailing_gun (
    buyer_id   uuid NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    -- 0-based, matching the gun's index in the broadside and its port on the drawn deck.
    gun_index  smallint NOT NULL,
    -- Hits it takes to dismount. Cannons drop to a base of 2 in this change (from 4) so that shooting a gun
    -- deck is a real tactic again; this track buys that back one hit at a time, on the guns you choose.
    hp_level   smallint NOT NULL DEFAULT 0,
    -- Chance this barrel staves in an extra plank.
    dmg_level  smallint NOT NULL DEFAULT 0,
    -- This barrel lays truer than the rest of the battery.
    acc_level  smallint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, gun_index)
);

CREATE INDEX IF NOT EXISTS mkt_sailing_gun_buyer_idx ON mkt_sailing_gun (buyer_id);
