-- ── INDEXES NOBODY USES, PAID FOR ON EVERY WRITE ─────────────────────────────────────────────────────────────
-- Indexes are 325 MB of this 703 MB database — 46% of it — and pg_stat_user_indexes says the largest ones have
-- been scanned a handful of times in the database's entire life:
--
--     idx_activity_anon_created    14 MB    1 scan
--     idx_activity_device          16 MB    4 scans
--     idx_activity_country         16 MB    8 scans
--     idx_mkt_engagement_path     1.3 MB    1 scan
--     idx_mkt_engagement_geo      1.1 MB    3 scans
--     idx_mkt_listing_title_trgm  808 kB    0 scans
--
-- That is ~49 MB carried for 17 lookups. And an index is not free while it sits there: mkt_activity_event
-- takes ~220,000 inserts a month and every one of them maintained all three of those trees.
--
-- WHAT BREAKS: the admin telemetry screen's country/device/anon breakdowns now scan the table instead of an
-- index — ~284,000 rows, a second or so, on a screen that gets opened about monthly. If that becomes annoying,
-- the answer is a materialised daily rollup, not putting 46 MB back.
--
-- ⚠️ KEPT ON PURPOSE: idx_tcg_cards_name_trgm. It is the biggest single index in the database at 59 MB and it
-- has been scanned 12 times, which by the arithmetic above makes it the best candidate here — and it is the
-- one that is customer-facing. Card-name search on 362,450 rows without a trigram index is a sequential scan
-- in front of somebody standing at the counter. 59 MB is cheaper than that.
DROP INDEX IF EXISTS idx_activity_anon_created;
DROP INDEX IF EXISTS idx_activity_device;
DROP INDEX IF EXISTS idx_activity_country;
DROP INDEX IF EXISTS idx_mkt_engagement_path;
DROP INDEX IF EXISTS idx_mkt_engagement_geo;
DROP INDEX IF EXISTS idx_mkt_listing_title_trgm;
