-- Bulletproof the daily boss-swing cap. The old enforcement counted boss_hit rows then inserted a new one;
-- even as a single conditional INSERT...SELECT that has a residual race under READ COMMITTED (two concurrent
-- requests both read count < cap before either commits), so a scripted simultaneous burst could sneak extra
-- swings. This per-(buyer, boss, day) counter is incremented with a single conditional UPDATE whose row lock
-- serializes concurrent writers — the second request blocks, then re-checks n < cap against the committed
-- value, so the cap can never be exceeded. Per-boss scoping preserved: a newly spawned boss = fresh swings.
CREATE TABLE IF NOT EXISTS mkt_boss_swing (
    buyer_id UUID NOT NULL,
    boss_id  UUID NOT NULL,
    day      DATE NOT NULL,
    n        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, boss_id, day)
);

-- Backfill today's counts from the existing manual boss_hit log so members who already swung today (via the
-- old path) don't get a fresh allotment the instant this ships.
INSERT INTO mkt_boss_swing (buyer_id, boss_id, day, n)
SELECT buyer_id, boss_id, (created_at AT TIME ZONE 'America/Chicago')::date AS day, COUNT(*)::int
FROM boss_hit
WHERE kind = 'manual'
  AND (created_at AT TIME ZONE 'America/Chicago')::date = (NOW() AT TIME ZONE 'America/Chicago')::date
GROUP BY buyer_id, boss_id, day
ON CONFLICT (buyer_id, boss_id, day) DO NOTHING;
