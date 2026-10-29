-- ── RECORD THE ODDS EACH PACK WAS ACTUALLY DRAWN ON ─────────────────────────────────────────────────────────
-- alpha is the exponent that biases a draw away from expensive cards (weight = qty * dollars^-alpha). It is
-- never chosen: the price is fixed and TARGET_MARGIN_BP fixes the margin, so solveAlpha bisects for whichever
-- alpha lands the weighted EV on price * 0.85. That makes it a DERIVED number that moves on its own — every
-- card bought in, sold, or pulled changes the pool and the next recompute solves a new one. pkmn10 has already
-- travelled 0.53 -> 0.15 since its first open.
--
-- ⚠️ AND NONE OF IT WAS BEING KEPT. mkt_pack_pool_state holds ONE row per pool, overwritten on every
-- recompute, and mkt_pack_open recorded what came out but not the curve it came out of. So "was the 15% margin
-- actually holding in October" and "was this pull drawn on a 0.15 curve or a 0.72 one" had no answer, and no
-- way to get one: alpha depends on the exact shelf composition at that instant, which is not snapshotted
-- either. History that was not written cannot be recovered.
--
-- Stamping it on the open is the cheap half and the valuable half: one write, already in hand at draw time,
-- and it makes every pull auditable forever after.
ALTER TABLE mkt_pack_open
    ADD COLUMN IF NOT EXISTS draw_alpha NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS draw_floor_cents INTEGER,
    -- Whether the first-open shape applied. Derivable from the floor today, but only while FIRST_OPEN_FLOOR_BP
    -- keeps its current value — and a flag that answers the question directly will not rot when it changes.
    ADD COLUMN IF NOT EXISTS draw_first_open BOOLEAN;

-- The odds board as a FIRST-TIME opener will really experience it.
--
-- ⚠️ THE BOARD AND THE DRAW HAD DRIFTED APART. band_odds is computed as bandOdds(units, alpha) over every unit
-- in the band, and that one board is served to everybody — but a member's first open draws on first_open_alpha
-- over only the units at or above first_open_floor_cents. On mtg10 that makes "common", the single most likely
-- outcome on the board at 35.1%, impossible on a first open.
--
-- The mean is identical by design, so nobody is being sold a worse pack than advertised; it drifts in the
-- member's favour. It is still the shown odds failing to be the drawn odds, which is the one thing in this
-- feature that has to stay true, so the first-open board is stored alongside and served when it applies.
ALTER TABLE mkt_pack_pool_state
    ADD COLUMN IF NOT EXISTS first_open_band_odds JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pack_open_draw_alpha ON mkt_pack_open(pool, created_at DESC);
