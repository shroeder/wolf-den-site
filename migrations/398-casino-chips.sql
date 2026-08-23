-- ── CHIPS ────────────────────────────────────────────────────────────────────────────────────────────────────
-- The casino stops paying gold. You stake GOLD and the machines pay CHIPS, and chips buy things at a counter
-- on the floor and nowhere else.
--
-- This is not a re-skin of the coin economy, it is what makes the machines possible. Paying gold meant every
-- paytable had to fight an RTP ceiling, because a machine returning over 100% would literally print the
-- currency the whole game runs on — and the result was five cabinets tuned to 88%, where 93% of the wins a
-- member ever saw were exactly double the stake. Luke: "you have engineered the most boring slots ever."
--
-- With chips, every gold piece staked is DESTROYED. The casino becomes a pure gold sink and a chip is a
-- ticket, so the paytable is free: a 2,000x line hit prints nothing. What controls the economy instead is the
-- one rate at which chips are minted and the prices at the counter — two numbers, in two places, instead of
-- five paytables each arguing with a ceiling.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS chips BIGINT NOT NULL DEFAULT 0;

-- ── AND WHERE EVERY ONE OF THEM CAME FROM ────────────────────────────────────────────────────────────────────
-- Same shape as mkt_coin_event, and for the same reason: the day somebody has more chips than they should,
-- the only useful question is which spin or which purchase did it, and a balance column cannot answer that.
-- Append-only. `delta` is positive when minted by a machine and negative when spent at the counter.
CREATE TABLE IF NOT EXISTS mkt_chip_event (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    delta         BIGINT NOT NULL,
    balance_after BIGINT,
    -- What did it: "slot5", "slot5_free", "slot5_pick", "store", "grant".
    reason        TEXT NOT NULL,
    -- The machine id, or the store item id — whatever makes the row answerable on its own.
    ref           TEXT,
    meta          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mkt_chip_event_buyer_idx ON mkt_chip_event (buyer_id, created_at DESC);
-- For "how many chips did the floor mint today", which is the number that says whether the rate is right.
CREATE INDEX IF NOT EXISTS mkt_chip_event_day_idx ON mkt_chip_event (created_at DESC) WHERE delta > 0;

-- ── WHAT WAS BOUGHT AT THE COUNTER ───────────────────────────────────────────────────────────────────────────
-- One row per purchase. The catalog itself lives in code (prices are a balance decision that belongs beside
-- the machines, not in a table somebody can edit into a money printer) and this only records what was taken.
--
-- `item_id` is the catalog key. The UNIQUE index below is what stops a double-tap buying two of a
-- once-only item; repeatable items are excluded from it by `once`.
CREATE TABLE IF NOT EXISTS mkt_chip_purchase (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    price       BIGINT NOT NULL,
    once        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A PARTIAL index, and every ON CONFLICT against it must restate this WHERE clause or Postgres will not use
-- it and the guard silently does nothing — see the note in the codebase about the two weeks of lost writes
-- that cost us.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_chip_purchase_once_idx
    ON mkt_chip_purchase (buyer_id, item_id) WHERE once;
CREATE INDEX IF NOT EXISTS mkt_chip_purchase_buyer_idx ON mkt_chip_purchase (buyer_id, created_at DESC);
