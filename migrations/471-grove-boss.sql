-- ── THE BOSS AT THE END OF EACH ZONE ─────────────────────────────────────────────────────────────────────
-- Luke: "Each zone would end with a boss. Big health bar. Telegraphed attacks."
--
-- mkt_grove_zone already carried boss_done and first_clear_at from 468 — the FIRST kill, which is a
-- milestone and is written once. What was missing is the repeat: a boss is killable again on a timer, and
-- the timer is the only throttle on the hyper-rare faucet it feeds.
--
-- ⚠️ ONE TIMESTAMP PER ZONE, NOT ONE PER PLAYER. A single cooldown would mean killing the Mossmother locked
-- the Heartwood Elder out for half an hour, which reads as a bug to the player and would push everyone onto
-- whichever boss is cheapest. Per zone, twelve of them, so the map always has something to go and do.
ALTER TABLE mkt_grove_zone ADD COLUMN IF NOT EXISTS boss_at    timestamptz;
ALTER TABLE mkt_grove_zone ADD COLUMN IF NOT EXISTS boss_kills int NOT NULL DEFAULT 0;

-- ── A BANKED FREE SHIP UPGRADE ───────────────────────────────────────────────────────────────────────────
-- One of the hyper-rares Luke listed. The yard already knows how to hand an upgrade over for nothing — the
-- Shipwright's Debt settles one in three — but that is ROLLED at the counter, so there was nowhere to put a
-- free one somebody had already earned somewhere else.
--
-- ⚠️ A COUNT, NOT A FLAG. Two drops before you spend either must not silently become one.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS free_upgrades int NOT NULL DEFAULT 0;

-- plots need their own built-list, same shape as packs_built and banks_built.
ALTER TABLE mkt_grove_player ADD COLUMN IF NOT EXISTS plots_built text[] NOT NULL DEFAULT ARRAY[]::text[];
