-- ── THE ODDS, BY RARITY BAND, PER TIER ──────────────────────────────────────────────────────────────────────
-- Luke, 2026-10-27, showing a competitor's pack screen: "We should do something like this, otherwise all the
-- packs seem the same."
--
-- He is right, and it is the direct consequence of how the ladder was built. All three Pokemon tiers draw
-- from ONE shelf, so unit count, best card and the card list are identical across them — the only honest
-- difference is the ODDS, and the odds were the one thing the screen never showed.
--
-- ⚠️ STORED, NOT COMPUTED PER REQUEST. Each band is a weighted sum over every unit in the pool (900+ rows
-- for Pokemon) and the pack screen is read on every visit. recomputePools already walks that exact set to
-- solve alpha, so the bands cost nothing there and would cost a full scan per pool per request here.
--
-- ⚠️ AND THE BANDS ARE pack-rarity.js, NOT A NEW SET OF NAMES. The house already teaches common / uncommon /
-- rare / epic / legendary / mythic through the reveal flash, the vault tile and the pool board. Inventing a
-- second vocabulary for the same thing on the one screen where a member is deciding what to buy would mean
-- the colour they learn here is not the colour they see when the card lands.
ALTER TABLE mkt_pack_pool_state
    ADD COLUMN IF NOT EXISTS band_odds JSONB NOT NULL DEFAULT '[]'::jsonb;
