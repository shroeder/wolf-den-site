-- ── THE TOWN GATE ───────────────────────────────────────────────────────────────────────────────────────────
-- Luke: "any existing accounts will retain the ability to use all features regardless of their progress on
-- the grove. But any new accounts after we launch the grove will have this unlocking mechanism."
--
-- ⚠️ ONE NULLABLE COLUMN, NOT A BACKFILL. The obvious implementation is a flag set true for everyone who
-- exists today — which means writing ~200 rows at launch and being wrong about every account created in the
-- gap between the migration and the deploy. A NULL `gated_at` means "this account predates gating and is
-- exempt forever"; only accounts created after the switch get a timestamp, and the exemption needs no rows
-- written at all.
--
-- It is a TIMESTAMP rather than a boolean on purpose: when a member asks why a door is shut, the answer is
-- "your account started under gating, on this date", and support can read it.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS gated_at timestamptz;

-- Reading it happens on the hud request, which every game page makes once, so it rides a row that is already
-- being read. No index: the column is never a predicate, only a projection.

COMMENT ON COLUMN mkt_buyer.gated_at IS
    'When this account became subject to Grove town gating. NULL = created before gating, exempt forever.';
