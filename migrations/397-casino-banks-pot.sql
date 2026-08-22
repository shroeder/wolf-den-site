-- ── THREE BANKS AND ONE POT ──────────────────────────────────────────────────────────────────────────────────
-- The Piggy Banks are per player per machine, so they live on the meter row that already holds the tray and
-- the streak. `banks` is { copper: {coins,value}, silver: {...}, gold: {...} } — coins for the picture, value
-- in STAKE UNITS for the payout, because a bank filled at 25 and burst at 2,500 would pay a hundred times
-- what it was fed.
ALTER TABLE mkt_casino_meter ADD COLUMN IF NOT EXISTS banks JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The Pot is the opposite: ONE row for the whole floor. Every slot bet on every cabinet feeds it and any pull
-- on any machine can take it, which is the entire reason it is worth more than three private jackpots.
--
-- `seed` is the part held back to start the NEXT pot, so a pot that has just been won does not restart at
-- zero and read as broken. Both halves come out of the same contribution rate, so the return is still exactly
-- that rate — see potEv.
CREATE TABLE IF NOT EXISTS mkt_casino_pot (
    id          TEXT PRIMARY KEY,
    amount      BIGINT NOT NULL DEFAULT 0,
    seed        BIGINT NOT NULL DEFAULT 0,
    won_at      TIMESTAMPTZ,
    won_by      UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    won_amount  BIGINT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The floor's one pot, seeded so it never shows a zero on the wall. Idempotent: ON CONFLICT DO NOTHING, so a
-- second run cannot reset a pot that has been growing.
INSERT INTO mkt_casino_pot (id, amount, seed) VALUES ('floor', 5000, 0) ON CONFLICT (id) DO NOTHING;
