-- ── A CLAIM STAMP FOR THE BADGE SWEEP ────────────────────────────────────────────────────────────────────────
-- /api/marketplace/auth/me fires syncEarnedBadges on EVERY call — 266,838 of them in three weeks, roughly 108
-- per member per day, because every page load asks who you are. Each sweep runs getMemberMetrics, and
-- getMemberMetrics is the two most buffer-hungry statements in the database: a seven-way COUNT over
-- mkt_activity_event (5,850 GB read, 17.9% of all buffer traffic) and a COUNT/SUM over boss_hit (3,371 GB,
-- 10.3%). Together with the mkt_xp_event aggregates they read a third of a terabyte a day to re-derive badges
-- that almost never change.
--
-- The sweep is a SAFETY NET, not the mechanism: every action that can actually earn a badge — a boss kill, an
-- auction sale, a bounty, a purchase — already calls syncEarnedBadges itself, at the moment it happens. So the
-- one on /auth/me exists to catch what those paths miss, and catching it within the hour is the same catch.
--
-- The column is a CLAIM, taken with a conditional UPDATE ... RETURNING rather than a read-then-write: two tabs
-- open at once would otherwise both see a stale timestamp and both sweep.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS badges_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN mkt_buyer.badges_synced_at IS
    'When the /auth/me safety-net badge sweep last ran for this member. Claimed atomically; hourly at most.';
