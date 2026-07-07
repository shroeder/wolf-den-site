-- Marks listings created by the Square inventory sync (Marketplace Intake in the admin app) so the
-- sync can safely upsert and prune only its own rows, never touching listings a vendor added by
-- hand or via CSV import. NULL source = not from the Square sync.
ALTER TABLE mkt_listing ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS idx_mkt_listing_source ON mkt_listing (vendor_id, source);
