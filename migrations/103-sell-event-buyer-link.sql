-- Attach Sell-Your-Cards intake and event RSVPs to a marketplace account when the submitter is signed
-- in (guest submissions still allowed — these are transactional leads, not subscriptions).
ALTER TABLE sell_inquiry ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
ALTER TABLE sell_offer ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS buyer_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sell_inquiry_buyer ON sell_inquiry (buyer_id);
CREATE INDEX IF NOT EXISTS idx_sell_offer_buyer ON sell_offer (buyer_id);
CREATE INDEX IF NOT EXISTS idx_event_signups_buyer ON event_signups (buyer_id);
