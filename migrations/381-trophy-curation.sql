-- ── THE CURATOR'S BONUS ──────────────────────────────────────────────────────────────────────────────────────
-- The Trophy Room shows every upgrade track in the game on one wall. This is how full that wall is, 0-100, and
-- it now pays: a standing % on every scrap of XP and gold you earn anywhere.
--
-- WHY A STORED COLUMN AND NOT A COMPUTATION. Working the number out means reading nine tables (arena, sailing,
-- mining, delve, kitchen, forge, farm, den, buyer). awardXp() runs on EVERY xp award in the game — its own
-- comments celebrate having REMOVED a single round-trip from that path — so the honest options were a cached
-- column or no feature. It is recomputed and written whenever the member opens their Trophy Room, which is
-- also the screen that explains what it does.
--
-- Kept as a plain smallint percentage rather than the raw built/buildable pair, because the ONLY consumer is a
-- multiplier and storing two numbers invites someone to re-derive the ratio a second, slightly different way.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS trophy_pct SMALLINT NOT NULL DEFAULT 0;

-- Guard-railed at the column so a bad write can never hand out a silly multiplier. The bonus curve lives in
-- code (CURATION_MAX_PCT in trophy-room.js); this only stops the input being nonsense.
ALTER TABLE mkt_buyer DROP CONSTRAINT IF EXISTS mkt_buyer_trophy_pct_sane;
ALTER TABLE mkt_buyer ADD CONSTRAINT mkt_buyer_trophy_pct_sane CHECK (trophy_pct >= 0 AND trophy_pct <= 100);
