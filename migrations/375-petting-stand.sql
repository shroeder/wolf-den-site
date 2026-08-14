-- ── THE PETTING STAND ────────────────────────────────────────────────────────────────────────────────────────
-- A farm decoration that holds THREE pets. While they stand on it they earn passively exactly as an equipped
-- pet does, the farm shows how many members own each one, and anybody who pets them — the owner included —
-- gives them DOUBLE the usual petting XP. Sold only inside the $5 package; see decorations.js.
--
-- One row per occupied slot rather than three columns on mkt_buyer: slots are added and cleared independently,
-- an empty slot should be an absent row rather than a NULL, and the (buyer_id, slot) key is what stops a double
-- tap from seating the same animal twice.
CREATE TABLE IF NOT EXISTS mkt_petting_stand (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    slot       SMALLINT NOT NULL CHECK (slot >= 0 AND slot < 3),
    pet_id     TEXT NOT NULL,
    placed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, slot)
);

-- The same animal must not occupy two tiers at once — it would earn the passive twice and be petted twice for
-- double each time. Enforced here rather than only in code, because the seat write is an upsert and two tabs
-- racing it would otherwise both win.
CREATE UNIQUE INDEX IF NOT EXISTS idx_petting_stand_pet ON mkt_petting_stand (buyer_id, pet_id);

-- Read on every farm load (yours and every visitor's) to draw the tiers and to decide whether a petting pays
-- double, so it wants the buyer lookup indexed rather than scanned.
CREATE INDEX IF NOT EXISTS idx_petting_stand_buyer ON mkt_petting_stand (buyer_id);

-- NO TRICKLE CLOCK HERE ON PURPOSE. mkt_pet_level is already keyed (buyer_id, pet_id) and carries last_tick_at
-- per pet, which is exactly the meter a stand pet needs — so the three of them accrue on their own clocks with
-- no new column and no risk of the equipped pet's clock and a stand pet's disagreeing about elapsed time.
