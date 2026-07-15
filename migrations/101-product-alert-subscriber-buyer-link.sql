-- New-Arrival Alerts now require a marketplace account. Link a subscriber to the mkt_buyer it belongs
-- to so alerts can also go out as push notifications (not just email). Account emails are already
-- verified, so account subscribers skip the old double-opt-in.
ALTER TABLE product_alert_subscribers ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_alert_subscribers_buyer ON product_alert_subscribers (buyer_id);
