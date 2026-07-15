-- Allow passwordless marketplace accounts. A /shop customer who has never set a marketplace password
-- is auto-provisioned an mkt_buyer (linked by email) so a single sign-in covers rewards/friends/wants.
-- They authenticate via the shop session; they can set a marketplace password later via reset. The
-- login/auth code already tolerates a null password_hash (authenticateBuyer returns null for it).
ALTER TABLE mkt_buyer ALTER COLUMN password_hash DROP NOT NULL;
