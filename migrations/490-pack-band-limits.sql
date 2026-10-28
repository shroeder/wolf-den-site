-- ── THE BAND EACH TIER DRAWS FROM ───────────────────────────────────────────────────────────────────────────
-- Luke, 2026-10-27: "for the 5 and 10 dollar respectively their ceiling should be much lower relative to the
-- spend. And the 10 and 15 floor should be slightly higher respectively."
--
-- ⚠️ WEIGHTING ALONE WAS NOT ENOUGH, AND THIS IS WHY. Alpha kept every card reachable in every pack, which
-- is wonderful for the dream and wrong for the product: a $5 pack could hand over a $279 Tyranitar. That is
-- not a nice surprise — it is a $5 pack that occasionally costs us $279, and every bit of the variance
-- measured in scripts/pack-odds-100.mjs lives in exactly those pulls. It also made the $15 tier pointless,
-- because the cheap pack could already do everything the dear one could.
--
-- So a tier is now a BAND and a curve. The band decides what is reachable; alpha does the EV work inside it.
-- 0 in band_hi_cents means no ceiling.
--
-- ⚠️ THE CLAIM MUST READ THESE. A pool whose EV was solved over a band but whose draw ignores it is a pool
-- whose advertised odds are fiction — see pickWeightedVariation.
ALTER TABLE mkt_pack_pool_state
    ADD COLUMN IF NOT EXISTS band_lo_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS band_hi_cents INTEGER NOT NULL DEFAULT 0;
