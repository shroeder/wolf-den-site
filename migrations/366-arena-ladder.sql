-- THE LONG ROAD: WHICH RUNGS YOU HAVE ALREADY PUT DOWN.
--
-- A hundred named opponents, each beatable exactly once (see arena-ladder.js). What that needs is a set of
-- integers per member and nothing else — no timestamps worth keeping, no per-rung rows to sweep, and the whole
-- thing is read on one screen at once. So it is an array on the row the Arena already loads rather than a
-- hundred-row-per-member table that every ladder read would then have to join.
--
-- INTEGER[] rather than JSONB: the values are rung numbers and Postgres can answer "is 47 in here" against an
-- int array directly, which is the only question ever asked of it.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS ladder_beaten INTEGER[] NOT NULL DEFAULT '{}';

-- ── EVERY ITEM YOU HAVE EVER HELD ────────────────────────────────────────────────────────────────────────────
-- The compendium counts what you have COLLECTED, not what you are carrying: sell it, salvage it, trade it away
-- and it still counts, because the milestone rewards are for having found the thing rather than for hoarding
-- it. mkt_user_item is a live inventory and answers a different question — it goes down.
--
-- One row per (member, item), written the first time it is ever granted. `first_at` is kept because "when did
-- I find this" is the one extra fact a collection screen can offer for free.
CREATE TABLE IF NOT EXISTS mkt_item_collected (
    buyer_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id   TEXT NOT NULL,
    first_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_item_collected_buyer ON mkt_item_collected (buyer_id);

-- BACKFILL FROM WHAT PEOPLE ARE HOLDING RIGHT NOW. Anything already in a bag was obviously collected, and
-- without this every member opens the compendium on their first visit to find it says they have never owned
-- any of the gear they are wearing. Equipped pieces live in mkt_user_item too, so one insert covers both.
INSERT INTO mkt_item_collected (buyer_id, item_id, first_at)
SELECT buyer_id, item_id, COALESCE(MIN(acquired_at), NOW())
  FROM mkt_user_item
 WHERE item_id IS NOT NULL
 GROUP BY buyer_id, item_id
ON CONFLICT (buyer_id, item_id) DO NOTHING;
