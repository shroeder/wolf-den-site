-- ── THE INDEX THE BADGE SWEEP HAS ALWAYS NEEDED ──────────────────────────────────────────────────────────────
-- pg_stat_statements, three weeks of it (since the compute last restarted on 2026-08-13), says five queries
-- against mkt_xp_event account for 10,420 GB of buffer traffic — 32% of everything this database has touched,
-- across 1.94 MILLION calls. All five filter the same way:
--
--     WHERE buyer_id = $1 AND action = $2
--
-- and the only index on the table is btree(buyer_id). So Postgres finds the member's rows in the index and
-- then walks every one of them through the heap to test `action` — roughly 825 rows a member, ~4.5 MB of
-- buffers, to answer a question whose real answer is usually a handful of rows or a single COUNT.
--
-- (buyer_id, action, created_at) fixes all five at once, and three of them become index-only:
--   · COUNT(*) WHERE buyer_id AND action                        — 533,679 calls, 2,416 GB
--   · SELECT DISTINCT action WHERE buyer_id                     — 268,124 calls, 1,214 GB
--   · SELECT 1 WHERE buyer_id AND action AND created_at::date   — 268,124 calls, 1,170 GB
-- and the two SUM()s over points/meta still have to visit the heap, but only for rows that match the action
-- rather than for the member's entire history — 655,848 + 214,195 calls, 5,620 GB between them.
--
-- WHY THIS IS A COST FIX AND NOT A SPEED FIX. Neon bills a compute that sits at 1.00 CU every hour of every
-- day and has not suspended since 13 August. Actual query EXECUTION is only 9.6 CPU-hours out of ~528 CU-hours
-- billed in the same window — under 2%. What holds the autoscaler up is the working set, and the working set
-- is buffers touched. Reading a third less of the database is the lever; the milliseconds are a side effect.
CREATE INDEX IF NOT EXISTS mkt_xp_event_buyer_action_created_idx
    ON mkt_xp_event (buyer_id, action, created_at);

COMMENT ON INDEX mkt_xp_event_buyer_action_created_idx IS
    'Serves the badge-progress aggregates: (buyer_id, action) lookups, DISTINCT action, and the same-day check.';
