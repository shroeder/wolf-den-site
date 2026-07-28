-- "Buy a round" social gold sink: track how many rounds a member has bought (for a future badge + telemetry).
ALTER TABLE mkt_tavern ADD COLUMN IF NOT EXISTS rounds INTEGER NOT NULL DEFAULT 0;
