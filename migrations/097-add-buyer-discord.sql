-- Link a marketplace account to its Discord user, so joining the server can grant XP (and future Discord
-- activity can too). Unique so one Discord account can't farm XP across multiple marketplace accounts.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_buyer_discord ON mkt_buyer (discord_user_id) WHERE discord_user_id IS NOT NULL;
