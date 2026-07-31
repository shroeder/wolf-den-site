-- Every physical count of the drawer, whether or not it changed anything.
--
-- reconcileCashBalance only writes a row when the count DISAGREES with the ledger, which is right for the
-- ledger but throws away the most useful fact: that somebody counted at all. Bracketing every shift with a
-- count is what turns "the drawer is $117 light, no idea when" into "it was right at 10:02 and light at 18:31",
-- which is the difference between a mystery and a lead.
--
-- expected_amount is the ledger balance at the moment of counting, so the drift is stored rather than
-- recomputed later against a balance that has since moved.
CREATE TABLE IF NOT EXISTS cash_count (
    id              BIGSERIAL PRIMARY KEY,
    counted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    counted_on      DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Chicago')::date),
    actual_amount   NUMERIC(12,2) NOT NULL,
    expected_amount NUMERIC(12,2) NOT NULL,
    delta           NUMERIC(12,2) NOT NULL,
    context         TEXT NOT NULL DEFAULT 'manual',   -- 'clock_in' | 'clock_out' | 'manual'
    counted_by      TEXT,
    note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_cash_count_when ON cash_count (counted_at DESC);
