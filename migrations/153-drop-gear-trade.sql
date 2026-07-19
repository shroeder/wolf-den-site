-- The parallel gear-trade system (migration 152) was reverted in favor of the existing trade builder
-- (/marketplace/trade/new + mkt_trade). This table was never used — drop it.
DROP TABLE IF EXISTS mkt_gear_trade;
