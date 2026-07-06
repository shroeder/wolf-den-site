-- Make "verified vendor" a real signal (it was hardcoded true). Verification is a manual trust
-- badge granted to vetted vendors.
ALTER TABLE mkt_vendor ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
