-- Sailing rework: one-way voyage to the island, then an excavation dig minigame. dig_state holds the active
-- dig board (grid depths, fragment location, stamina) as JSONB while digging; fragments counts treasure-chest
-- fragments recovered (10 → a chest, later). Both nullable/default so existing rows are unaffected.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_state JSONB;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS fragments INTEGER NOT NULL DEFAULT 0;
