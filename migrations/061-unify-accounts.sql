-- One account per person. mkt_buyer IS the account; a "seller" is an account that has a linked vendor
-- profile (mkt_vendor.account_id). A buyer becomes a seller by getting a vendor profile attached — no
-- second account. Role is derived: linked active vendor -> seller, else buyer.

ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;

-- Backfill: every existing vendor (all invite-based, pre-accounts) gets an account with the SAME email
-- + password, so they log into the app with their current credentials and land as a seller.
INSERT INTO mkt_buyer (email, email_normalized, password_hash, display_name)
SELECT v.email, v.email_normalized, v.password_hash, v.display_name
FROM mkt_vendor v
WHERE v.password_hash IS NOT NULL AND v.email_normalized IS NOT NULL
ON CONFLICT (email_normalized) DO NOTHING;

UPDATE mkt_vendor v
SET account_id = b.id
FROM mkt_buyer b
WHERE b.email_normalized = v.email_normalized AND v.account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_mkt_vendor_account ON mkt_vendor (account_id);
