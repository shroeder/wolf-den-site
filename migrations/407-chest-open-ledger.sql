-- ── THE OTHER HALF OF THE CHEST LEDGER ──────────────────────────────────────────────────────────────────────
-- Luke: "I want chest economy to be built just like coin economy in the accounting app."
--
-- The coin screen works because mkt_coin_event records BOTH directions: a positive delta is a coin minted, a
-- negative one is a coin burned, and everything on that dashboard — supply, inflation, sink rate, gain and
-- usage by source — falls out of having both halves in one table.
--
-- Chests only ever had the mint half. mkt_chest_grant records every chest handed out and by which source, and
-- openChest() decrements mkt_user_chest and logs NOTHING. So the existing screen can only say how many were
-- given away; it cannot say how many were opened, how many are being hoarded, or whether the pile is growing.
-- With 7,168 chests granted in thirty days, that is the only question worth asking.
--
-- Shaped deliberately like mkt_chest_grant — same columns, same types — so the two can be summed against each
-- other without either side needing a cast or a special case. `source` is how it was opened (one at a time, or
-- a bulk pour), which is the same kind of fact the grant side records.
CREATE TABLE IF NOT EXISTS mkt_chest_open (
    id         BIGSERIAL PRIMARY KEY,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier       TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 1,
    source     TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The economy query groups by day and by tier over a window, and the member-facing history reads one member's
-- rows newest-first. Both are covered by these two.
CREATE INDEX IF NOT EXISTS mkt_chest_open_at_idx ON mkt_chest_open (created_at DESC);
CREATE INDEX IF NOT EXISTS mkt_chest_open_buyer_idx ON mkt_chest_open (buyer_id, created_at DESC);

-- ── AND NOTHING IS BACKFILLED ────────────────────────────────────────────────────────────────────────────────
-- There is no honest way to invent the history. Opens were never recorded, so per-day burn starts the moment
-- this lands and the chart's burn line will be empty to the left of today.
--
-- The TOTAL is still knowable and is not a guess: everything ever granted, minus everything still held in
-- mkt_user_chest, is everything ever opened. getChestEconomy uses exactly that for the lifetime sink rate and
-- says which of its numbers are measured and which are derived, rather than quietly mixing them.
