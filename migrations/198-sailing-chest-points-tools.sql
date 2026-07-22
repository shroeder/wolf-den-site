-- Dig TOOLS rework: tools are random procs now, unlocked by CHEST-POINTS (tier-weighted chests forged) and
-- upgradable per-tool. Track the running chest-points total and each tool's invest level.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS chest_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS dig_tool_levels JSONB NOT NULL DEFAULT '{}'::jsonb;
