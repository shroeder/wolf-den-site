-- Track when a variation was last announced to Discord, so the one-time reconciliation backfill and
-- the live webhook poster never double-announce the same item. NULL = never announced (eligible for
-- backfill). Additive and idempotent; safe whether or not migration 030 has already been applied in
-- this environment.
ALTER TABLE discord_alert_inventory
    ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ;
