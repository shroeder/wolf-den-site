-- Referral loop: who referred each member + a one-time both-sides reward guard.
-- A member's public referral code IS their @handle (mkt_buyer.alias) — no separate code column needed.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS referral_reward_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_mkt_buyer_referred_by ON mkt_buyer(referred_by) WHERE referred_by IS NOT NULL;
