-- ⚠️ 450 CREATED AN INDEX THAT ALREADY EXISTED. `mkt_ship_expedition_day (buyer_id, opened_at DESC)` is
-- byte-identical to `mkt_ship_expedition_by_buyer (buyer_id, opened_at DESC)` from migration 449 — I wrote it
-- for the daily-allowance count without checking what 449 had already put there. Two identical btrees, both
-- written on every insert and on every one of the seven phase updates a journey makes, for no read benefit.
--
-- Migrations are spent on deploy, so 450 cannot be edited; this is the correction. The 449 index is the one
-- that stays, because it is the older name and the history read uses it too.
DROP INDEX IF EXISTS mkt_ship_expedition_day;
