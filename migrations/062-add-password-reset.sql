-- Password reset for marketplace accounts. Single active reset per account; only the token hash is
-- stored (same pattern as sessions), with a short expiry.

ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_mkt_buyer_reset_token ON mkt_buyer (reset_token_hash);
