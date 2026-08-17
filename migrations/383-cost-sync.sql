-- ── THE COST WE PAID SHOULD REACH SQUARE, OR SAY WHY IT DIDN'T ───────────────────────────────────────────────
-- Two cost stores exist and they do not talk to each other:
--
--   cogs_ledger        what we actually paid. Live and correct - the app writes it on every restock
--                      (source='app', current through 16 Aug).
--   Square             what the REPORTS read, via the wolfden_unit_cost custom attribute.
--
-- The restock tries to write both. The Square half is best-effort and fails silently three ways: the custom
-- attribute definition lookup is a runCatching that nulls the key for the WHOLE batch, the per-item write is a
-- bare runCatching with no onFailure, and neither is counted. When it fails, reporting falls back to Square's
-- native cost fields - which the app CANNOT write via the API, so they are frozen at whatever they were.
--
-- That is how 78 SKUs ended up costed off a stale native number (Ascended Heroes booster packs still say the
-- $13 we paid on 6 Jul, through two restocks at $12) and 199 more ended up with no cost at all, reporting
-- 33.5% of revenue as pure profit.
--
-- The fix is to stop treating the Square write as fire-and-forget. It becomes a RECONCILED state: we record
-- what cost each variation should carry, whether Square has it yet, and what went wrong if not - so a failure
-- is a visible, retryable row instead of a silence.

-- Which Square variation a purchase was for. The restock knows this at write time and simply never stored it,
-- which is why matching a ledger row to a catalog item has meant fuzzy name comparison - and why a naive
-- name match pairs "Pitch Black Sleeved Booster Pack" with a $40 booster BOX and reports a $32 discrepancy
-- that does not exist. Exact ids or nothing.
ALTER TABLE cogs_ledger ADD COLUMN IF NOT EXISTS variation_id TEXT;
CREATE INDEX IF NOT EXISTS cogs_ledger_variation_idx ON cogs_ledger (variation_id) WHERE variation_id IS NOT NULL;

-- One row per variation: the cost it SHOULD have, whether that reached Square, and the failure if it did not.
-- Keyed by variation rather than by ledger row because Square holds one number per item - syncing per purchase
-- would have five rows fighting over one field.
CREATE TABLE IF NOT EXISTS cost_sync (
    variation_id   TEXT PRIMARY KEY,
    item_name      TEXT,
    desired_cost   NUMERIC(12,2) NOT NULL,
    synced_cost    NUMERIC(12,2),
    -- pending: not yet attempted / desired has moved since the last success
    -- ok:      Square confirmed holding desired_cost
    -- failed:  attempted and refused; last_error says why
    -- skipped: deliberately not synced (consignment, store credit) - never retried
    state          TEXT NOT NULL DEFAULT 'pending',
    attempts       SMALLINT NOT NULL DEFAULT 0,
    last_error     TEXT,
    last_attempt_at TIMESTAMPTZ,
    synced_at      TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cost_sync DROP CONSTRAINT IF EXISTS cost_sync_state_known;
ALTER TABLE cost_sync ADD CONSTRAINT cost_sync_state_known
    CHECK (state IN ('pending', 'ok', 'failed', 'skipped'));

-- The sweeper asks one question - "what still needs writing" - so index exactly that. Retries back off on
-- attempts, so it is part of the key rather than a second lookup.
CREATE INDEX IF NOT EXISTS cost_sync_work_idx ON cost_sync (state, attempts, last_attempt_at)
    WHERE state IN ('pending', 'failed');
