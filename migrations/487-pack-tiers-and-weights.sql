-- ── PRICE TIERS WITH WEIGHTED PULLS ─────────────────────────────────────────────────────────────────────────
-- Luke, 2026-10-27: "we need the different pack values with weighted pull rates to ensure we make money. With
-- a little magic early on to get people hooked." Then: "3 for pokemon and magic lets remove yu gi oh."
--
-- ⚠️ THIS INVERTS HOW A POOL IS PRICED, AND THAT IS THE WHOLE MIGRATION.
--
-- Until now the PRICE was derived from the pool: price = ceil(EV / $5) * $5, recomputed on a schedule, with a
-- hold so it could not climb on a member mid-session. A pool had one price and that price moved.
--
-- Now the price is FIXED at $5 / $10 / $15 and the DRAW is what moves. Each pool carries an `alpha`:
--
--     weight(card) ∝ quantity / (value_in_dollars ^ alpha)
--
-- alpha = 0 is the old uniform draw. Solving alpha against a target EV is what keeps a $5 pack and a $15 pack
-- both profitable out of the SAME shelf — see scripts/pack-weights.mjs, which is where these numbers came
-- from and which anybody retuning this should run first.
--
-- ⚠️ ev_cents NOW MEANS THE WEIGHTED EV, not the flat average of the pool. The flat average is still in
-- `uniform_ev_cents` because it is the thing to watch: if it drifts far above a pool's price, alpha has to
-- work harder and the tail gets thinner, which is a product problem before it is a money problem.

ALTER TABLE mkt_pack_pool_state
    ADD COLUMN IF NOT EXISTS alpha             NUMERIC(6,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS uniform_ev_cents  INTEGER      NOT NULL DEFAULT 0,
    -- The first-open "no dud" floor, in cents. 0 disables it. See first_open below.
    ADD COLUMN IF NOT EXISTS first_open_floor_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS first_open_alpha  NUMERIC(6,4) NOT NULL DEFAULT 0;

-- ⚠️ THE OLD POOLS ARE RETIRED BY NAME, NOT DELETED. mkt_pack_open.pool is a historical record of what a
-- member actually bought; deleting these rows would orphan every open already in the books and silently drop
-- them out of the telemetry's per-pool breakdown. They are closed instead, so nothing can be bought from them
-- and everything already bought still reports.
UPDATE mkt_pack_pool_state
   SET open = FALSE, closed_reason = 'retired_for_tiers'
 WHERE pool IN ('pkmn', 'mtg', 'ygo');

-- ⚠️ AND YU-GI-OH IS GONE ON PURPOSE, NOT BECAUSE IT BROKE. Its pool is 52 units averaging $6.58, so a $15
-- Yu-Gi-Oh pack would clear a 56% margin — not a win, a number somebody notices. It comes back when the
-- shelf is deep enough to float a ladder, and the pool registry keeps no copied card list, so that is a
-- one-line change when it does.

-- ── WHICH OPEN IS A MEMBER'S FIRST ──────────────────────────────────────────────────────────────────────────
-- ⚠️ COUNTED PER MEMBER ACROSS ALL POOLS, NEVER PER POOL. Per-pool would hand the same magic out six times,
-- which is six times the exposure and an obvious thing to farm: open the cheap one in each pool, sell back,
-- repeat. The first open is the first open, full stop.
--
-- ⚠️ AND IT IS ITS OWN TABLE RATHER THAN A COUNT OVER mkt_pack_open, because a member who opens a pack and
-- abandons the reveal leaves a row in 'pending' — counting those would spend the magic on a pack they never
-- saw. This row is written when the reveal COMPLETES.
CREATE TABLE IF NOT EXISTS mkt_pack_first_open (
    buyer_id    UUID PRIMARY KEY REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    pack_open_id UUID,
    pool        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: anybody who has already opened one has already had their first.
INSERT INTO mkt_pack_first_open (buyer_id, pack_open_id, pool, created_at)
SELECT DISTINCT ON (buyer_id) buyer_id, id, pool, created_at
  FROM mkt_pack_open
 WHERE outcome <> 'pending'
 ORDER BY buyer_id, created_at ASC
ON CONFLICT (buyer_id) DO NOTHING;

-- The weighted claim orders by a computed expression over the whole candidate set, so the index that matters
-- is the one that narrows to the candidates first. 486 already added (category_names) coverage via the feed;
-- this is the open-side lookup the first-open check does.
CREATE INDEX IF NOT EXISTS mkt_pack_open_buyer_done_idx
    ON mkt_pack_open (buyer_id, created_at)
    WHERE outcome <> 'pending';
