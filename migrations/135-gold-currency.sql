-- Spendable "gold" currency (separate from XP, which is level progression). Earned alongside XP from the
-- same actions; spent in the item shop. Backfill everyone's balance from their lifetime XP so existing
-- members start with gold matching their engagement.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS gold INT NOT NULL DEFAULT 0;
UPDATE mkt_buyer SET gold = COALESCE(xp, 0) WHERE gold = 0 AND COALESCE(xp, 0) > 0;
