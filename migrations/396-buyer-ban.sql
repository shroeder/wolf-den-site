-- ── A BAN, WHICH THIS CODEBASE DID NOT HAVE ──────────────────────────────────────────────────────────────────
-- There was no way to stop an account. Revoking its sessions only signs it out, and it logs straight back in;
-- the Stockade is a pillory, which is a public shaming and deliberately not a lock. So the first time an
-- account genuinely had to be stopped, the answer was "we cannot".
--
-- `banned_at` is the switch and `ban_reason` is the record of why, because a ban with no stated reason is one
-- nobody can review later — including the person who set it. Enforced in resolveBuyerSession, which every
-- authenticated request goes through, so a ban takes effect on the next request rather than the next login.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS ban_reason TEXT;
