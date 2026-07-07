-- Email verification for marketplace accounts. New accounts start unverified and must confirm a
-- 6-digit code before they get a session. Existing accounts are grandfathered as verified so no one
-- is locked out.
ALTER TABLE mkt_buyer
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verify_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_verify_attempts INTEGER NOT NULL DEFAULT 0;

UPDATE mkt_buyer SET email_verified = TRUE WHERE email_verified = FALSE;
