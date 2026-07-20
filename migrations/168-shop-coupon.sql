-- A single active shop coupon per member (granted by a login-proc item at the daily check-in). Applies to
-- the next gold-shop / consumable purchase at or under shop_coupon_max, then clears.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS shop_coupon_pct INT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS shop_coupon_max INT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS shop_coupon_at TIMESTAMPTZ;
